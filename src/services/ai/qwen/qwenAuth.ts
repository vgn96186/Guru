/**
 * Qwen OAuth Device Flow (RFC 8628)
 *
 * Endpoints (from official Qwen Code CLI source):
 * - Device Code: POST https://chat.qwen.ai/api/v1/oauth2/device/code
 * - Token:       POST https://chat.qwen.ai/api/v1/oauth2/token
 * - API Base:    https://portal.qwen.ai/v1 (OpenAI-compatible)
 *
 * Free tier: 60 req/min, 1,000 req/day
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// ─── Constants ───────────────────────────────────────────────────────────────

const QWEN_OAUTH_BASE_URL = 'https://chat.qwen.ai';
const QWEN_DEVICE_CODE_ENDPOINT = '/api/v1/oauth2/device/code';
const QWEN_TOKEN_ENDPOINT = '/api/v1/oauth2/token';
export const QWEN_CLIENT_ID = 'f0304373b74a44d2b584a3fb70ca9e56';
const QWEN_SCOPES = 'openid profile email model.completion';

export const QWEN_MODELS = ['qwen3-coder-plus'] as const;

// Default API base URL for OAuth tokens — portal.qwen.ai accepts OAuth bearer tokens.
// DashScope (dashscope.aliyuncs.com) requires a separate DashScope API key and does NOT
// accept OAuth access_tokens from chat.qwen.ai.
export const QWEN_OAUTH_DEFAULT_BASE_URL = 'https://portal.qwen.ai/v1';

/**
 * Resolve the API base URL from a resource_url (returned by the OAuth token endpoint).
 * Follows the same logic as Cline/Roo-Code's QwenCodeHandler.getBaseUrl().
 */
export function resolveQwenBaseUrl(resourceUrl?: string): string {
  let baseUrl = resourceUrl || QWEN_OAUTH_DEFAULT_BASE_URL;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  // Remove trailing /v1 so we always append it consistently
  baseUrl = baseUrl.replace(/\/v1\/?$/, '');
  return `${baseUrl}/v1`;
}

export type QwenModel = (typeof QWEN_MODELS)[number];

// Secure storage keys
const QWEN_ACCESS_TOKEN_KEY = 'qwen_access_token';
const QWEN_REFRESH_TOKEN_KEY = 'qwen_refresh_token';
const QWEN_TOKEN_EXPIRY_KEY = 'qwen_token_expiry';
const QWEN_API_KEY_KEY = 'qwen_api_key';
const QWEN_RESOURCE_URL_KEY = 'qwen_resource_url';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QwenDeviceAuthorization {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
  code_verifier: string;
}

export interface QwenTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  api_key?: string;
  resource_url?: string;
}

export interface QwenStoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  apiKey?: string;
  resourceUrl?: string;
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  const bytes = Crypto.getRandomBytes(32);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  // Convert base64 to base64url
  return hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ─── Device Authorization ────────────────────────────────────────────────────

