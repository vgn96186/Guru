import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserProfile } from '../types';
import {
  AGENTROUTER_MODELS,
  CLOUDFLARE_MODELS,
  DEEPSEEK_MODELS,
  GEMINI_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GROQ_MODELS,
  KILO_MODELS,
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
  kiloApiKey?: string;
  deepseekKey?: string;
  agentRouterKey?: string;
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
    kiloApiKey: draft.kiloApiKey?.trim() || profile.kiloApiKey || '',
    deepseekKey: draft.deepseekKey?.trim() || profile.deepseekKey || '',
    agentRouterKey: draft.agentRouterKey?.trim() || profile.agentRouterKey || '',
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
            draft.kiloApiKey ?? '',
            draft.deepseekKey ?? '',
            draft.agentRouterKey ?? '',
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

    const { groqKey, orKey, geminiKey, cfAccountId, cfApiToken, kiloApiKey, deepseekKey, agentRouterKey } =
      getApiKeys(mergedProfile);

    fetchAllLiveGuruChatModelIds({
      groqKey,
      orKey,
      geminiKey,
      cfAccountId,
      cfApiToken,
      kiloApiKey,
      deepseekKey,
      agentRouterKey,
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
  const resolvedKeys = mergedProfile ? getApiKeys(mergedProfile) : null;

  return {
    groq: live?.groq ?? (resolvedKeys?.groqKey ? [...GROQ_MODELS] : []),
    openrouter: live?.openrouter ?? (resolvedKeys?.orKey ? [...OPENROUTER_FREE_MODELS] : []),
    gemini: live?.gemini ?? (resolvedKeys?.geminiKey ? [...GEMINI_MODELS] : []),
    cloudflare: live?.cloudflare ?? (resolvedKeys?.cfAccountId && resolvedKeys?.cfApiToken ? [...CLOUDFLARE_MODELS] : []),
    github: resolvedKeys?.githubModelsPat ? [...GITHUB_MODELS_CHAT_MODELS] : [],
    kilo: resolvedKeys?.kiloApiKey ? (live?.kilo ?? [...KILO_MODELS]) : [],
    deepseek: resolvedKeys?.deepseekKey ? (live?.deepseek ?? [...DEEPSEEK_MODELS]) : [],
    agentrouter: resolvedKeys?.agentRouterKey ? (live?.agentrouter ?? [...AGENTROUTER_MODELS]) : [],
    loading,
    anyLive: live?.anyLive ?? false,
    errors: live?.errors ?? {},
    refresh,
  };
}
