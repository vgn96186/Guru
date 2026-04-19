const tokenListeners: Array<(event: { token: string }) => void> = [];
const completeListeners: Array<(event: { text: string; backend: string }) => void> = [];
const errorListeners: Array<(event: { error: string }) => void> = [];
const chatStreamMock = jest.fn();
const cancelMock = jest.fn(async () => undefined);

jest.mock('local-llm', () => ({
  chatStream: (...args: unknown[]) => chatStreamMock(...args),
  cancel: () => cancelMock(),
  addLlmTokenListener: (listener: (event: { token: string }) => void) => {
    tokenListeners.push(listener);
    return {
      remove: () => {
        const index = tokenListeners.indexOf(listener);
        if (index >= 0) tokenListeners.splice(index, 1);
      },
    };
  },
  addLlmCompleteListener: (listener: (event: { text: string; backend: string }) => void) => {
    completeListeners.push(listener);
    return {
      remove: () => {
        const index = completeListeners.indexOf(listener);
        if (index >= 0) completeListeners.splice(index, 1);
      },
    };
  },
  addLlmErrorListener: (listener: (event: { error: string }) => void) => {
    errorListeners.push(listener);
    return {
      remove: () => {
        const index = errorListeners.indexOf(listener);
        if (index >= 0) errorListeners.splice(index, 1);
      },
    };
  },
}));

import { createLiteRtModel } from './liteRtLm';
import type { LanguageModelStreamPart } from '@ai-sdk/provider';

async function collectStreamParts(parts: AsyncIterable<LanguageModelStreamPart>) {
  const seen: LanguageModelStreamPart[] = [];
  for await (const part of parts) {
    seen.push(part);
  }
  return seen;
}

describe('createLiteRtModel', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let prevDev: unknown;

  beforeEach(() => {
    prevDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = true;
    tokenListeners.length = 0;
    completeListeners.length = 0;
    errorListeners.length = 0;
    chatStreamMock.mockReset();
    cancelMock.mockClear();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    (globalThis as any).__DEV__ = prevDev;
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('emits the completion text when native streaming finishes without token events', async () => {
    chatStreamMock.mockImplementation(async () => {
      completeListeners[0]?.({ text: 'Recovered from completion', backend: 'gpu' });
      return { status: 'streaming' };
    });

    const model = createLiteRtModel({ modelPath: '/models/gemma-4-e4b.litertlm' });
    const result = await model.doStream({
      prompt: [{ role: 'user', content: 'Explain neuroanatomy' }],
    });
    const parts = await collectStreamParts(result.stream);

    expect(parts).toEqual([
      { type: 'text-delta', delta: 'Recovered from completion' },
      { type: 'finish', finishReason: 'stop', usage: {} },
    ]);
    expect(logSpy).toHaveBeenCalledWith(
      '[LiteRT_JS] stream_start',
      expect.any(Object)
    );
  });

  it('surfaces an error when native streaming completes with no text at all', async () => {
    chatStreamMock.mockImplementation(async () => {
      completeListeners[0]?.({ text: '', backend: 'gpu' });
      return { status: 'streaming' };
    });

    const model = createLiteRtModel({ modelPath: '/models/gemma-4-e4b.litertlm' });
    const result = await model.doStream({
      prompt: [{ role: 'user', content: 'Explain neuroanatomy' }],
    });
    const parts = await collectStreamParts(result.stream);

    expect(parts).toHaveLength(2);
    expect(parts[0]?.type).toBe('error');
    expect(parts[1]).toEqual({ type: 'finish', finishReason: 'stop', usage: {} });
  });

  it('logs payload details for local streams', async () => {
    chatStreamMock.mockImplementation(async () => {
      tokenListeners[0]?.({ token: 'Neuro' });
      tokenListeners[0]?.({ token: 'anatomy' });
      completeListeners[0]?.({ text: 'Neuroanatomy', backend: 'gpu' });
      return { status: 'streaming' };
    });

    const model = createLiteRtModel({ modelPath: '/models/gemma-4-e4b.litertlm' });
    const result = await model.doStream({
      prompt: [{ role: 'user', content: 'Explain neuroanatomy' }],
    });
    await collectStreamParts(result.stream);

    expect(logSpy).toHaveBeenCalledWith(
      '[LiteRT_JS] stream_start',
      expect.objectContaining({
        promptCount: 1,
        modelPath: '/models/gemma-4-e4b.litertlm',
      }),
    );
  });
});
