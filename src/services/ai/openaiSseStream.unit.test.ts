import { consumeSseEventBlock, readOpenAiCompatibleSse } from './openaiSseStream';

describe('openaiSseStream', () => {
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
});
