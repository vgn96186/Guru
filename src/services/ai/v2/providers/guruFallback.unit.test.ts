jest.mock('./fallback', () => ({
  createFallbackModel: jest.fn(() => ({
    provider: 'fallback',
    modelId: 'fallback',
  })),
}));

jest.mock('./presets', () => ({
  createGroqModel: jest.fn(({ modelId }: { modelId: string }) => ({ provider: 'groq', modelId })),
  createOpenRouterModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'openrouter',
    modelId,
  })),
  createDeepSeekModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'deepseek',
    modelId,
  })),
  createCloudflareModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'cloudflare',
    modelId,
  })),
  createGitHubModelsModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'github',
    modelId,
  })),
}));

jest.mock('./openaiCompatible', () => ({
  createOpenAICompatibleModel: jest.fn(
    ({ provider, modelId }: { provider: string; modelId: string }) => ({
      provider,
      modelId,
    }),
  ),
}));

jest.mock('./gemini', () => ({
  createGeminiModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'gemini',
    modelId,
  })),
}));

jest.mock('./localLlm', () => ({
  createLocalLlmModel: jest.fn(({ modelPath }: { modelPath: string }) => ({
    provider: 'local',
    modelId: modelPath,
  })),
  createNanoModel: jest.fn(() => ({ provider: 'nano', modelId: 'nano' })),
}));

jest.mock('./chatgpt', () => ({
  createChatGptModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'chatgpt',
    modelId,
  })),
}));

jest.mock('./githubCopilot', () => ({
  createGitHubCopilotModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'github_copilot',
    modelId,
  })),
}));

jest.mock('./gitlabDuo', () => ({
  createGitLabDuoModel: jest.fn(({ modelId }: { modelId: string }) => ({
    provider: 'gitlab_duo',
    modelId,
  })),
}));

jest.mock('./poe', () => ({
  createPoeModel: jest.fn(({ modelId }: { modelId: string }) => ({ provider: 'poe', modelId })),
}));

jest.mock('./qwen', () => ({
  createQwenModel: jest.fn(({ modelId }: { modelId: string }) => ({ provider: 'qwen', modelId })),
}));

import { createGuruFallbackModel } from './guruFallback';
import { createFallbackModel } from './fallback';
import { createGroqModel, createOpenRouterModel } from './presets';
import { createLocalLlmModel, createNanoModel } from './localLlm';
import type { UserProfile } from '../../../../types';

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    displayName: 'Vishnu',
    totalXp: 0,
    currentLevel: 1,
    streakCurrent: 0,
    streakBest: 0,
    dailyGoalMinutes: 60,
    examType: 'NEET',
    inicetDate: '2026-07-01',
    neetDate: '2026-09-01',
    preferredSessionLength: 45,
    lastActiveDate: null,
    openrouterApiKey: '',
    openrouterKey: 'or-key',
    groqApiKey: 'groq-key',
    notificationsEnabled: true,
    strictModeEnabled: false,
    bodyDoublingEnabled: false,
    blockedContentTypes: [],
    idleTimeoutMinutes: 10,
    breakDurationMinutes: 5,
    notificationHour: 8,
    providerOrder: ['chatgpt', 'groq', 'openrouter'],
    disabledProviders: [],
    useLocalModel: true,
    localModelPath: '/models/local.gguf',
    useNano: true,
    chatgptConnected: true,
    ...overrides,
  } as UserProfile;
}

describe('createGuruFallbackModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses only the explicitly selected cloud model when chosenModel targets a provider', () => {
    createGuruFallbackModel({
      profile: makeProfile(),
      chosenModel: 'groq/llama-3.3-70b-spec',
    });

    expect(createLocalLlmModel).not.toHaveBeenCalled();
    expect(createNanoModel).not.toHaveBeenCalled();
    expect(createGroqModel).toHaveBeenCalledWith({
      modelId: 'llama-3.3-70b-spec',
      apiKey: 'groq-key',
    });
    expect(jest.mocked(createFallbackModel).mock.calls[0]?.[0].models).toHaveLength(1);
  });

  it('treats an unprefixed explicit model id as an OpenRouter selection', () => {
    createGuruFallbackModel({
      profile: makeProfile(),
      chosenModel: 'meta-llama/llama-3.3-70b-instruct:free',
    });

    expect(createLocalLlmModel).not.toHaveBeenCalled();
    expect(createNanoModel).not.toHaveBeenCalled();
    expect(createOpenRouterModel).toHaveBeenCalledWith({
      modelId: 'meta-llama/llama-3.3-70b-instruct:free',
      apiKey: 'or-key',
      title: 'Guru',
    });
    expect(jest.mocked(createFallbackModel).mock.calls[0]?.[0].models).toHaveLength(1);
  });

  it('routes gemini-prefixed selections only through Gemini without local fallbacks', () => {
    createGuruFallbackModel({
      profile: makeProfile({
        groqApiKey: '',
        geminiKey: 'gem-key',
        providerOrder: ['groq', 'gemini', 'openrouter'],
      }),
      chosenModel: 'gemini/gemini-2.5-flash',
    });

    expect(createLocalLlmModel).not.toHaveBeenCalled();
    expect(createNanoModel).not.toHaveBeenCalled();
    const models = jest.mocked(createFallbackModel).mock.calls[0]?.[0].models as Array<{
      provider: string;
      modelId: string;
    }>;
    expect(models).toEqual([{ provider: 'gemini', modelId: 'gemini-2.5-flash' }]);
  });

  it('routes chatgpt-prefixed selections only through ChatGPT', () => {
    createGuruFallbackModel({
      profile: makeProfile(),
      chosenModel: 'chatgpt/gpt-5-mini',
    });

    expect(createLocalLlmModel).not.toHaveBeenCalled();
    expect(createNanoModel).not.toHaveBeenCalled();
    const models = jest.mocked(createFallbackModel).mock.calls[0]?.[0].models as Array<{
      provider: string;
      modelId: string;
    }>;
    expect(models).toEqual([{ provider: 'chatgpt', modelId: 'gpt-5-mini' }]);
  });

  it('uses only the on-device local model when chosenModel is local', () => {
    createGuruFallbackModel({
      profile: makeProfile(),
      chosenModel: 'local',
    });

    expect(createLocalLlmModel).toHaveBeenCalledWith({
      modelPath: '/models/local.gguf',
      textMode: false,
    });
    expect(createNanoModel).not.toHaveBeenCalled();
    expect(jest.mocked(createFallbackModel).mock.calls[0]?.[0].models).toHaveLength(1);
  });
});
