/**
 * Secure token persistence for ChatGPT OAuth.
 * Uses expo-secure-store (Android Keystore-backed) with a mutex to prevent
 * concurrent refresh races (single-use refresh tokens).
 */
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, extractAccountIdFromJwt, type TokenResponse } from './chatgptAuth';

const KEY_ACCESS = 'chatgpt_access_token';
const KEY_REFRESH = 'chatgpt_refresh_token';
const KEY_EXPIRES_AT = 'chatgpt_expires_at';
const KEY_ACCOUNT_ID = 'chatgpt_account_id';

let refreshMutex: Promise<string> | null = null;

export async function saveTokens(tokens: TokenResponse): Promise<void> {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  const accountId = extractAccountIdFromJwt(tokens.access_token);
  await Promise.all([
    SecureStore.setItemAsync(KEY_ACCESS, tokens.access_token),
    SecureStore.setItemAsync(KEY_REFRESH, tokens.refresh_token),
    SecureStore.setItemAsync(KEY_EXPIRES_AT, expiresAt),
    SecureStore.setItemAsync(KEY_ACCOUNT_ID, accountId),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_ACCESS);
}

export async function getAccountId(): Promise<string> {
  return (await SecureStore.getItemAsync(KEY_ACCOUNT_ID)) ?? '';
}

export async function isConnected(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(KEY_REFRESH);
  return !!token;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_ACCESS),
    SecureStore.deleteItemAsync(KEY_REFRESH),
    SecureStore.deleteItemAsync(KEY_EXPIRES_AT),
    SecureStore.deleteItemAsync(KEY_ACCOUNT_ID),
  ]);
}

function isExpiringSoon(): Promise<boolean> {
  return SecureStore.getItemAsync(KEY_EXPIRES_AT).then((raw) => {
    if (!raw) return true;
    // Refresh if within 60s of expiry
    return Date.now() > Number(raw) - 60_000;
  });
}

/**
 * Returns a valid access token, refreshing if needed.
 * The mutex prevents concurrent refreshes (single-use refresh token safety).
 */
export async function getValidAccessToken(): Promise<string> {
  const expiring = await isExpiringSoon();
  if (!expiring) {
    const token = await getAccessToken();
    if (token) return token;
  }

  // If a refresh is already in flight, wait for it
  if (refreshMutex) return refreshMutex;

  refreshMutex = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEY_REFRESH);
      if (!refreshToken) throw new Error('ChatGPT not connected — no refresh token');

      const tokens = await refreshAccessToken(refreshToken);
      await saveTokens(tokens);
      return tokens.access_token;
    } finally {
      refreshMutex = null;
    }
  })();

  return refreshMutex;
}
