/**
 * Secure token persistence for GitLab Duo OAuth.
 * Uses expo-secure-store (Android Keystore-backed) with a mutex to prevent
 * concurrent refresh races.
 */
import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken, resolveGitLabClientId, type TokenResponse } from './gitlabAuth';

const KEYS = {
  access: 'gitlab_duo_access_token',
  refresh: 'gitlab_duo_refresh_token',
  expiresAt: 'gitlab_duo_expires_at',
  oauthClientId: 'gitlab_duo_oauth_client_id',
  /** Confidential GitLab OAuth apps require secret on token + refresh (not stored in SQLite). */
  clientSecret: 'gitlab_duo_oauth_client_secret',
  pendingVerifier: 'gitlab_oauth_code_verifier',
  pendingState: 'gitlab_oauth_state',
  pendingOauthClientId: 'gitlab_oauth_pending_client_id',
  pendingClientSecret: 'gitlab_oauth_pending_client_secret',
} as const;

let refreshMutex: Promise<string> | null = null;

/**
 * Exponential cooldown after consecutive refresh failures.
 * Prevents triggering GitLab's brute-force account lock (3 failed attempts / 24h).
 */
let refreshFailCount = 0;
let refreshCooldownUntil = 0;
const COOLDOWN_SCHEDULE_MS = [
  2 * 60_000, // 1st fail: 2 min
  10 * 60_000, // 2nd fail: 10 min
  30 * 60_000, // 3rd+ fail: 30 min (matches GitLab's lock window)
];

export async function saveTokens(
  tokens: TokenResponse,
  oauthClientId: string,
  /** Persist when user supplies secret at connect; omit on refresh-only saves. */
  clientSecretToPersist?: string | null,
): Promise<void> {
  const expiresAt = String(Date.now() + tokens.expires_in * 1000);
  const persistSecret = (clientSecretToPersist ?? '').trim();
  await Promise.all([
    SecureStore.setItemAsync(KEYS.access, tokens.access_token),
    SecureStore.setItemAsync(KEYS.refresh, tokens.refresh_token),
    SecureStore.setItemAsync(KEYS.expiresAt, expiresAt),
    SecureStore.setItemAsync(KEYS.oauthClientId, oauthClientId),
    ...(persistSecret ? [SecureStore.setItemAsync(KEYS.clientSecret, persistSecret)] : []),
  ]);
  // Fresh tokens → clear any refresh cooldown
  refreshFailCount = 0;
  refreshCooldownUntil = 0;
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.access);
}

/** Client id used when this session was authorized (required for refresh). */
export async function getStoredOAuthClientId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.oauthClientId);
}

export async function getStoredGitLabClientSecret(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.clientSecret);
}

export async function isConnected(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(KEYS.refresh);
  return !!token;
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.expiresAt),
    SecureStore.deleteItemAsync(KEYS.oauthClientId),
    SecureStore.deleteItemAsync(KEYS.clientSecret),
    clearPendingOAuthSession(),
  ]);
}

export async function savePendingOAuthSession(
  codeVerifier: string,
  state: string,
  oauthClientId: string,
  clientSecret?: string | null,
): Promise<void> {
  const secret = (clientSecret ?? '').trim();
  await Promise.all([
    SecureStore.setItemAsync(KEYS.pendingVerifier, codeVerifier),
    SecureStore.setItemAsync(KEYS.pendingState, state),
    SecureStore.setItemAsync(KEYS.pendingOauthClientId, oauthClientId),
    ...(secret
      ? [SecureStore.setItemAsync(KEYS.pendingClientSecret, secret)]
      : [SecureStore.deleteItemAsync(KEYS.pendingClientSecret)]),
  ]);
}

export async function readPendingOAuthSession(): Promise<{
  codeVerifier: string;
  state: string;
  oauthClientId: string;
  clientSecret: string | null;
} | null> {
  const [codeVerifier, state, oauthClientId, clientSecret] = await Promise.all([
    SecureStore.getItemAsync(KEYS.pendingVerifier),
    SecureStore.getItemAsync(KEYS.pendingState),
    SecureStore.getItemAsync(KEYS.pendingOauthClientId),
    SecureStore.getItemAsync(KEYS.pendingClientSecret),
  ]);
  if (!codeVerifier || !state || !oauthClientId) return null;
  return { codeVerifier, state, oauthClientId, clientSecret: clientSecret?.trim() || null };
}

export async function clearPendingOAuthSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.pendingVerifier),
    SecureStore.deleteItemAsync(KEYS.pendingState),
    SecureStore.deleteItemAsync(KEYS.pendingOauthClientId),
    SecureStore.deleteItemAsync(KEYS.pendingClientSecret),
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
 * Backs off exponentially after consecutive refresh failures to avoid
 * triggering GitLab's brute-force account lock.
 */
export async function getValidAccessToken(): Promise<string> {
  const expiring = await isExpiringSoon();
  if (!expiring) {
    const token = await getAccessToken();
    if (token) return token;
  }

  // Respect cooldown after previous refresh failures
  const now = Date.now();
  if (refreshCooldownUntil > now) {
    const secsLeft = Math.ceil((refreshCooldownUntil - now) / 1000);
    throw new Error(
      `GitLab Duo token refresh on cooldown (${secsLeft}s remaining after ${refreshFailCount} failed attempt${refreshFailCount > 1 ? 's' : ''}). Will retry automatically.`,
    );
  }

  if (refreshMutex) return refreshMutex;

  refreshMutex = (async () => {
    try {
      const refreshToken = await SecureStore.getItemAsync(KEYS.refresh);
      if (!refreshToken) throw new Error('GitLab Duo not connected — no refresh token');

      let oauthClientId = await getStoredOAuthClientId();
      if (!oauthClientId?.trim()) {
        oauthClientId = resolveGitLabClientId(null);
      }

      const clientSecret = await getStoredGitLabClientSecret();
      const tokens = await refreshAccessToken(
        refreshToken,
        oauthClientId,
        clientSecret?.trim() || undefined,
      );
      await saveTokens(tokens, oauthClientId);
      // Reset cooldown on success
      refreshFailCount = 0;
      refreshCooldownUntil = 0;
      return tokens.access_token;
    } catch (err) {
      // Apply exponential cooldown
      refreshFailCount++;
      const idx = Math.min(refreshFailCount - 1, COOLDOWN_SCHEDULE_MS.length - 1);
      refreshCooldownUntil = Date.now() + COOLDOWN_SCHEDULE_MS[idx];
      if (__DEV__) {
        console.warn(
          `[GitLab] Token refresh failed (attempt ${refreshFailCount}), cooldown ${COOLDOWN_SCHEDULE_MS[idx] / 1000}s`,
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
