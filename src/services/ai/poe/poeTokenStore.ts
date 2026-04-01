/**
 * Secure token persistence for Poe OAuth.
 * Uses expo-secure-store (Android Keystore-backed) with a mutex to prevent
 * concurrent refresh races.
 */
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, type TokenResponse } from './poeAuth';

const KEYS = {
  access: 'poe_access_token',
  refresh: 'poe_refresh_token',
  expiresAt: 'poe_expires_at',
} as const;

let refreshMutex: Promise<string> | null = null;

export async function saveTokens(tokens: TokenResponse): Promise<void> {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, tokens.access_token),
    SecureStore.setItemAsync(KEYS.expiresAt, expiresAt),
    ...(tokens.refresh_token ? [SecureStore.setItemAsync(KEYS.refresh, tokens.refresh_token)] : []),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.access);
}

export async function isConnected(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(KEYS.access);
  return !!token;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.expiresAt),
  ]);
}

function isExpiringSoon(): Promise<boolean> {
  return SecureStore.getItemAsync(KEYS.expiresAt).then((raw) => {
    if (!raw) return true;
    return Date.now() > Number(raw) - 60_000;
  });
}

/**
 * Returns a valid access token, refreshing if needed.
 */
export async function getValidAccessToken(): Promise<string> {
  const expiring = await isExpiringSoon();
  if (!expiring) {
    const token = await getAccessToken();
    if (token) return token;
  }

  if (refreshMutex) return refreshMutex;

  refreshMutex = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEYS.refresh);
      if (!refreshToken) throw new Error('Poe not connected — no refresh token');

      const tokens = await refreshAccessToken(refreshToken);
      await saveTokens(tokens);
      return tokens.access_token;
    } finally {
      refreshMutex = null;
    }
  })();

  return refreshMutex;
}
