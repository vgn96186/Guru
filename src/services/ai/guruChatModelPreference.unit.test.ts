import {
  coerceGuruChatDefaultModel,
  formatGuruChatModelChipLabel,
  guruChatPickerNameForCfModel,
  guruChatPickerNameForGeminiModel,
  guruChatPickerNameForGroqModel,
  guruChatPickerNameForOpenRouterSlug,
} from './guruChatModelPreference';

describe('guruChatModelPreference', () => {
  describe('coerceGuruChatDefaultModel', () => {
    it('returns auto for empty, whitespace, or auto', () => {
      expect(coerceGuruChatDefaultModel(undefined, ['auto', 'groq/x'])).toBe('auto');
      expect(coerceGuruChatDefaultModel('', ['groq/x'])).toBe('auto');
      expect(coerceGuruChatDefaultModel('   ', ['groq/x'])).toBe('auto');
      expect(coerceGuruChatDefaultModel('auto', ['auto', 'local'])).toBe('auto');
    });

    it('returns saved when it is in the allow list', () => {
      const ids = ['auto', 'local', 'groq/llama-3.3-70b-versatile', 'openai/gpt-oss-120b:free'];
      expect(coerceGuruChatDefaultModel('local', ids)).toBe('local');
      expect(coerceGuruChatDefaultModel('groq/llama-3.3-70b-versatile', ids)).toBe(
        'groq/llama-3.3-70b-versatile',
      );
      expect(coerceGuruChatDefaultModel('openai/gpt-oss-120b:free', ids)).toBe(
        'openai/gpt-oss-120b:free',
      );
    });

    it('returns auto when saved is not available', () => {
      expect(coerceGuruChatDefaultModel('groq/missing', ['auto'])).toBe('auto');
      expect(coerceGuruChatDefaultModel('local', ['auto', 'groq/x'])).toBe('auto');
    });
  });

  describe('formatGuruChatModelChipLabel', () => {
    it('formats known id shapes', () => {
      expect(formatGuruChatModelChipLabel('auto')).toBe('Auto');
      expect(formatGuruChatModelChipLabel('local')).toBe('On-device');
      expect(formatGuruChatModelChipLabel('groq/llama-3.3-70b-versatile')).toContain('llama');
      expect(formatGuruChatModelChipLabel('gemini/gemini-3.1-flash-lite')).toContain('gemini');
      expect(formatGuruChatModelChipLabel('cf/@cf/meta/llama-3.1-8b-instruct')).toBeTruthy();
      expect(formatGuruChatModelChipLabel('github_copilot/gpt-4o')).toBe('gpt-4o');
      expect(formatGuruChatModelChipLabel('gitlab_duo/gpt-4o')).toBe('gpt-4o');
      expect(formatGuruChatModelChipLabel('poe/claude-sonnet-4-20250514')).toContain('claude');
    });

    it('truncates long OpenRouter-style ids', () => {
      const long = 'org/very-long-model-name-that-exceeds:free';
      const out = formatGuruChatModelChipLabel(long);
      expect(out.length).toBeLessThanOrEqual(23);
    });
  });

  describe('guruChatPickerNameForGroqModel', () => {
    it('uses slash path or hyphen split', () => {
      expect(guruChatPickerNameForGroqModel('meta/llama-3.3-70b')).toContain('LLAMA');
      expect(guruChatPickerNameForGroqModel('llama-3.3-70b-versatile')).toContain('LLAMA');
    });
  });

  describe('guruChatPickerNameForOpenRouterSlug', () => {
    it('extracts middle segment or falls back to slug', () => {
      expect(guruChatPickerNameForOpenRouterSlug('google/gemini-3.1-flash-lite:free')).toBe(
        'GEMINI-3.1-FLASH-LITE',
      );
      expect(guruChatPickerNameForOpenRouterSlug('nonslug')).toBe('NONSLUG');
    });
  });

  describe('guruChatPickerNameForGeminiModel', () => {
    it('returns model string without gemini- prefix', () => {
      expect(guruChatPickerNameForGeminiModel('gemini-3.1-flash-lite')).toBe('3.1-flash-lite');
      expect(guruChatPickerNameForGeminiModel('gemini-1.5-pro')).toBe('1.5-pro');
      expect(guruChatPickerNameForGeminiModel('other-model')).toBe('other-model');
    });
  });

  describe('guruChatPickerNameForCfModel', () => {
    it('uses last path segment', () => {
      expect(guruChatPickerNameForCfModel('@cf/meta/llama-3.1-8b-instruct')).toBe(
        'LLAMA-3.1-8B-INSTRUCT',
      );
    });
  });
});