export async function requestDeviceCode(): Promise<QwenDeviceAuthorization> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: QWEN_CLIENT_ID,
    scope: QWEN_SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  if (__DEV__) {
    console.log(`[Qwen OAuth] === DEVICE CODE REQUEST ===`);
    console.log(`[Qwen OAuth] Endpoint: ${QWEN_OAUTH_BASE_URL}${QWEN_DEVICE_CODE_ENDPOINT}`);
    console.log(`[Qwen OAuth] Client ID: ${QWEN_CLIENT_ID}`);
    console.log(`[Qwen OAuth] Scope: ${QWEN_SCOPES}`);
    console.log(`[Qwen OAuth] Request body: ${params.toString()}`);
  }

  const response = await fetch(`${QWEN_OAUTH_BASE_URL}${QWEN_DEVICE_CODE_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (__DEV__) {
    console.log(
      `[Qwen OAuth] Device code response status: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => String(response.status));
    if (__DEV__) {
      console.error(`[Qwen OAuth] Device code error response:`, text);
    }
    throw new Error(`Device code request failed: HTTP ${response.status} - ${text}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  if (__DEV__) {
    console.log(`[Qwen OAuth] Device code response:`, JSON.stringify(data, null, 2));
  }

  if (data.error) {
    throw new Error(`Device authorization error: ${data.error}: ${data.error_description || ''}`);
  }

  const result: QwenDeviceAuthorization = {
    device_code: String(data.device_code),
    user_code: String(data.user_code),
    verification_uri: String(data.verification_uri),
    verification_uri_complete: String(data.verification_uri_complete),
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 300,
    interval: typeof data.interval === 'number' ? data.interval : 5,
    code_verifier: codeVerifier,
  };

  if (__DEV__) {
    console.log(`[Qwen OAuth] Device code obtained. User code: ${result.user_code}`);
    console.log(
      `[Qwen OAuth] Verification URL: ${result.verification_uri_complete?.slice(0, 80)}...`,
    );
    console.log(`[Qwen OAuth] Expires in: ${result.expires_in}s, Interval: ${result.interval}s`);
    console.log(`[Qwen OAuth] ================================`);
  }

  return result;
}

// ─── Token Polling ───────────────────────────────────────────────────────────

export async function pollForToken(
  deviceCode: string,
  codeVerifier: string,
  intervalSeconds: number,
  expiresIn: number,
  onStatusChange?: (status: 'waiting' | 'slow_down') => void,
): Promise<QwenTokenResponse> {
  const timeoutMs = expiresIn * 1000;
  const startTime = Date.now();
  let currentInterval = intervalSeconds * 1000;
  let pollCount = 0;

  if (__DEV__) {
    console.log(`[Qwen OAuth] === TOKEN POLLING START ===`);
    console.log(`[Qwen OAuth] Device code: ${deviceCode.slice(0, 20)}...`);
    console.log(`[Qwen OAuth] Timeout: ${expiresIn}s, Interval: ${intervalSeconds}s`);
  }

  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, currentInterval));
    pollCount++;

    const params = new URLSearchParams({
      client_id: QWEN_CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      code_verifier: codeVerifier,
    });

    if (__DEV__ && pollCount <= 3) {
      console.log(`[Qwen OAuth] Poll #${pollCount}: ${params.toString().slice(0, 100)}...`);
    }

    const response = await fetch(`${QWEN_OAUTH_BASE_URL}${QWEN_TOKEN_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (__DEV__ && pollCount <= 3) {
      console.log(`[Qwen OAuth] Poll #${pollCount} response: ${response.status}`);
    }

    if (response.ok) {
      const data = (await response.json()) as Record<string, unknown>;

      if (__DEV__) {
        console.log(`[Qwen OAuth] === TOKEN RESPONSE ===`);
        console.log(`[Qwen OAuth] Full response keys:`, Object.keys(data).join(', '));
        console.log(
          `[Qwen OAuth] access_token:`,
          data.access_token ? `YES (${String(data.access_token).slice(0, 40)}...)` : 'NO',
        );
        console.log(
          `[Qwen OAuth] refresh_token:`,
          data.refresh_token ? `YES (${String(data.refresh_token).slice(0, 30)}...)` : 'NO',
        );
        console.log(
          `[Qwen OAuth] api_key:`,
          data.api_key ? `YES (${String(data.api_key).slice(0, 40)}...)` : 'NO',
        );
        console.log(`[Qwen OAuth] token_type:`, data.token_type || 'not set');
        console.log(`[Qwen OAuth] expires_in:`, data.expires_in || 'not set');
        console.log(`[Qwen OAuth] resource_url:`, data.resource_url || 'not set');
        if (data.resource_url) {
          console.log(`[Qwen OAuth] >>> API base URL from token response: ${data.resource_url}`);
        }
        console.log(`[Qwen OAuth] ================================`);
      }

      return {
        access_token: String(data.access_token),
        refresh_token: data.refresh_token ? String(data.refresh_token) : undefined,
        expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
        api_key: data.api_key ? String(data.api_key) : undefined,
        resource_url: data.resource_url ? String(data.resource_url) : undefined,
      };
    }

    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const error = String(errorData.error || '');

    if (__DEV__ && pollCount <= 3) {
      console.log(
        `[Qwen OAuth] Poll #${pollCount} error: ${error} - ${errorData.error_description || ''}`,
      );
    }

    if (error === 'authorization_pending') {
      onStatusChange?.('waiting');
      continue;
    }
    if (error === 'slow_down') {
      currentInterval += 5000;
      onStatusChange?.('slow_down');
      continue;
    }
    if (error === 'expired_token') {
      if (__DEV__) {
        console.error(`[Qwen OAuth] Device code expired after ${pollCount} polls`);
      }
      throw new Error('Device code expired. Please try again.');
    }
    if (error === 'access_denied') {
      if (__DEV__) {
        console.error(`[Qwen OAuth] Authorization denied after ${pollCount} polls`);
      }
      throw new Error('Authorization was denied.');
    }

    if (__DEV__) {
      console.error(
        `[Qwen OAuth] Unexpected error: ${error} - ${errorData.error_description || ''}`,
      );
    }
    throw new Error(String(errorData.error_description || errorData.error || 'Unknown error'));
  }

  if (__DEV__) {
    console.error(`[Qwen OAuth] Polling timeout after ${pollCount} attempts (${expiresIn}s)`);
  }
  throw new Error('Polling timeout — device code expired.');
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

