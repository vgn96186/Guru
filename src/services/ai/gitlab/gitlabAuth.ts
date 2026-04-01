/**
 * GitLab Duo OAuth2 + PKCE flow.
 *
 * Uses GitLab OAuth2 authorization code grant with PKCE for secure
 * browser-based auth. Suitable for mobile/CLI apps.
 *
 * Redirect URI: register the same value in your GitLab OAuth application
 * (e.g. guru-study://oauth/gitlab). Override with EXPO_PUBLIC_GITLAB_REDIRECT_URI if needed.
 *
 * Application ID: EXPO_PUBLIC_GITLAB_CLIENT_ID at build time, or user_profile.gitlab_oauth_client_id
 * (paste in Settings) — see {@link resolveGitLabClientId}.
 */

import * as Crypto from 'expo-crypto';

import { getGitLabInstanceUrl } from './gitlabInstance';

export { getGitLabInstanceUrl, getGitLabAiGatewayUrl } from './gitlabInstance';

/** Placeholder — GitLab rejects unless redirect URI matches a real app you own. */
export const GITLAB_CLIENT_ID_FALLBACK = 'opencode-gitlab-duo';

/** Path segment after scheme; deep link is `${scheme}://${path}`. */
export const GITLAB_OAUTH_CALLBACK_PATH = 'oauth/gitlab';

/**
 * Effective OAuth `client_id`: pasted profile value wins, then env, then placeholder.
 */
export function resolveGitLabClientId(fromProfile?: string | null): string {
  const fromProfileTrim = (fromProfile ?? '').trim();
  if (fromProfileTrim) return fromProfileTrim;
  return process.env.EXPO_PUBLIC_GITLAB_CLIENT_ID?.trim() || GITLAB_CLIENT_ID_FALLBACK;
}

/** Env-only client id (no Settings paste). Prefer {@link resolveGitLabClientId} for OAuth. */
export function getClientId(): string {
  return resolveGitLabClientId(null);
}

export function usesDefaultGitLabClientId(fromProfile?: string | null): boolean {
  return resolveGitLabClientId(fromProfile) === GITLAB_CLIENT_ID_FALLBACK;
}

/**
 * Must match the "Redirect URI" configured on the GitLab OAuth application exactly.
 */
export function getRedirectUri(): string {
  const fromEnv = process.env.EXPO_PUBLIC_GITLAB_REDIRECT_URI?.trim();
  if (fromEnv) return fromEnv;
  return `guru-study://${GITLAB_OAUTH_CALLBACK_PATH}`;
}

async function sha256Base64Url(verifier: string): Promise<string> {
  const b64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface AuthUrlResult {
  url: string;
  codeVerifier: string;
  state: string;
  /** Same `client_id` sent to /oauth/authorize — store with PKCE session for token exchange. */
  oauthClientId: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  return sha256Base64Url(verifier);
}

/**
 * Step 1: Build the authorization URL with PKCE challenge.
 * `profileClientId` — value from Settings (paste); empty uses env / fallback via {@link resolveGitLabClientId}.
 */
export async function buildAuthUrl(profileClientId?: string | null): Promise<AuthUrlResult> {
  const oauthClientId = resolveGitLabClientId(profileClientId);
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: oauthClientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    // OpenCode GitLab OAuth uses `api` for third_party_agents/direct_access + AI Gateway.
    scope: 'read_user api',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${getGitLabInstanceUrl()}/oauth/authorize?${params.toString()}`,
    codeVerifier,
    state,
    oauthClientId,
  };
}

/**
 * Step 3: Exchange authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  oauthClientId: string,
  /** Confidential OAuth apps on GitLab (default) require this on `/oauth/token`. */
  clientSecret?: string | null,
): Promise<TokenResponse> {
  // GitLab (Doorkeeper) expects form body — JSON often yields 400 / invalid_request.
  const body = new URLSearchParams({
    client_id: oauthClientId,
    code,
    code_verifier: codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: getRedirectUri(),
  });
  const secret = (clientSecret ?? '').trim();
  if (secret) body.set('client_secret', secret);

  const res = await fetch(`${getGitLabInstanceUrl()}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitLab token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  oauthClientId: string,
  clientSecret?: string | null,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: oauthClientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const secret = (clientSecret ?? '').trim();
  if (secret) body.set('client_secret', secret);

  const res = await fetch(`${getGitLabInstanceUrl()}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitLab token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export interface ParsedGitLabOAuthCallback {
  code?: string;
  state?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Recognizes app deep links and pasted redirect URLs containing OAuth query params.
 */
export function parseGitLabOAuthCallback(rawUrl: string): ParsedGitLabOAuthCallback | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const hasOAuthPath =
    lower.startsWith('guru-study://oauth/gitlab') || /:\/\/oauth\/gitlab(\?|#|$)/.test(lower);

  if (!hasOAuthPath) return null;

  let query = '';
  const qIdx = trimmed.indexOf('?');
  const hashIdx = trimmed.indexOf('#');
  if (qIdx !== -1) {
    query = trimmed.slice(qIdx + 1);
    if (hashIdx !== -1 && hashIdx > qIdx) {
      query = query.split('#')[0];
    }
  } else if (hashIdx !== -1) {
    query = trimmed.slice(hashIdx + 1);
  }

  const params = new URLSearchParams(query);
  const code = params.get('code') ?? undefined;
  const state = params.get('state') ?? undefined;
  const error = params.get('error') ?? undefined;
  const errorDescription = params.get('error_description') ?? undefined;

  if (!code && !error && !state) return null;

  return { code, state, error, errorDescription };
}
