jest.mock('../../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('./google/geminiStructured', () => ({
  geminiGenerateStructuredJsonSdk: jest.fn(),
}));

jest.mock('./llmRouting', () => ({
  attemptLocalLLM: jest.fn(),
  attemptCloudLLM: jest.fn(),
  attemptCloudLLMStream: jest.fn(),
  clampMessagesForStructuredJsonRouting: jest.fn((msgs: unknown[]) => msgs),
}));

jest.mock('../deviceMemory', () => ({
  getLocalLlmRamWarning: jest.fn(),
  isLocalLlmUsable: jest.fn(() => false),
}));

jest.mock('./config', () => ({
  getApiKeys: jest.fn(),
}));

jest.mock('./runtimeActivity', () => ({
  markAiRuntimeStart: jest.fn(),
  markAiRuntimeFinish: jest.fn(),
}));

jest.mock('./runtimeDebug', () => {
  return {
    __esModule: true,
    createAiRequestTrace: jest.fn().mockImplementation(() => ({
      success: jest.fn(),
      failure: jest.fn(),
      fail: jest.fn(),
      log: jest.fn(),
    })),
    logStreamEvent: jest.fn(),
    logJsonParseSummary: jest.fn(),
    logJsonParseSuccess: jest.fn(),
    logJsonParseFailure: jest.fn(),
    logBootstrapEvent: jest.fn(),
    logGroundingEvent: jest.fn(),
    previewText: jest.fn().mockImplementation((t: string) => (t ? t.slice(0, 80) : '')),
  };
});

import { z } from 'zod';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { geminiGenerateStructuredJsonSdk } from './google/geminiStructured';
import {
  clampMessagesForStructuredJsonRouting,
  attemptCloudLLM,
  attemptLocalLLM,
} from './llmRouting';
import { createAiRequestTrace } from './runtimeDebug';
import { generateJSONWithRouting } from './generate';

const traceMock = {
  success: jest.fn(),
  failure: jest.fn(),
  fail: jest.fn(),
  log: jest.fn(),
};

const minimalProfile = {
  openrouterKey: '',
  groqApiKey: '',
  geminiKey: 'user-gemini',
  cloudflareAccountId: '',
  cloudflareApiToken: '',
  useLocalModel: false,
  localModelPath: null,
  preferGeminiStructuredJson: true,
} as any;

describe('generateJSONWithRouting', () => {
  beforeEach(() => {
    // Restore trace mock after resetMocks wipes it each test
    jest.mocked(createAiRequestTrace).mockImplementation(() => ({
      requestId: 'test-req-id',
      startedAt: Date.now(),
      success: jest.fn(),
      failure: jest.fn(),
      fail: jest.fn(),
      log: jest.fn(),
    }));
    // clampMessages must pass-through (resetMocks wipes the factory impl)
    jest.mocked(clampMessagesForStructuredJsonRouting).mockImplementation((msgs) => msgs);
    jest.mocked(getApiKeys).mockReturnValue({
      orKey: 'openrouter',
      groqKey: undefined,
      geminiKey: 'user-gemini',
      cfAccountId: undefined,
      cfApiToken: undefined,
      geminiFallbackKey: undefined,
      deepseekKey: undefined,
      githubModelsPat: undefined,
      kiloApiKey: undefined,
      agentRouterKey: undefined,
      deepgramKey: undefined,
      chatgptConnected: false,
      githubCopilotConnected: false,
      gitlabDuoConnected: false,
      poeConnected: false,
      qwenConnected: false,
    });
    jest.mocked(profileRepository.getProfile).mockResolvedValue(minimalProfile);
    jest.mocked(geminiGenerateStructuredJsonSdk).mockReset();
    jest.mocked(attemptCloudLLM).mockReset();
    jest.mocked(attemptLocalLLM).mockReset();
  });

  it('uses cloud routing loop when no local model', async () => {
    const parsed = { a: 1 };
    jest.mocked(attemptCloudLLM).mockResolvedValue({
      text: '{"a":1}',
      modelUsed: 'deepseek/deepseek-chat',
    });

    const schema = z.object({ a: z.number() });
    const out = await generateJSONWithRouting(
      [{ role: 'user', content: '{}' }],
      schema,
      'low',
      false,
    );

    expect(out.parsed).toEqual(parsed);
    expect(out.modelUsed).toBe('deepseek/deepseek-chat');
    expect(attemptCloudLLM).toHaveBeenCalled();
    // We no longer call the specialized Gemini SDK at the top level
    expect(geminiGenerateStructuredJsonSdk).not.toHaveBeenCalled();
  });

  it('falls back correctly in the cloud loop', async () => {
    jest.mocked(attemptCloudLLM).mockResolvedValue({
      text: '{"a":42}',
      modelUsed: 'groq/llama',
    });

    const schema = z.object({ a: z.number() });
    const out = await generateJSONWithRouting(
      [{ role: 'user', content: 'x' }],
      schema,
      'low',
      false,
    );

    expect(out.parsed).toEqual({ a: 42 });
    expect(out.modelUsed).toBe('groq/llama');
    expect(attemptCloudLLM).toHaveBeenCalled();
  });
});
