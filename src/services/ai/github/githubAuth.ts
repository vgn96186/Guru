/**
 * GitHub OAuth device code flow for Copilot access.
 * Uses GitHub's OAuth device authorization endpoint.
 *
 * Step 1: POST /login/device/code → get device_code + user_code + verification_uri
 * Step 2: Poll /login/oauth/access_token until user authorizes
 */

const CLIENT_ID = 'Ov23li8tweQw6odWQebz';
const BASE = 'https://github.com';
const DEVICE_CODE_URL = `${BASE}/login/device/code`;
const ACCESS_TOKEN_URL = `${BASE}/login/oauth/access_token`;

/** User-facing verification page. */
export const VERIFICATION_URL = `${BASE}/login/device`;

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
  scope: string;
  expires_in?: number;
  refresh_token?: string;
}

/**
 * Step 1: Request a device code from GitHub.
 * User must visit VERIFICATION_URL and enter the user_code.
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'read:user',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub device code request failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    device_code: data.device_code,
    user_code: data.user_code,
    verification_uri: data.verification_uri,
    expires_in: data.expires_in ?? 900,
    interval: data.interval ?? 5,
  };
}

/**
 * Step 2: Poll for authorization. Returns tokens when approved, null while pending.
 */
export async function pollForToken(deviceCode: string): Promise<TokenResponse | null> {
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await res.json();

  if (data.error === 'authorization_pending') return null;
  if (data.error === 'slow_down') return null;
  if (data.error === 'expired_token') {
    throw new Error('Device code expired. Please try again.');
  }
  if (data.error) {
    throw new Error(`GitHub authorization failed: ${data.error} — ${data.error_description ?? ''}`);
  }

  return data as TokenResponse;
}
