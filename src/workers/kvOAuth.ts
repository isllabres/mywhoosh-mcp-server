import type { Env } from './env.js';

const AUTHORIZATION_CODE_TTL_SECONDS = 300; // 5 minutes
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days, renewed on every rotation

export const SCOPES_SUPPORTED = ['mcp', 'offline_access'];

export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: string;
}

interface StoredCode {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
}

interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: string;
}

interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
}

function jsonError(status: number, error: string, description: string): Response {
  return new Response(JSON.stringify({ error, error_description: description }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function getRedirectUris(env: Env): string[] {
  return (env.OAUTH_REDIRECT_URIS ?? 'https://claude.ai/api/mcp/auth_callback')
    .split(',')
    .map((uri) => uri.trim())
    .filter(Boolean);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildAuthorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: SCOPES_SUPPORTED,
  };
}

export function buildProtectedResourceMetadata(resource: string, issuer: string, resourceName: string) {
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: SCOPES_SUPPORTED,
    resource_name: resourceName,
  };
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params = request.method === 'POST' ? await request.formData() : url.searchParams;
  const get = (key: string) => (params instanceof URLSearchParams ? params.get(key) : (params.get(key) as string | null));

  const clientId = get('client_id');
  const redirectUri = get('redirect_uri');
  const responseType = get('response_type');
  const codeChallenge = get('code_challenge');
  const codeChallengeMethod = get('code_challenge_method');
  const scope = get('scope');
  const state = get('state');
  const resource = get('resource');

  if (clientId !== env.OAUTH_CLIENT_ID) {
    return jsonError(400, 'invalid_client', 'Unknown client_id');
  }

  const redirectUris = getRedirectUris(env);
  const effectiveRedirectUri = redirectUri ?? (redirectUris.length === 1 ? redirectUris[0] : undefined);
  if (!effectiveRedirectUri || !redirectUris.includes(effectiveRedirectUri)) {
    return jsonError(400, 'invalid_request', 'Unregistered redirect_uri');
  }

  if (responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
    const target = new URL(effectiveRedirectUri);
    target.searchParams.set('error', 'invalid_request');
    target.searchParams.set('error_description', 'response_type must be "code" with S256 PKCE');
    if (state) target.searchParams.set('state', state);
    return Response.redirect(target.toString(), 302);
  }

  const code = randomToken();
  const stored: StoredCode = {
    clientId,
    redirectUri: effectiveRedirectUri,
    codeChallenge,
    scopes: scope ? scope.split(' ') : [],
    resource: resource ?? undefined,
  };
  await env.OAUTH_KV.put(`code:${code}`, JSON.stringify(stored), { expirationTtl: AUTHORIZATION_CODE_TTL_SECONDS });

  const target = new URL(effectiveRedirectUri);
  target.searchParams.set('code', code);
  if (state) target.searchParams.set('state', state);
  return Response.redirect(target.toString(), 302);
}

async function issueTokens(env: Env, clientId: string, scopes: string[], resource?: string): Promise<Response> {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

  const accessRecord: StoredAccessToken = { clientId, scopes, expiresAt, resource };
  const refreshRecord: StoredRefreshToken = { clientId, scopes };

  await env.OAUTH_KV.put(`access:${accessToken}`, JSON.stringify(accessRecord), {
    expirationTtl: ACCESS_TOKEN_TTL_SECONDS,
  });
  await env.OAUTH_KV.put(`refresh:${refreshToken}`, JSON.stringify(refreshRecord), {
    expirationTtl: REFRESH_TOKEN_TTL_SECONDS,
  });

  return new Response(
    JSON.stringify({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}

export async function handleToken(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return jsonError(400, 'invalid_request', 'Expected application/x-www-form-urlencoded body');
  }

  const body = new URLSearchParams(await request.text());
  const clientId = body.get('client_id');
  const clientSecret = body.get('client_secret');
  const grantType = body.get('grant_type');

  if (clientId !== env.OAUTH_CLIENT_ID || !clientSecret || !timingSafeEqual(clientSecret, env.OAUTH_CLIENT_SECRET)) {
    return jsonError(400, 'invalid_client', 'Invalid client_id or client_secret');
  }

  if (grantType === 'authorization_code') {
    const code = body.get('code');
    const codeVerifier = body.get('code_verifier');
    const redirectUri = body.get('redirect_uri');
    const resource = body.get('resource') ?? undefined;

    if (!code || !codeVerifier) {
      return jsonError(400, 'invalid_request', 'Missing code or code_verifier');
    }

    const raw = await env.OAUTH_KV.get(`code:${code}`);
    if (!raw) {
      return jsonError(400, 'invalid_grant', 'Invalid or expired authorization code');
    }
    const stored = JSON.parse(raw) as StoredCode;
    await env.OAUTH_KV.delete(`code:${code}`);

    if (stored.clientId !== clientId) {
      return jsonError(400, 'invalid_grant', 'Authorization code was not issued to this client');
    }
    if (redirectUri && redirectUri !== stored.redirectUri) {
      return jsonError(400, 'invalid_grant', 'redirect_uri does not match the original authorization request');
    }

    const expectedChallenge = await sha256Base64Url(codeVerifier);
    if (expectedChallenge !== stored.codeChallenge) {
      return jsonError(400, 'invalid_grant', 'code_verifier does not match the challenge');
    }

    return issueTokens(env, clientId, stored.scopes, resource ?? stored.resource);
  }

  if (grantType === 'refresh_token') {
    const refreshToken = body.get('refresh_token');
    const resource = body.get('resource') ?? undefined;
    if (!refreshToken) {
      return jsonError(400, 'invalid_request', 'Missing refresh_token');
    }

    const raw = await env.OAUTH_KV.get(`refresh:${refreshToken}`);
    if (!raw) {
      return jsonError(400, 'invalid_grant', 'Invalid refresh token');
    }
    const stored = JSON.parse(raw) as StoredRefreshToken;
    await env.OAUTH_KV.delete(`refresh:${refreshToken}`);

    if (stored.clientId !== clientId) {
      return jsonError(400, 'invalid_grant', 'Refresh token was not issued to this client');
    }

    return issueTokens(env, clientId, stored.scopes, resource);
  }

  return jsonError(400, 'unsupported_grant_type', `Grant type "${grantType}" is not supported`);
}

export async function verifyAccessToken(token: string, env: Env): Promise<AuthInfo | null> {
  const raw = await env.OAUTH_KV.get(`access:${token}`);
  if (!raw) return null;

  const stored = JSON.parse(raw) as StoredAccessToken;
  if (stored.expiresAt < Date.now() / 1000) return null;

  return { token, clientId: stored.clientId, scopes: stored.scopes, expiresAt: stored.expiresAt, resource: stored.resource };
}
