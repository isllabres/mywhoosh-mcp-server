import { randomUUID, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidRequestError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface StoredAuthorizationCode {
  client: OAuthClientInformationFull;
  params: AuthorizationParams;
  expiresAt: number;
}

interface StoredAccessToken {
  clientId: string;
  scopes: string[];
  expiresAt: number;
  resource?: URL;
}

interface StoredRefreshToken {
  clientId: string;
  scopes: string[];
}

class SingleClientStore implements OAuthRegisteredClientsStore {
  constructor(private readonly client: OAuthClientInformationFull) {}

  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    return clientId === this.client.client_id ? this.client : undefined;
  }

  // No registerClient(): dynamic client registration is intentionally disabled.
  // There is exactly one pre-configured client (this server's owner); Claude
  // must be given OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET manually in the
  // connector's "Advanced settings" instead of self-registering.
}

/**
 * Minimal single-tenant OAuth 2.1 authorization server bundled into this MCP
 * server. There is exactly one confidential client (configured via
 * OAUTH_CLIENT_ID/OAUTH_CLIENT_SECRET) and no interactive login screen:
 * /authorize auto-approves, because the authorization code it returns is
 * worthless without the client_secret required at the /token endpoint. That
 * secret — known only to the server owner and whoever they paste it into
 * (Claude's connector settings) — is the real access gate.
 */
export class SingleClientOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore;

  private readonly codes = new Map<string, StoredAuthorizationCode>();
  private readonly accessTokens = new Map<string, StoredAccessToken>();
  private readonly refreshTokens = new Map<string, StoredRefreshToken>();

  constructor(client: OAuthClientInformationFull) {
    this.clientsStore = new SingleClientStore(client);
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!client.redirect_uris.includes(params.redirectUri)) {
      throw new InvalidRequestError('Unregistered redirect_uri');
    }

    const code = randomUUID();
    this.codes.set(code, { client, params, expiresAt: Date.now() + AUTHORIZATION_CODE_TTL_MS });

    const target = new URL(params.redirectUri);
    target.searchParams.set('code', code);
    if (params.state !== undefined) {
      target.searchParams.set('state', params.state);
    }
    res.redirect(target.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const entry = this.getValidCode(client, authorizationCode);
    return entry.params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<OAuthTokens> {
    const entry = this.getValidCode(client, authorizationCode);
    if (redirectUri && redirectUri !== entry.params.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the original authorization request');
    }

    this.codes.delete(authorizationCode);
    return this.issueTokens(client.client_id, entry.params.scopes ?? [], resource ?? entry.params.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<OAuthTokens> {
    const entry = this.refreshTokens.get(refreshToken);
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token');
    }

    this.refreshTokens.delete(refreshToken);
    return this.issueTokens(client.client_id, scopes ?? entry.scopes, resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = this.accessTokens.get(token);
    if (!entry || entry.expiresAt < Date.now() / 1000) {
      throw new InvalidTokenError('Invalid or expired token');
    }

    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
      expiresAt: entry.expiresAt,
      resource: entry.resource,
    };
  }

  private getValidCode(client: OAuthClientInformationFull, authorizationCode: string): StoredAuthorizationCode {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.expiresAt < Date.now()) {
      throw new InvalidGrantError('Invalid or expired authorization code');
    }
    if (entry.client.client_id !== client.client_id) {
      throw new InvalidGrantError('Authorization code was not issued to this client');
    }
    return entry;
  }

  private issueTokens(clientId: string, scopes: string[], resource?: URL): OAuthTokens {
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

    this.accessTokens.set(accessToken, { clientId, scopes, expiresAt, resource });
    this.refreshTokens.set(refreshToken, { clientId, scopes });

    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }
}
