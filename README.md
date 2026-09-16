# MyWhoosh MCP Server

[![GitHub stars](https://img.shields.io/github/stars/mywhoosh-community/mywhoosh-mcp-server)](https://github.com/mywhoosh-community/mywhoosh-mcp-server/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/mywhoosh-community/mywhoosh-mcp-server)](https://github.com/mywhoosh-community/mywhoosh-mcp-server/network/members)
[![License](https://img.shields.io/github/license/mywhoosh-community/mywhoosh-mcp-server)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/mywhoosh-community/mywhoosh-mcp-server)

![MyWhoosh Logo](./docs/assets/mywhoosh-mcp-logo.png)

A Model Context Protocol (MCP) server for MyWhoosh that allows you to access the MyWhoosh API directly from your AI provider (like Cursor, Claude Desktop, etc.). Create workouts, manage training sessions, schedule tasks, and more - all through natural language.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mywhoosh-community/mywhoosh-mcp-server.git
cd mywhoosh-mcp-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the project

```bash
npm run build
```

The server acts as its own OAuth 2.1 authorization server (single pre-registered client — no dynamic client registration, no third-party identity provider) and exposes standard discovery/authorization endpoints (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource/mcp`, `/authorize`, `/token`) alongside `/mcp`. There are two deployment targets sharing the same tool implementations:

- **`src/index.ts`** — a Node/Express process (Railway, Render, Fly, a VPS, ...). In-memory OAuth/session state; needs an always-on process to stay reliable.
- **`src/workers/worker.ts`** — a Cloudflare Worker. OAuth codes/tokens persist in Workers KV instead of memory, since isolates aren't a persistent process.

### 4a. Deploy on Node (Railway, Render, ...)

Create a `.env` file (or set these on your host) with:

```bash
OAUTH_CLIENT_ID=a-long-random-id          # required — the "OAuth Client ID" you'll paste into Claude
OAUTH_CLIENT_SECRET=a-long-random-secret  # required — the "OAuth Client Secret" you'll paste into Claude
MYWHOOSH_USERNAME=you@example.com         # optional — auto-login on startup
MYWHOOSH_PASSWORD=your-password           # optional — auto-login on startup
PUBLIC_URL=https://your-app.example.com   # required in production — the externally reachable origin
PORT=3000                                 # optional, defaults to 3000
HOST=127.0.0.1                            # optional, defaults to 127.0.0.1
OAUTH_REDIRECT_URIS=https://claude.ai/api/mcp/auth_callback  # optional, comma-separated; this is the default
```

Generate `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET` with, e.g., `openssl rand -hex 32`. The server refuses to start without both. `PUBLIC_URL` must be the URL other services (Claude) will actually reach the server at — OAuth issuer URLs must be HTTPS except for `localhost`/`127.0.0.1`.

Start it with:

```bash
node build/index.js
```

An unauthenticated `GET /healthz` endpoint is available for readiness checks. A free tier here isn't reliable for this use case (services that sleep on inactivity wipe the in-memory OAuth/session state); budget for a small always-on plan (~$5/month).

### 4b. Deploy on Cloudflare Workers

The Worker build has no server process of its own — Cloudflare runs `src/workers/worker.ts`'s `fetch` handler per request. State (OAuth authorization codes, access/refresh tokens) lives in a Workers KV namespace bound as `OAUTH_KV`, which is why it survives fine on the free plan (no "sleeping" process to lose memory). See [Deploying to Cloudflare Workers](#deploying-to-cloudflare-workers) below for the full dashboard walkthrough.

Locally, `npm run dev:worker` runs it with `wrangler dev` (reads secrets from a git-ignored `.dev.vars` file), and `npm run typecheck:worker` type-checks just the Worker build.

### 5. Configure the MCP server in Claude

Add it as a custom connector, regardless of which deployment target you used:

1. Go to Settings → Connectors → Add custom connector.
2. Enter the server URL: `https://your-app.example.com/mcp` (your Railway/Render URL, or your `*.workers.dev` / custom domain).
3. Open "Advanced settings" and enter the same `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` you configured on the server.
4. Claude completes the OAuth flow (redirects to `/authorize`, then exchanges the code at `/token`) and connects.

For JSON-config-based clients that support remote HTTP MCP servers with OAuth (e.g. Cursor), point them at the URL — most will discover the OAuth metadata automatically:

```json
{
  "mcpServers": {
    "mywhoosh-mcp-server": {
      "type": "http",
      "url": "https://your-app.example.com/mcp"
    }
  }
}
```

Since this server disables dynamic client registration, a client that can't be given a manual Client ID/Secret (no "Advanced settings"-style field) will not be able to complete the OAuth flow.

## Deploying to Cloudflare Workers

1. **Create the KV namespace.** Dashboard → Storage & Databases → KV → Create. Name it e.g. `mywhoosh-oauth`. Copy its namespace ID.
2. **Put the ID in `wrangler.jsonc`.** Replace `REPLACE_WITH_KV_NAMESPACE_ID` in the committed `wrangler.jsonc` with that ID, commit, and push. This has to live in the repo (not just the dashboard) so it survives future Git-triggered redeploys.
3. **Connect the repo.** Dashboard → Workers & Pages → Create → Import a repository (Workers Builds) → pick this repo/branch. Cloudflare reads `wrangler.jsonc` and deploys `src/workers/worker.ts`.
4. **Add secrets.** On the Worker's page → Settings → Variables and Secrets → add as *encrypted* variables: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, and optionally `MYWHOOSH_USERNAME`/`MYWHOOSH_PASSWORD` for auto-login. These live outside the repo, unlike the KV id.
5. **Redeploy** (Settings changes generally trigger one automatically; otherwise trigger a deployment from the dashboard).
6. **Verify** `https://<your-worker>.workers.dev/healthz` returns `{"status":"ok"}`, then add the connector in Claude as described above using `https://<your-worker>.workers.dev/mcp`.

A custom domain can be attached under the Worker's Settings → Domains & Routes, if you don't want the `*.workers.dev` URL.

## Usage

After installation, you can use the MCP server directly in your AI provider. Examples:

- "Create a 30-minute interval workout"
- "Show me my scheduled training sessions"
- "Change my MyWhoosh settings"

## License

ISC License - see [LICENSE](LICENSE) file for details.

## Support

For issues or questions, please create an [Issue](https://github.com/mywhoosh-community/mywhoosh-mcp-server/issues) on GitHub.