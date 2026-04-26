import { useMemo } from 'react';
import type { UserProfile } from '../../../types';
import { hasValue, isChatGptEnabled } from '../utils';
import type { ChatGptAccountSettings } from '../types';

type UseProviderReadyCountParams = {
  profile: UserProfile | null | undefined;
  chatgptAccounts: ChatGptAccountSettings;
  githubCopilotConnected: boolean;
  gitlabDuoConnected: boolean;
  poeConnected: boolean;
  qwenConnected: boolean;
  keys: {
    groqKey: string;
    githubModelsPat: string;
    openrouterKey: string;
    kiloApiKey: string;
    deepseekKey: string;
    agentRouterKey: string;
    geminiKey: string;
    deepgramApiKey: string;
    falApiKey: string;
    braveSearchApiKey: string;
    cloudflareAccountId: string;
    cloudflareApiToken: string;
  };
};

export function useProviderReadyCount({
  profile,
  chatgptAccounts,
  githubCopilotConnected,
  gitlabDuoConnected,
  poeConnected,
  qwenConnected,
  keys,
}: UseProviderReadyCountParams) {
  return useMemo(() => {
    const localLlmReady = Boolean(profile?.localModelPath ?? '');
    const localWhisperReady = Boolean(profile?.localWhisperPath ?? '');
    const localAiEnabled = Boolean(
      profile?.useLocalModel || profile?.useLocalWhisper || profile?.useNano,
    );

    return [
      isChatGptEnabled(chatgptAccounts),
      githubCopilotConnected,
      gitlabDuoConnected,
      poeConnected,
      qwenConnected,
      hasValue(keys.groqKey),
      hasValue(keys.githubModelsPat),
      hasValue(keys.openrouterKey),
      hasValue(keys.kiloApiKey),
      hasValue(keys.deepseekKey),
      hasValue(keys.agentRouterKey),
      hasValue(keys.geminiKey),
      hasValue(keys.deepgramApiKey),
      hasValue(keys.falApiKey),
      hasValue(keys.braveSearchApiKey),
      hasValue(keys.cloudflareAccountId) && hasValue(keys.cloudflareApiToken),
      localAiEnabled && (localLlmReady || localWhisperReady || (profile?.useNano ?? true)),
    ].filter(Boolean).length;
  }, [
    chatgptAccounts,
    githubCopilotConnected,
    gitlabDuoConnected,
    keys,
    poeConnected,
    profile,
    qwenConnected,
  ]);
}
