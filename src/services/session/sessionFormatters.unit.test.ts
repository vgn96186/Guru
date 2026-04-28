import { formatSessionModelLabel } from './sessionFormatters';

describe('formatSessionModelLabel', () => {
  it('collapses fallback model chains to a short label', () => {
    expect(
      formatSessionModelLabel(
        'fallback/groq/llama-3.3-70b-versatile|gemini/gemini-3.1-flash-lite|openrouter/meta-llama/llama-3.3-70b-instruct:free',
      ),
    ).toBe('AI · Auto (fallback)');
  });

  it('formats gemini provider labels', () => {
    expect(formatSessionModelLabel('gemini/gemini-3.1-flash-lite')).toBe(
      'AI · Gemini / gemini-3.1-flash-lite',
    );
  });
});
