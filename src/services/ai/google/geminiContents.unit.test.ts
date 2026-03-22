import { messagesToGeminiContents } from './geminiContents';

describe('messagesToGeminiContents', () => {
  it('maps plain text messages', () => {
    const { systemInstruction, contents } = messagesToGeminiContents([
      { role: 'system', content: 'Sys' },
      { role: 'user', content: 'Hello' },
    ]);
    expect(systemInstruction).toBe('Sys');
    expect(Array.isArray(contents)).toBe(true);
    expect((contents as { role: string; parts: { text?: string }[] }[])[0].parts[0]).toEqual({
      text: 'Hello',
    });
  });

  it('includes inline image parts for multimodal user messages', () => {
    const { contents } = messagesToGeminiContents([
      {
        role: 'user',
        content: 'What is this?',
        parts: [{ type: 'inline_image', mimeType: 'image/png', base64Data: 'abc123' }],
      },
    ]);
    const parts = (contents as { parts: Record<string, string>[] }[])[0].parts;
    expect(parts[0]).toEqual({ text: 'What is this?' });
    expect(parts[1]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'abc123' },
    });
  });
});
