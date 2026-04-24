import { consumeSseEventBlock, readOpenAiCompatibleSse } from './openaiChatCompletionsSse';

describe('openaiChatCompletionsSse', () => {
  it('consumeSseEventBlock extracts content deltas', () => {
    const block = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n';
    const { texts, sawDone } = consumeSseEventBlock(block);
    expect(texts).toEqual(['Hi']);
    expect(sawDone).toBe(false);
  });

  it('consumeSseEventBlock extracts delta.reasoning when content is empty', () => {
    const block = 'data: {"choices":[{"delta":{"reasoning":"think"}}]}\n';
    const { texts, sawDone } = consumeSseEventBlock(block);
    expect(texts).toEqual(['think']);
    expect(sawDone).toBe(false);
  });

  it('consumeSseEventBlock extracts message.content when delta is empty', () => {
    const block = 'data: {"choices":[{"message":{"content":"Done"}}]}\n';
    const { texts, sawDone } = consumeSseEventBlock(block);
    expect(texts).toEqual(['Done']);
    expect(sawDone).toBe(false);
  });

  it('consumeSseEventBlock marks [DONE]', () => {
    const { sawDone, texts } = consumeSseEventBlock('data: [DONE]\n');
    expect(sawDone).toBe(true);
    expect(texts).toEqual([]);
  });

  it('readOpenAiCompatibleSse accumulates streamed chunks', async () => {
    const encoder = new TextEncoder();
    const payload =
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
    const res = new Response(stream);
    const parts: string[] = [];
    const full = await readOpenAiCompatibleSse(res, (d) => parts.push(d));
    expect(parts).toEqual(['Hel', 'lo']);
    expect(full).toBe('Hello');
  });

  it('consumeSseEventBlock extracts reasoning_content', () => {
    const block = 'data: {"choices":[{"delta":{"reasoning_content":"step"}}]}\n';
    const { texts, sawDone } = consumeSseEventBlock(block);
    expect(texts).toEqual(['step']);
    expect(sawDone).toBe(false);
  });

  it('consumeSseEventBlock ignores malformed JSON data line', () => {
    const block = 'data: not-json\n' + 'data: {"choices":[{"delta":{"content":"ok"}}]}\n';
    const { texts, sawDone } = consumeSseEventBlock(block);
    expect(texts).toEqual(['ok']);
    expect(sawDone).toBe(false);
  });

  it('readOpenAiCompatibleSse splits SSE across byte chunks before newline boundaries', async () => {
    const encoder = new TextEncoder();
    const fullPayload =
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":"B"}}]}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = encoder.encode(fullPayload);
        controller.enqueue(bytes.slice(0, 15));
        controller.enqueue(bytes.slice(15));
        controller.close();
      },
    });
    const res = new Response(stream);
    const parts: string[] = [];
    const text = await readOpenAiCompatibleSse(res, (d) => parts.push(d));
    expect(parts).toEqual(['A', 'B']);
    expect(text).toBe('AB');
  });

  it('readOpenAiCompatibleSse stops on [DONE] without trailing buffer', async () => {
    const encoder = new TextEncoder();
    const payload = 'data: {"choices":[{"delta":{"content":"x"}}]}\n\n' + 'data: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
    const res = new Response(stream);
    const full = await readOpenAiCompatibleSse(res, () => {});
    expect(full).toBe('x');
  });

  it('readOpenAiCompatibleSse returns empty string when no text deltas', async () => {
    const encoder = new TextEncoder();
    const payload = 'data: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
    const res = new Response(stream);
    const full = await readOpenAiCompatibleSse(res, () => {});
    expect(full).toBe('');
  });

  it('readOpenAiCompatibleSse throws when response has no body', async () => {
    const res = new Response(null);
    await expect(readOpenAiCompatibleSse(res, () => {})).rejects.toThrow('Streaming unavailable');
  });
});
