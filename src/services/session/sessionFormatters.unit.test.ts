import { formatSessionModelLabel } from './sessionFormatters';

describe('formatSessionModelLabel', () => {
  it('collapses fallback model chains to a short label', () => {
    expect(
      formatSessionModelLabel(
        'fallback/groq/llama-3.3-70b-versatile|gemini/gemini-2.0-flash|openrouter/meta-llama/llama-3.3-70b-instruct:free',
      ),
    ).toBe('AI · Auto (fallback)');
  });

  it('formats gemini provider labels', () => {
    expect(formatSessionModelLabel('gemini/gemini-2.0-flash')).toBe(
      'AI · Gemini / gemini-2.0-flash',
    );
  });
});