export async function refreshQwenToken(refreshToken: string): Promise<QwenTokenResponse> {
  const params = new URLSearchParams({
    client_id: QWEN_CLIENT_ID,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(`${QWEN_OAUTH_BASE_URL}${QWEN_TOKEN_ENDPOINT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const error = String(errorData.error || '');
    if (error === 'invalid_grant') {
      throw new Error('Your refresh token has expired. Please re-authenticate.');
    }
    throw new Error(
      String(errorData.error_description || errorData.error || 'Token refresh failed'),
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    access_token: String(data.access_token),
    refresh_token: data.refresh_token ? String(data.refresh_token) : refreshToken,
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
    api_key: data.api_key ? String(data.api_key) : undefined,
  };
}

// ─── Token Storage ───────────────────────────────────────────────────────────

export async function saveQwenTokens(tokens: QwenStoredTokens): Promise<void> {
  if (__DEV__) {
    console.log(`[Qwen OAuth] === SAVING TOKENS ===`);
    console.log(`[Qwen OAuth] Has access_token: ${!!tokens.accessToken}`);
    console.log(`[Qwen OAuth] Access token length: ${tokens.accessToken?.length || 0}`);
    console.log(`[Qwen OAuth] Has refresh_token: ${!!tokens.refreshToken}`);
    console.log(`[Qwen OAuth] Has api_key: ${!!tokens.apiKey}`);
    console.log(`[Qwen OAuth] API key length: ${tokens.apiKey?.length || 0}`);
    console.log(`[Qwen OAuth] Resource URL: ${tokens.resourceUrl || '(none)'}`);
    console.log(`[Qwen OAuth] Expires at: ${new Date(tokens.expiresAt).toISOString()}`);
    if (tokens.accessToken) {
      console.log(`[Qwen OAuth] Access token preview: ${tokens.accessToken.slice(0, 30)}...`);
    }
    if (tokens.apiKey) {
      console.log(`[Qwen OAuth] API key preview: ${tokens.apiKey.slice(0, 30)}...`);
    }
    console.log(`[Qwen OAuth] ================================`);
  }

  await SecureStore.setItemAsync(QWEN_ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(QWEN_REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  await SecureStore.setItemAsync(QWEN_TOKEN_EXPIRY_KEY, String(tokens.expiresAt));
  if (tokens.apiKey) {
    await SecureStore.setItemAsync(QWEN_API_KEY_KEY, tokens.apiKey);
  }
  if (tokens.resourceUrl) {
    await SecureStore.setItemAsync(QWEN_RESOURCE_URL_KEY, tokens.resourceUrl);
  }
}

export async function loadQwenTokens(): Promise<QwenStoredTokens | null> {
  const accessToken = await SecureStore.getItemAsync(QWEN_ACCESS_TOKEN_KEY);
  if (!accessToken) {
    if (__DEV__) console.log(`[Qwen OAuth] No tokens found in SecureStore`);
    return null;
  }

  const tokens: QwenStoredTokens = {
    accessToken,
    refreshToken: (await SecureStore.getItemAsync(QWEN_REFRESH_TOKEN_KEY)) || undefined,
    expiresAt: Number(await SecureStore.getItemAsync(QWEN_TOKEN_EXPIRY_KEY)) || 0,
    apiKey: (await SecureStore.getItemAsync(QWEN_API_KEY_KEY)) || undefined,
    resourceUrl: (await SecureStore.getItemAsync(QWEN_RESOURCE_URL_KEY)) || undefined,
  };

  if (__DEV__) {
    console.log(`[Qwen OAuth] Loaded tokens from SecureStore`);
    console.log(`[Qwen OAuth] Access token length: ${tokens.accessToken.length}`);
    console.log(`[Qwen OAuth] API key length: ${tokens.apiKey?.length || 0}`);
    console.log(`[Qwen OAuth] Resource URL: ${tokens.resourceUrl || '(none)'}`);
    console.log(`[Qwen OAuth] Resolved base URL: ${resolveQwenBaseUrl(tokens.resourceUrl)}`);
    console.log(`[Qwen OAuth] Expires at: ${new Date(tokens.expiresAt).toISOString()}`);
    console.log(`[Qwen OAuth] Is expired: ${tokens.expiresAt <= Date.now()}`);
  }

  return tokens;
}

export async function clearQwenTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(QWEN_ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(QWEN_REFRESH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(QWEN_TOKEN_EXPIRY_KEY);
  await SecureStore.deleteItemAsync(QWEN_API_KEY_KEY);
  await SecureStore.deleteItemAsync(QWEN_RESOURCE_URL_KEY);
}

// ─── Auth Status ─────────────────────────────────────────────────────────────

export async function isQwenAuthenticated(): Promise<boolean> {
  const tokens = await loadQwenTokens();
  if (!tokens) return false;
  return tokens.expiresAt > Date.now() && !!(tokens.accessToken || tokens.apiKey);
}

/** Exponential cooldown after consecutive refresh failures. */
let qwenRefreshFailCount = 0;
let qwenRefreshCooldownUntil = 0;
const REFRESH_COOLDOWN_MS = [
  2 * 60_000, // 1st fail: 2 min
  10 * 60_000, // 2nd fail: 10 min
  30 * 60_000, // 3rd+ fail: 30 min
];

export async function getQwenAccessToken(): Promise<{
  accessToken: string;
  apiKey?: string;
  resourceUrl?: string;
} | null> {
  const tokens = await loadQwenTokens();
  if (!tokens || tokens.expiresAt <= Date.now()) {
    // Try refresh
    if (tokens?.refreshToken) {
      // Respect cooldown after previous refresh failures
      const now = Date.now();
      if (qwenRefreshCooldownUntil > now) {
        if (__DEV__) {
          const secsLeft = Math.ceil((qwenRefreshCooldownUntil - now) / 1000);
          console.warn(`[Qwen OAuth] Token refresh on cooldown (${secsLeft}s remaining)`);
        }
        return null;
      }

      if (__DEV__) console.log(`[Qwen OAuth] Token expired or missing, attempting refresh...`);
      try {
        const refreshed = await refreshQwenToken(tokens.refreshToken);
        const newExpiry = Date.now() + refreshed.expires_in * 1000;
        await saveQwenTokens({
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token,
          expiresAt: newExpiry,
          apiKey: refreshed.api_key,
          resourceUrl: refreshed.resource_url || tokens.resourceUrl,
        });
        qwenRefreshFailCount = 0;
        qwenRefreshCooldownUntil = 0;
        return {
          accessToken: refreshed.access_token,
          apiKey: refreshed.api_key,
          resourceUrl: refreshed.resource_url || tokens.resourceUrl,
        };
      } catch (err) {
        qwenRefreshFailCount++;
        const idx = Math.min(qwenRefreshFailCount - 1, REFRESH_COOLDOWN_MS.length - 1);
        qwenRefreshCooldownUntil = Date.now() + REFRESH_COOLDOWN_MS[idx];
        if (__DEV__) {
          console.error(
            `[Qwen OAuth] Token refresh failed (attempt ${qwenRefreshFailCount}), cooldown ${REFRESH_COOLDOWN_MS[idx] / 1000}s:`,
            (err as Error).message,
          );
        }
        await clearQwenTokens();
        return null;
      }
    }
    if (__DEV__) console.log(`[Qwen OAuth] No token and no refresh token available`);
    return null;
  }
  if (__DEV__) console.log(`[Qwen OAuth] Using cached access token`);
  return {
    accessToken: tokens.accessToken,
    apiKey: tokens.apiKey,
    resourceUrl: tokens.resourceUrl,
  };
}
