/**
 * Completes GitLab Duo OAuth when the app opens via guru-study://oauth/gitlab?...
 * Called from app bootstrap Linking listener and from Settings paste-URL flow.
 */
import { updateUserProfile } from '../../../db/queries/progress';
import { showToast } from '../../../components/Toast';
import { queryClient } from '../../queryClient';
import { PROFILE_QUERY_KEY } from '../../../hooks/queries/useProfile';
import { exchangeCodeForTokens, parseGitLabOAuthCallback } from './gitlabAuth';
import {
  saveTokens,
  readPendingOAuthSession,
  clearPendingOAuthSession,
  getStoredGitLabClientSecret,
} from './gitlabTokenStore';

let inFlight: Promise<boolean> | null = null;

/**
 * If `url` is a GitLab OAuth callback for this app, exchange the code and persist tokens.
 * @returns whether the URL was handled (including OAuth error redirects).
 */
export async function tryCompleteGitLabDuoOAuth(url: string): Promise<boolean> {
  const parsed = parseGitLabOAuthCallback(url);
  if (!parsed) return false;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      if (parsed.error) {
        await clearPendingOAuthSession();
        const msg = parsed.errorDescription
          ? `${parsed.error}: ${parsed.errorDescription}`
          : parsed.error;
        showToast(`GitLab authorization failed: ${msg}`, 'error');
        return true;
      }

      if (!parsed.code || !parsed.state) {
        return true;
      }

      const pending = await readPendingOAuthSession();
      if (!pending) {
        showToast('No pending GitLab sign-in. Open Settings and tap Connect again.', 'error');
        return true;
      }

      if (pending.state !== parsed.state) {
        await clearPendingOAuthSession();
        showToast('GitLab sign-in state mismatch. Try Connect again.', 'error');
        return true;
      }

      const clientSecret =
        pending.clientSecret?.trim() || (await getStoredGitLabClientSecret())?.trim() || undefined;
      const tokens = await exchangeCodeForTokens(
        parsed.code,
        pending.codeVerifier,
        pending.oauthClientId,
        clientSecret,
      );
      await saveTokens(tokens, pending.oauthClientId, clientSecret);
      await clearPendingOAuthSession();
      await updateUserProfile({ gitlabDuoConnected: true });
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      showToast('GitLab Duo connected.', 'success');
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      showToast(`GitLab connection failed: ${message}`, 'error');
      return true;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
