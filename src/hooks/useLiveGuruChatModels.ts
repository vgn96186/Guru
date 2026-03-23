import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import {
  CLOUDFLARE_MODELS,
  GEMINI_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GROQ_MODELS,
  OPENROUTER_FREE_MODELS,
} from '../config/appConfig';
import { getApiKeys } from '../services/ai/config';
import {
  fetchAllLiveGuruChatModelIds,
  type LiveGuruChatModelIds,
} from '../services/ai/liveModelCatalog';

export type LiveGuruChatDraftKeys = {
  groqApiKey?: string;
  openrouterKey?: string;
  geminiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  githubModelsPat?: string;
};

function mergeDraftProfile(profile: UserProfile, draft: LiveGuruChatDraftKeys): UserProfile {
  return {
    ...profile,
    groqApiKey: draft.groqApiKey?.trim() || profile.groqApiKey || '',
    openrouterKey: draft.openrouterKey?.trim() || profile.openrouterKey || '',
    geminiKey: draft.geminiKey?.trim() || profile.geminiKey || '',
    cloudflareAccountId: draft.cloudflareAccountId?.trim() || profile.cloudflareAccountId || '',
    cloudflareApiToken: draft.cloudflareApiToken?.trim() || profile.cloudflareApiToken || '',
    githubModelsPat: draft.githubModelsPat?.trim() || profile.githubModelsPat || '',
  };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Loads provider model IDs from live APIs (with static fallbacks in `liveModelCatalog`).
 * When `draft` is passed (Settings form), refetches are debounced while keys are edited.
 */
export function useLiveGuruChatModels(profile: UserProfile | null, draft?: LiveGuruChatDraftKeys) {
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const keysString = useMemo(
    () =>
      draft
        ? [
            draft.groqApiKey ?? '',
            draft.openrouterKey ?? '',
            draft.geminiKey ?? '',
            draft.cloudflareAccountId ?? '',
            draft.cloudflareApiToken ?? '',
            draft.githubModelsPat ?? '',
          ].join('\0')
        : '',
    [draft],
  );

  const debouncedKeysString = useDebouncedValue(keysString, draft ? 500 : 0);

  const [live, setLive] = useState<LiveGuruChatModelIds | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const mergedProfile = (() => {
      if (!profile) return null;
      const d = draftRef.current;
      if (d) return mergeDraftProfile(profile, d);
      return profile;
    })();

    const { groqKey, orKey, geminiKey, cfAccountId, cfApiToken } = getApiKeys(mergedProfile);

    fetchAllLiveGuruChatModelIds({
      groqKey,
      orKey,
      geminiKey,
      cfAccountId,
      cfApiToken,
    })
      .then((r) => {
        if (!cancelled) setLive(r);
      })
      .catch(() => {
        if (!cancelled) setLive(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile, debouncedKeysString, refreshToken]);

  const mergedProfile = (() => {
    if (!profile) return null;
    const d = draftRef.current;
    if (d) return mergeDraftProfile(profile, d);
    return profile;
  })();
  const githubList =
    mergedProfile && getApiKeys(mergedProfile).githubModelsPat
      ? [...GITHUB_MODELS_CHAT_MODELS]
      : [];

  return {
    groq: live?.groq ?? GROQ_MODELS,
    openrouter: live?.openrouter ?? OPENROUTER_FREE_MODELS,
    gemini: live?.gemini ?? GEMINI_MODELS,
    cloudflare: live?.cloudflare ?? CLOUDFLARE_MODELS,
    github: githubList,
    loading,
    anyLive: live?.anyLive ?? false,
    errors: live?.errors ?? {},
    refresh,
  };
}
