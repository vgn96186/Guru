/**
 * Secure token persistence for ChatGPT OAuth.
 * Uses expo-secure-store (Android Keystore-backed) with a mutex to prevent
 * concurrent refresh races (single-use refresh tokens).
 */
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, extractAccountIdFromJwt, type TokenResponse } from './chatgptAuth';
import type { ChatGptAccountSlot } from '../../../types';

const PRIMARY_KEYS = {
  access: 'chatgpt_access_token',
  refresh: 'chatgpt_refresh_token',
  expiresAt: 'chatgpt_expires_at',
  accountId: 'chatgpt_account_id',
} as const;

const SECONDARY_KEYS = {
  access: 'chatgpt_secondary_access_token',
  refresh: 'chatgpt_secondary_refresh_token',
  expiresAt: 'chatgpt_secondary_expires_at',
  accountId: 'chatgpt_secondary_account_id',
} as const;

const refreshMutex: Partial<Record<ChatGptAccountSlot, Promise<string>>> = {};

function getSlotKeys(slot: ChatGptAccountSlot) {
  return slot === 'secondary' ? SECONDARY_KEYS : PRIMARY_KEYS;
}

export async function saveTokens(
  tokens: TokenResponse,
  slot: ChatGptAccountSlot = 'primary',
): Promise<void> {
  const keys = getSlotKeys(slot);
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  const accountId = extractAccountIdFromJwt(tokens.access_token);
  await Promise.all([
    SecureStore.setItemAsync(keys.access, tokens.access_token),
    SecureStore.setItemAsync(keys.refresh, tokens.refresh_token),
    SecureStore.setItemAsync(keys.expiresAt, expiresAt),
    SecureStore.setItemAsync(keys.accountId, accountId),
  ]);
}

export async function getAccessToken(slot: ChatGptAccountSlot = 'primary'): Promise<string | null> {
  return SecureStore.getItemAsync(getSlotKeys(slot).access);
}

export async function getAccountId(slot: ChatGptAccountSlot = 'primary'): Promise<string> {
  return (await SecureStore.getItemAsync(getSlotKeys(slot).accountId)) ?? '';
}

export async function isConnected(slot: ChatGptAccountSlot = 'primary'): Promise<boolean> {
  const token = await SecureStore.getItemAsync(getSlotKeys(slot).refresh);
  return !!token;
}

export async function clearTokens(slot: ChatGptAccountSlot = 'primary'): Promise<void> {
  const keys = getSlotKeys(slot);
  await Promise.all([
    SecureStore.deleteItemAsync(keys.access),
    SecureStore.deleteItemAsync(keys.refresh),
    SecureStore.deleteItemAsync(keys.expiresAt),
    SecureStore.deleteItemAsync(keys.accountId),
  ]);
}

function isExpiringSoon(slot: ChatGptAccountSlot): Promise<boolean> {
  return SecureStore.getItemAsync(getSlotKeys(slot).expiresAt).then((raw) => {
    if (!raw) return true;
    // Refresh if within 60s of expiry
    return Date.now() > Number(raw) - 60_000;
  });
}

/**
 * Returns a valid access token, refreshing if needed.
 * The mutex prevents concurrent refreshes (single-use refresh token safety).
 */
export async function getValidAccessToken(slot: ChatGptAccountSlot = 'primary'): Promise<string> {
  const expiring = await isExpiringSoon(slot);
  if (!expiring) {
    const token = await getAccessToken(slot);
    if (token) return token;
  }

  // If a refresh is already in flight, wait for it
  if (refreshMutex[slot]) return refreshMutex[slot]!;

  refreshMutex[slot] = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(getSlotKeys(slot).refresh);
      if (!refreshToken) throw new Error('ChatGPT not connected — no refresh token');

      const tokens = await refreshAccessToken(refreshToken);
      await saveTokens(tokens, slot);
      return tokens.access_token;
    } finally {
      delete refreshMutex[slot];
    }
  })();

  return refreshMutex[slot]!;
}
