import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import type { UserProfile } from '../types';
import {
  AGENTROUTER_MODELS,
  CHATGPT_MODELS,
  CLOUDFLARE_MODELS,
  DEEPSEEK_MODELS,
  GEMINI_MODELS,
  GITHUB_COPILOT_MODELS,
  GITHUB_MODELS_CHAT_MODELS,
  GROQ_MODELS,
  KILO_MODELS,
  OPENROUTER_FREE_MODELS,
  orderedGitHubCopilotModels,
  orderedGitLabDuoModels,
  POE_MODELS,
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
  chatgptConnected?: boolean;
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
    chatgptConnected:
      typeof draft.chatgptConnected === 'boolean'
        ? draft.chatgptConnected
        : profile.chatgptConnected,
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

const EMPTY: readonly string[] = [];

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
            draft.chatgptConnected ? '1' : '0',
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

    const {
      groqKey,
      orKey,
      geminiKey,
      cfAccountId,
      cfApiToken,
      kiloApiKey,
      deepseekKey,
      agentRouterKey,
      chatgptConnected,
    } = getApiKeys(mergedProfile);

    // Defer network fetch behind InteractionManager so tab-switch animation isn't blocked
    const task = InteractionManager.runAfterInteractions(() => {
      fetchAllLiveGuruChatModelIds({
        chatgptConnected,
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
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [profile, debouncedKeysString, refreshToken]);

  // Derive a stable key string from profile fields that affect which providers are connected.
  // This prevents re-creating memoized arrays when unrelated profile fields change.
  const resolvedKeys = profile
    ? getApiKeys(draft ? mergeDraftProfile(profile, draft) : profile)
    : null;
  const providerKeyString = resolvedKeys
    ? [
        resolvedKeys.groqKey ? '1' : '0',
        resolvedKeys.orKey ? '1' : '0',
        resolvedKeys.geminiKey ? '1' : '0',
        resolvedKeys.cfAccountId && resolvedKeys.cfApiToken ? '1' : '0',
        resolvedKeys.githubModelsPat ? '1' : '0',
        resolvedKeys.githubCopilotConnected ? '1' : '0',
        resolvedKeys.gitlabDuoConnected ? '1' : '0',
        resolvedKeys.poeConnected ? '1' : '0',
        resolvedKeys.kiloApiKey ? '1' : '0',
        resolvedKeys.deepseekKey ? '1' : '0',
        resolvedKeys.agentRouterKey ? '1' : '0',
        resolvedKeys.chatgptConnected ? '1' : '0',
      ].join('')
    : '';

  const copilotPref = profile?.githubCopilotPreferredModel ?? '';
  const gitlabPref = profile?.gitlabDuoPreferredModel ?? '';

  const chatgptModelIds = useMemo(
    () => (resolvedKeys?.chatgptConnected ? (live?.chatgpt ?? [...CHATGPT_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.chatgpt],
  );
  const groqModelIds = useMemo(
    () => (resolvedKeys?.groqKey ? (live?.groq ?? [...GROQ_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.groq],
  );
  const openrouterModelIds = useMemo(
    () => (resolvedKeys?.orKey ? (live?.openrouter ?? [...OPENROUTER_FREE_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.openrouter],
  );
  const geminiModelIds = useMemo(
    () => (resolvedKeys?.geminiKey ? (live?.gemini ?? [...GEMINI_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.gemini],
  );
  const cloudflareModelIds = useMemo(
    () =>
      resolvedKeys?.cfAccountId && resolvedKeys?.cfApiToken
        ? (live?.cloudflare ?? [...CLOUDFLARE_MODELS])
        : EMPTY,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.cloudflare],
  );
  const githubModelIds = useMemo(
    () => (resolvedKeys?.githubModelsPat ? [...GITHUB_MODELS_CHAT_MODELS] : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString],
  );
  const githubCopilotModelIds = useMemo(
    () => (resolvedKeys?.githubCopilotConnected ? orderedGitHubCopilotModels(copilotPref) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, copilotPref],
  );
  const gitlabDuoModelIds = useMemo(
    () => (resolvedKeys?.gitlabDuoConnected ? orderedGitLabDuoModels(gitlabPref) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, gitlabPref],
  );
  const poeModelIds = useMemo(
    () => (resolvedKeys?.poeConnected ? [...POE_MODELS] : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString],
  );
  const kiloModelIds = useMemo(() => live?.kilo ?? [...KILO_MODELS], [live?.kilo]);
  const deepseekModelIds = useMemo(
    () => (resolvedKeys?.deepseekKey ? (live?.deepseek ?? [...DEEPSEEK_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.deepseek],
  );
  const agentRouterModelIds = useMemo(
    () => (resolvedKeys?.agentRouterKey ? (live?.agentrouter ?? [...AGENTROUTER_MODELS]) : EMPTY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKeyString, live?.agentrouter],
  );

  return {
    chatgpt: chatgptModelIds,
    groq: groqModelIds,
    openrouter: openrouterModelIds,
    gemini: geminiModelIds,
    cloudflare: cloudflareModelIds,
    github: githubModelIds,
    githubCopilot: githubCopilotModelIds,
    gitlabDuo: gitlabDuoModelIds,
    poe: poeModelIds,
    kilo: kiloModelIds,
    deepseek: deepseekModelIds,
    agentrouter: agentRouterModelIds,
    loading,
    anyLive: live?.anyLive ?? false,
    errors: live?.errors ?? {},
    refresh,
  };
}
