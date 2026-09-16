import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { tools } from '../tools/index.js';
import { SERVER_NAME, APP_VERSION } from '../constants.js';
import type { Env } from './env.js';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  handleAuthorize,
  handleToken,
  verifyAccessToken,
} from './kvOAuth.js';

// Module-scope cache: reused across requests handled by the same warm isolate,
// so we don't re-login to MyWhoosh on every single MCP call. Only skipped when
// the cached client isn't actually authenticated yet, so a cold start before
// credentials were configured (or a transient login failure) retries on the
// next request instead of being stuck unauthenticated for the isolate's life.
let cachedClient: MyWhooshClient | undefined;

async function getClient(env: Env): Promise<MyWhooshClient> {
  if (cachedClient?.isAuthenticated()) return cachedClient;

  const client = cachedClient ?? new MyWhooshClient();
  if (env.MYWHOOSH_USERNAME && env.MYWHOOSH_PASSWORD) {
    try {
      await client.login(env.MYWHOOSH_USERNAME, env.MYWHOOSH_PASSWORD, 'mcp-worker');
    } catch (error: any) {
      console.error('Auto-login failed', error?.message ?? error);
    }
  }

  cachedClient = client;
  return client;
}

function buildServer(client: MyWhooshClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: APP_VERSION });

  for (const tool of tools) {
    server.tool(tool.method, tool.description, tool.parameters.shape, async (args: Record<string, unknown>) => {
      try {
        return await tool.handler(args, { client });
      } catch (error: any) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  return server;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function unauthorized(resourceMetadataUrl: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Missing or invalid access token' }, id: null }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
      },
    }
  );
}

function methodNotAllowed(): Response {
  return jsonResponse(
    { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. This server only supports stateless POST /mcp.' }, id: null },
    405
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const issuer = url.origin;
    const mcpResource = `${issuer}/mcp`;
    const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource/mcp`;

    if (url.pathname === '/healthz' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' });
    }

    if (url.pathname === '/.well-known/oauth-authorization-server' && request.method === 'GET') {
      return jsonResponse(buildAuthorizationServerMetadata(issuer));
    }

    if (url.pathname === '/.well-known/oauth-protected-resource/mcp' && request.method === 'GET') {
      return jsonResponse(buildProtectedResourceMetadata(mcpResource, issuer, SERVER_NAME));
    }

    if (url.pathname === '/authorize' && (request.method === 'GET' || request.method === 'POST')) {
      return handleAuthorize(request, env);
    }

    if (url.pathname === '/token' && request.method === 'POST') {
      return handleToken(request, env);
    }

    if (url.pathname === '/mcp') {
      if (request.method !== 'POST') {
        return methodNotAllowed();
      }

      const authHeader = request.headers.get('authorization');
      const [scheme, token] = authHeader?.split(' ') ?? [];
      if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return unauthorized(resourceMetadataUrl);
      }

      const info = await verifyAccessToken(token, env);
      if (!info) {
        return unauthorized(resourceMetadataUrl);
      }

      const client = await getClient(env);
      const server = buildServer(client);
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);

      return transport.handleRequest(request, {
        authInfo: {
          token: info.token,
          clientId: info.clientId,
          scopes: info.scopes,
          expiresAt: info.expiresAt,
          resource: info.resource ? new URL(info.resource) : undefined,
        },
      });
    }

    return jsonResponse({ error: 'not_found' }, 404);
  },
};
