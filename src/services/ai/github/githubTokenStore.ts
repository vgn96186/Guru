/**
 * Secure token persistence for GitHub OAuth.
 * Uses expo-secure-store (Android Keystore-backed).
 *
 * Strategy (matches OpenCode): GitHub returns a non-expiring access token
 * when using scope "read:user" with the Copilot client ID.
 * No refresh token dance is needed — the access token is used directly
 * to obtain short-lived Copilot session tokens via the /copilot_internal API.
 */
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  access: 'github_copilot_access_token',
  refresh: 'github_copilot_refresh_token',
  expiresAt: 'github_copilot_expires_at',
} as const;

export async function saveTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<void> {
  await SecureStore.setItemAsync(KEYS.access, tokens.access_token);
  // Store refresh token if provided (future-proofing), but don't require it.
  if (tokens.refresh_token) {
    await SecureStore.setItemAsync(KEYS.refresh, tokens.refresh_token);
  }
  if (tokens.expires_in) {
    await SecureStore.setItemAsync(KEYS.expiresAt, String(Date.now() + tokens.expires_in * 1000));
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.access);
}

export async function isConnected(): Promise<boolean> {
  const access = await SecureStore.getItemAsync(KEYS.access);
  return !!access;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.expiresAt),
  ]);
}

/**
 * Returns the stored access token.
 * With the non-expiring token strategy, this simply returns what we have.
 * The Copilot session token layer handles its own expiry/refresh.
 */
export async function getValidAccessToken(): Promise<string> {
  const token = await SecureStore.getItemAsync(KEYS.access);
  if (!token) {
    throw new Error('No GitHub Copilot access token found. Please reconnect Copilot in Settings.');
  }
  return token;
}
