#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import type { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { McpError, ErrorCode, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MyWhooshClient } from './clients/mywhoosh.js';
import { SingleClientOAuthProvider } from './auth/oauthProvider.js';
import type { ToolModule } from './tools/types.js';
import { SERVER_NAME, APP_VERSION } from './constants.js';

dotenv.config();

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const suffix = context ? ` ${JSON.stringify(context)}` : '';
  console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}${suffix}`);
}

async function loadAllTools(): Promise<ToolModule[]> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const toolsDir = join(__dirname, 'tools');

  try {
    const files = await readdir(toolsDir);
    const toolFiles = files.filter((f) => f.endsWith('.js') && !f.includes('utils'));
    const tools: ToolModule[] = [];

    for (const file of toolFiles) {
      try {
        const toolPath = join(toolsDir, file);
        const isWindows = process.platform === 'win32';
        const toolModule = await import(isWindows ? `file://${toolPath}` : toolPath);

        if (toolModule.method && toolModule.description && toolModule.parameters && toolModule.handler) {
          tools.push(toolModule as ToolModule);
          log('info', `Loaded tool: ${toolModule.method}`);
        }
      } catch (error: any) {
        log('error', `Failed to load tool: ${file}`, { error: error.message });
      }
    }

    return tools;
  } catch (error: any) {
    log('error', 'Failed to read tools directory', { error: error.message });
    return [];
  }
}

function buildServer(tools: ToolModule[], client: MyWhooshClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: APP_VERSION });

  for (const tool of tools) {
    server.tool(tool.method, tool.description, tool.parameters.shape, async (args: Record<string, unknown>) => {
      log('info', `Tool invocation: ${tool.method}`);
      try {
        return await tool.handler(args, { client });
      } catch (error: any) {
        log('error', `Tool failed: ${tool.method}`, { error: error.message });
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  return server;
}

async function run() {
  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    log('error', 'OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET environment variables are required to start the HTTP server');
    process.exit(1);
  }

  const tools = await loadAllTools();
  log('info', `Starting ${SERVER_NAME}@${APP_VERSION} with ${tools.length} tools`);

  const client = new MyWhooshClient();

  // Check for pre-configured credentials
  const username = process.env.MYWHOOSH_USERNAME;
  const password = process.env.MYWHOOSH_PASSWORD;

  if (username && password) {
    try {
      await client.login(username, password, 'mcp-server');
      log('info', 'Auto-authenticated with environment credentials');
    } catch (e: any) {
      log('warn', 'Auto-login failed', { error: e.message });
    }
  }

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  const host = process.env.HOST ?? '127.0.0.1';

  // PUBLIC_URL is the externally reachable origin (e.g. https://your-app.up.railway.app).
  // Defaults to the local bind address, which is only valid because the OAuth
  // issuer-URL check exempts localhost/127.0.0.1 from the HTTPS requirement.
  const publicUrl = new URL(process.env.PUBLIC_URL ?? `http://${host}:${port}`);
  const mcpServerUrl = new URL('/mcp', publicUrl);

  const redirectUris = (process.env.OAUTH_REDIRECT_URIS ?? 'https://claude.ai/api/mcp/auth_callback')
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);

  const oauthClient: OAuthClientInformationFull = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'client_secret_post',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };

  const provider = new SingleClientOAuthProvider(oauthClient);

  const app = createMcpExpressApp({ host });

  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: publicUrl,
      resourceServerUrl: mcpServerUrl,
      resourceName: SERVER_NAME,
      scopesSupported: ['mcp', 'offline_access'],
    })
  );

  const auth = requireBearerAuth({
    verifier: provider,
    requiredScopes: [],
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpServerUrl),
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            log('info', 'Session initialized', { sessionId: sid });
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            log('info', 'Transport closed, removing session', { sessionId: sid });
            delete transports[sid];
          }
        };

        const server = buildServer(tools, client);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      log('error', 'Error handling MCP request', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  };

  const mcpSessionHandler = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.post('/mcp', auth, mcpPostHandler);
  app.get('/mcp', auth, mcpSessionHandler);
  app.delete('/mcp', auth, mcpSessionHandler);

  const httpServer = app.listen(port, host, () => {
    log('info', `${SERVER_NAME} listening on http://${host}:${port}/mcp`);
    log('info', `OAuth issuer: ${publicUrl.href} (metadata at /.well-known/oauth-authorization-server)`);
  });

  const shutdown = async () => {
    log('info', 'Shutting down server...');
    for (const sessionId of Object.keys(transports)) {
      try {
        await transports[sessionId].close();
        delete transports[sessionId];
      } catch (error: any) {
        log('error', 'Error closing transport', { sessionId, error: error.message });
      }
    }
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

run().catch((error) => {
  log('error', 'Server failed to start', { error: error.message });
  process.exit(1);
});
