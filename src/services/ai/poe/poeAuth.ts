/**
 * Poe OAuth device code flow.
 * Uses Poe's OAuth device authorization endpoint.
 *
 * Step 1: POST /api/v1/oauth/device/code → get device_code + user_code
 * Step 2: Poll /api/v1/oauth/token until user authorizes
 */

const CLIENT_ID = 'opencode-poe';
const BASE = 'https://api.poe.com';
const DEVICE_CODE_URL = `${BASE}/api/v1/oauth/device/code`;
const TOKEN_URL = `${BASE}/api/v1/oauth/token`;

/** User-facing verification page. */
export const VERIFICATION_URL = 'https://poe.com/oauth';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

/**
 * Step 1: Request a device code from Poe.
 * User must visit VERIFICATION_URL and enter the user_code.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'api_access',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Poe device code request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<DeviceCodeResponse>;
}

/**
 * Step 2: Poll for authorization. Returns tokens when approved, null while pending.
 */
export async function pollForToken(deviceCode: string): Promise<TokenResponse | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  if (res.status === 401 || res.status === 403) return null;

  const data = await res.json();

  if (data.error === 'authorization_pending' || data.error === 'slow_down') return null;
  if (data.error === 'expired_token') {
    throw new Error('Device code expired. Please try again.');
  }
  if (data.error) {
    throw new Error(`Poe authorization failed: ${data.error} — ${data.error_description ?? ''}`);
  }

  return data as TokenResponse;
}

/**
 * Refresh an expired access token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Poe token refresh failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TokenResponse>;
}
