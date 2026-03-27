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
}));

jest.mock('../deviceMemory', () => ({
  getLocalLlmRamWarning: jest.fn(),
  isLocalLlmUsable: jest.fn(() => false),
}));

jest.mock('./config', () => ({
  getApiKeys: jest.fn(),
}));

import { z } from 'zod';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { geminiGenerateStructuredJsonSdk } from './google/geminiStructured';
import { attemptCloudLLM, attemptLocalLLM } from './llmRouting';
import { generateJSONWithRouting } from './generate';

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
