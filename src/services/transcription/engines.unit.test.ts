import { transcribeRawWithGroq, transcribeRawWithHuggingFace } from './engines';

describe('transcription engines (Groq / HF)', () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('transcribeRawWithGroq rejects when API key is missing', async () => {
    await expect(transcribeRawWithGroq('/tmp/x.m4a', '  ')).rejects.toThrow(/Groq API key/);
  });

  it('transcribeRawWithHuggingFace rejects when token is missing', async () => {
    await expect(transcribeRawWithHuggingFace('/tmp/x.m4a', '')).rejects.toThrow(/Hugging Face/);
  });

  it('transcribeRawWithGroq returns trimmed transcript on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: '  diabetes mellitus  ' }),
    });
    const text = await transcribeRawWithGroq('file:///tmp/lecture.m4a', 'gk_test');
    expect(text).toBe('diabetes mellitus');
    expect(global.fetch).toHaveBeenCalled();
  });

  it('transcribeRawWithGroq throws when API returns non-OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limit',
    });
    await expect(transcribeRawWithGroq('file:///tmp/a.m4a', 'k')).rejects.toThrow(/429/);
  });

  it('transcribeRawWithGroq returns empty string for classic hallucination patterns', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'thank you.\nthank you.' }),
    });
    const text = await transcribeRawWithGroq('file:///tmp/a.m4a', 'k');
    expect(text).toBe('');
  });

  it('transcribeRawWithHuggingFace returns transcript on success', async () => {
    const audioBlob = { size: 4 };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => audioBlob,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: '  clinical pearl  ' }),
      });
    const text = await transcribeRawWithHuggingFace('file:///tmp/a.wav', 'hf-token');
    expect(text).toBe('clinical pearl');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('transcribeRawWithHuggingFace throws when local file read fails', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(transcribeRawWithHuggingFace('/tmp/missing.wav', 'hf-token')).rejects.toThrow(
      /Failed to read local audio file/,
    );
  });
});
