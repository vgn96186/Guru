/**
 * ChatGPT OAuth device code flow.
 * Uses the same 3-step flow as OpenAI Codex CLI (codex-rs).
 *
 * Step 1: POST /api/accounts/deviceauth/usercode → get device_auth_id + user_code
 * Step 2: POST /api/accounts/deviceauth/token    → poll until authorization_code returned
 * Step 3: POST /oauth/token                      → exchange code for access + refresh tokens
 */

const CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const BASE = 'https://auth.openai.com';
const USERCODE_URL = `${BASE}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${BASE}/api/accounts/deviceauth/token`;
const OAUTH_TOKEN_URL = `${BASE}/oauth/token`;
const REDIRECT_URI = `${BASE}/deviceauth/callback`;

/** User-facing verification page. */
export const VERIFICATION_URL = `${BASE}/codex/device`;

export interface DeviceCodeResponse {
  device_auth_id: string;
  user_code: string;
  interval: number;
  expires_in: number;
}

export interface PollResult {
  authorization_code: string;
  code_challenge: string;
  code_verifier: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

/**
 * Step 1: Request a device code from OpenAI.
 * User must visit VERIFICATION_URL and enter the user_code.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(USERCODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Device code request failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    device_auth_id: data.device_auth_id,
    user_code: data.user_code ?? data.usercode,
    interval: data.interval ?? 5,
    expires_in: data.expires_in ?? 900,
  };
}

/**
 * Step 2: Poll for authorization. Returns null while pending, throws on expiry/error.
 * On success returns authorization_code + code_verifier for token exchange.
 */
export async function pollForAuthorization(
  deviceAuthId: string,
  userCode: string,
): Promise<PollResult | null> {
  const res = await fetch(DEVICE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }),
  });

  // 401/403 = still pending
  if (res.status === 401 || res.status === 403) return null;

  const data = await res.json();

  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return null;
  }
  if (data.error) {
    throw new Error(`Authorization failed: ${data.error} — ${data.error_description ?? ''}`);
  }
  if (!data.authorization_code) {
    // Not yet authorized
    return null;
  }
  return data as PollResult;
}

/**
 * Step 3: Exchange authorization_code + code_verifier for access + refresh tokens.
 */
export async function exchangeForTokens(
  authorizationCode: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code: authorizationCode,
      code_verifier: codeVerifier,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/**
 * Refresh an expired access token. OpenAI uses single-use refresh tokens,
 * so the new refresh_token must be persisted immediately.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}

/**
 * Decode the `chatgpt-account-id` from a JWT access_token.
 * Falls back to empty string if decoding fails (non-critical).
 */
export function extractAccountIdFromJwt(accessToken: string): string {
  try {
    const parts = accessToken.split('.');
    if (parts.length < 2) return '';
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded));
    return (
      json['https://api.openai.com/auth']?.['user_id'] ??
      json['chatgpt_account_id'] ??
      json['sub'] ??
      ''
    );
  } catch {
    return '';
  }
}
