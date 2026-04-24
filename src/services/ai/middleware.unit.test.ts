import type {
  LanguageModelV2 as LanguageModel,
  LanguageModelV2StreamPart as LanguageModelStreamPart,
} from '@ai-sdk/provider';
import { withMiddleware } from './middleware';

function makeStream(parts: LanguageModelStreamPart[]): ReadableStream<LanguageModelStreamPart> {
  return new ReadableStream<LanguageModelStreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(
  stream: ReadableStream<LanguageModelStreamPart>,
): Promise<LanguageModelStreamPart[]> {
  const reader = stream.getReader();
  const parts: LanguageModelStreamPart[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return parts;
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

describe('withMiddleware', () => {
  it('preserves supportedUrls and normalizes unknown stream finish reasons', async () => {
    const onFinish = jest.fn();
    const supportedUrls = { web: [/example\\.com/] };
    const base = {
      specificationVersion: 'v2',
      provider: 'mock',
      modelId: 'mock-1',
      supportedUrls,
      async doGenerate() {
        throw new Error('not used');
      },
      async doStream() {
        return {
          stream: makeStream([
            {
              type: 'finish',
              finishReason: 'unknown',
              usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
            },
          ]),
          response: { headers: {} },
        };
      },
    } satisfies LanguageModel;

    const wrapped = withMiddleware(base, { onFinish });
    const result = await wrapped.doStream({ prompt: [] });

    expect(wrapped.supportedUrls).toBe(supportedUrls);
    await expect(readAll(result.stream)).resolves.toEqual([
      {
        type: 'finish',
        finishReason: 'unknown',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      },
    ]);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'mock',
        modelId: 'mock-1',
        mode: 'stream',
        finishReason: 'other',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      }),
    );
  });
});
