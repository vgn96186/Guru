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

/** Exponential cooldown after consecutive refresh failures. */
let refreshFailCount = 0;
let refreshCooldownUntil = 0;
const COOLDOWN_SCHEDULE_MS = [
  2 * 60_000, // 1st fail: 2 min
  10 * 60_000, // 2nd fail: 10 min
  30 * 60_000, // 3rd+ fail: 30 min
];

export async function saveTokens(tokens: TokenResponse): Promise<void> {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, tokens.access_token),
    SecureStore.setItemAsync(KEYS.expiresAt, expiresAt),
    ...(tokens.refresh_token ? [SecureStore.setItemAsync(KEYS.refresh, tokens.refresh_token)] : []),
  ]);
  refreshFailCount = 0;
  refreshCooldownUntil = 0;
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
 * Backs off exponentially after consecutive refresh failures.
 */
export async function getValidAccessToken(): Promise<string> {
  const expiring = await isExpiringSoon();
  if (!expiring) {
    const token = await getAccessToken();
    if (token) return token;
  }

  const now = Date.now();
  if (refreshCooldownUntil > now) {
    const secsLeft = Math.ceil((refreshCooldownUntil - now) / 1000);
    throw new Error(
      `Poe token refresh on cooldown (${secsLeft}s remaining). Will retry automatically.`,
    );
  }

  if (refreshMutex) return refreshMutex;

  refreshMutex = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEYS.refresh);
      if (!refreshToken) throw new Error('Poe not connected — no refresh token');

      const tokens = await refreshAccessToken(refreshToken);
      await saveTokens(tokens);
      refreshFailCount = 0;
      refreshCooldownUntil = 0;
      return tokens.access_token;
    } catch (err) {
      refreshFailCount++;
      const idx = Math.min(refreshFailCount - 1, COOLDOWN_SCHEDULE_MS.length - 1);
      refreshCooldownUntil = Date.now() + COOLDOWN_SCHEDULE_MS[idx];
      if (__DEV__) {
        console.warn(
          `[Poe] Token refresh failed (attempt ${refreshFailCount}), cooldown ${
            COOLDOWN_SCHEDULE_MS[idx] / 1000
          }s`,
          err,
        );
      }
      throw err;
    } finally {
      refreshMutex = null;
    }
  })();

  return refreshMutex;
}

/** Reset refresh cooldown (e.g. after user reconnects). */
export function resetRefreshCooldown(): void {
  refreshFailCount = 0;
  refreshCooldownUntil = 0;
}
