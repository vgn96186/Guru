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
      mulerouterKey: undefined,
    });
    jest.mocked(profileRepository.getProfile).mockResolvedValue(minimalProfile);
    jest.mocked(geminiGenerateStructuredJsonSdk).mockReset();
    jest.mocked(attemptCloudLLM).mockReset();
    jest.mocked(attemptLocalLLM).mockReset();
  });

  it('returns native Gemini structured result when SDK succeeds', async () => {
    const parsed = { a: 1 };
    jest.mocked(geminiGenerateStructuredJsonSdk).mockResolvedValue({
      parsed,
      modelUsed: 'gemini/gemini-2.0-flash',
    });

    const schema = z.object({ a: z.number() });
    const out = await generateJSONWithRouting(
      [{ role: 'user', content: '{}' }],
      schema,
      'low',
      false,
    );

    expect(out.parsed).toEqual(parsed);
    expect(out.modelUsed).toContain('gemini');
    expect(geminiGenerateStructuredJsonSdk).toHaveBeenCalled();
    expect(attemptCloudLLM).not.toHaveBeenCalled();
  });

  it('falls back to cloud text + parse when Gemini structured fails', async () => {
    jest.mocked(geminiGenerateStructuredJsonSdk).mockRejectedValue(new Error('schema mismatch'));
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

  it('skips structured Gemini when preferGeminiStructuredJson is false', async () => {
    jest.mocked(profileRepository.getProfile).mockResolvedValue({
      ...minimalProfile,
      preferGeminiStructuredJson: false,
    });
    jest.mocked(attemptCloudLLM).mockResolvedValue({
      text: '{"a":99}',
      modelUsed: 'groq/fast',
    });

    const schema = z.object({ a: z.number() });
    const out = await generateJSONWithRouting(
      [{ role: 'user', content: 'x' }],
      schema,
      'low',
      false,
    );

    expect(out.parsed).toEqual({ a: 99 });
    expect(geminiGenerateStructuredJsonSdk).not.toHaveBeenCalled();
    expect(attemptCloudLLM).toHaveBeenCalled();
  });

  it('skips structured Gemini when no gemini key', async () => {
    jest.mocked(getApiKeys).mockReturnValue({
      orKey: 'openrouter',
      groqKey: undefined,
      geminiKey: undefined,
      cfAccountId: undefined,
      cfApiToken: undefined,
      geminiFallbackKey: undefined,
      deepseekKey: undefined,
      mulerouterKey: undefined,
    });
    jest.mocked(profileRepository.getProfile).mockResolvedValue({
      ...minimalProfile,
      geminiKey: '',
    });
    jest.mocked(attemptCloudLLM).mockResolvedValue({
      text: '{"x":true}',
      modelUsed: 'openrouter/x',
    });

    const schema = z.object({ x: z.boolean() });
    await generateJSONWithRouting([{ role: 'user', content: 'y' }], schema, 'low', false);

    expect(geminiGenerateStructuredJsonSdk).not.toHaveBeenCalled();
    expect(attemptCloudLLM).toHaveBeenCalled();
  });
});
