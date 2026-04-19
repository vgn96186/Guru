/**
 * useGuruChatModels — Model selection and available models
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { ModelOption } from '../types/chat';
import { getApiKeys } from '../services/ai/config';
import { useLiveGuruChatModels } from './useLiveGuruChatModels';
import { isLocalLlmAllowedOnThisDevice } from '../services/deviceMemory';
import {
  coerceGuruChatDefaultModel,
  guruChatPickerNameForCfModel,
  guruChatPickerNameForGeminiModel,
  guruChatPickerNameForGithubModel,
  guruChatPickerNameForGroqModel,
  guruChatPickerNameForOpenRouterSlug,
} from '../services/ai/guruChatModelPreference';

const MODEL_GROUP_ORDER: ModelOption['group'][] = [
  'Local',
  'ChatGPT Codex',
  'Qwen (Free)',
  'Groq',
  'OpenRouter',
  'Gemini',
  'Cloudflare',
  'GitHub Models',
  'GitHub Copilot',
  'GitLab Duo',
  'Poe',
  'Kilo',
  'AgentRouter',
];

export interface UseGuruChatModelsOptions {
  profile: any | null;
}

export interface UseGuruChatModelsReturn {
  chosenModel: string;
  setChosenModel: (model: string) => void;
  availableModels: ModelOption[];
  visibleModelGroups: ModelOption['group'][];
  currentModelLabel: string;
  currentModelGroup: ModelOption['group'];
  pickerTab: ModelOption['group'];
  setPickerTab: (group: ModelOption['group']) => void;
  applyChosenModel: (model: string) => void;
}

export function useGuruChatModels(options: UseGuruChatModelsOptions): UseGuruChatModelsReturn {
  const { profile } = options;
  const [chosenModel, setChosenModelState] = useState<string>('auto');
  const [pickerTab, setPickerTab] = useState<ModelOption['group']>('Local');
  const chosenModelRef = useRef<string>('auto');
  const prevGuruChatDefaultRef = useRef<string | undefined>(undefined);

  const {
    chatgpt: chatgptModelIds,
    groq: groqModelIds,
    openrouter: orModelIds,
    gemini: geminiModelIds,
    cloudflare: cfModelIds,
    github: githubModelIds,
    githubCopilot: githubCopilotModelIds,
    gitlabDuo: gitlabDuoModelIds,
    poe: poeModelIds,
    kilo: kiloModelIds,
    agentrouter: arModelIds,
  } = useLiveGuruChatModels(profile ?? null);

  const applyChosenModel = (modelId: string) => {
    chosenModelRef.current = modelId;
    setChosenModelState(modelId);
  };

  // Build available models list based on API keys
  const availableModels = useMemo<ModelOption[]>(() => {
    if (!profile) return [{ id: 'auto', name: 'Auto Route (Smart)', group: 'Local' }];

    const {
      orKey,
      groqKey,
      geminiKey,
      cfAccountId,
      cfApiToken,
      githubModelsPat,
      kiloApiKey,
      agentRouterKey,
      chatgptConnected,
      githubCopilotConnected,
      gitlabDuoConnected,
      poeConnected,
      qwenConnected,
    } = getApiKeys(profile);

    const list: ModelOption[] = [{ id: 'auto', name: 'Auto Route (Smart)', group: 'Local' }];

    if (profile.useLocalModel && profile.localModelPath && isLocalLlmAllowedOnThisDevice()) {
      list.push({ id: 'local', name: 'On-Device LLM', group: 'Local' });
    }

    if (chatgptConnected) {
      chatgptModelIds.forEach((model) => {
        list.push({ id: `chatgpt/${model}`, name: model, group: 'ChatGPT Codex' });
      });
    }

    if (qwenConnected || profile.qwenConnected) {
      list.push({ id: 'qwen/qwen3-coder-plus', name: 'Qwen Coder Plus', group: 'Qwen (Free)' });
    }

    if (groqKey) {
      groqModelIds.forEach((model) => {
        list.push({
          id: `groq/${model}`,
          name: guruChatPickerNameForGroqModel(model),
          group: 'Groq',
        });
      });
    }

    if (orKey) {
      orModelIds.forEach((model) => {
        list.push({
          id: model,
          name: guruChatPickerNameForOpenRouterSlug(model),
          group: 'OpenRouter',
        });
      });
    }

    if (geminiKey) {
      geminiModelIds.forEach((model) => {
        list.push({
          id: `gemini/${model}`,
          name: guruChatPickerNameForGeminiModel(model),
          group: 'Gemini',
        });
      });
    }

    if (cfAccountId && cfApiToken) {
      cfModelIds.forEach((model) => {
        list.push({
          id: `cf/${model}`,
          name: guruChatPickerNameForCfModel(model),
          group: 'Cloudflare',
        });
      });
    }

    if (githubModelsPat) {
      githubModelIds.forEach((model) => {
        list.push({
          id: `github/${model}`,
          name: guruChatPickerNameForGithubModel(model),
          group: 'GitHub Models',
        });
      });
    }

    if (githubCopilotConnected) {
      githubCopilotModelIds.forEach((model) => {
        list.push({
          id: `github_copilot/${model}`,
          name: model.toUpperCase(),
          group: 'GitHub Copilot',
        });
      });
    }

    if (gitlabDuoConnected) {
      gitlabDuoModelIds.forEach((model) => {
        list.push({
          id: `gitlab_duo/${model}`,
          name: model.toUpperCase(),
          group: 'GitLab Duo',
        });
      });
    }

    if (poeConnected) {
      poeModelIds.forEach((model) => {
        list.push({ id: `poe/${model}`, name: model.toUpperCase(), group: 'Poe' });
      });
    }

    if (kiloApiKey) {
      kiloModelIds.forEach((model) => {
        list.push({
          id: `kilo/${model}`,
          name: guruChatPickerNameForGithubModel(model),
          group: 'Kilo',
        });
      });
    }

    if (agentRouterKey) {
      arModelIds.forEach((model) => {
        list.push({ id: `ar/${model}`, name: model, group: 'AgentRouter' });
      });
    }

    return list;
  }, [
    profile,
    chatgptModelIds,
    groqModelIds,
    orModelIds,
    geminiModelIds,
    cfModelIds,
    githubModelIds,
    githubCopilotModelIds,
    gitlabDuoModelIds,
    poeModelIds,
    kiloModelIds,
    arModelIds,
  ]);

  // Sync with profile's default model
  useEffect(() => {
    if (!profile) return;

    const ids = availableModels.map((m) => m.id);
    const coerced = coerceGuruChatDefaultModel(profile.guruChatDefaultModel, ids);
    const key = profile.guruChatDefaultModel ?? '';
    const isFirstSync = prevGuruChatDefaultRef.current === undefined;
    const settingsDefaultChanged = !isFirstSync && prevGuruChatDefaultRef.current !== key;
    prevGuruChatDefaultRef.current = key;

    setChosenModelState((prev) => {
      if (isFirstSync) return coerced;
      if (!ids.includes(prev)) return coerced;
      if (settingsDefaultChanged) return coerced;
      return prev;
    });
  }, [profile, availableModels]);

  // Update ref when chosenModel changes
  useEffect(() => {
    chosenModelRef.current = chosenModel;
  }, [chosenModel]);

  const visibleModelGroups = useMemo(() => {
    const presentGroups = new Set(availableModels.map((model) => model.group));
    return MODEL_GROUP_ORDER.filter((group) => presentGroups.has(group));
  }, [availableModels]);

  const currentModelLabel = useMemo(() => {
    if (chosenModel === 'auto') return 'Auto';
    const found = availableModels.find((model) => model.id === chosenModel);
    if (!found) return 'Auto';
    const name = found.name;
    return name.length > 24 ? name.slice(0, 22) + '...' : name;
  }, [availableModels, chosenModel]);

  const currentModelGroup = useMemo(() => {
    const found = availableModels.find((m) => m.id === chosenModel);
    return found?.group ?? 'Local';
  }, [availableModels, chosenModel]);

  return {
    chosenModel,
    setChosenModel: applyChosenModel,
    availableModels,
    visibleModelGroups,
    currentModelLabel,
    currentModelGroup,
    pickerTab,
    setPickerTab,
    applyChosenModel,
  };
}
