/**
 * Fallback model — verifies the peek-first-chunk fallback semantics.
 */

import { createFallbackModel } from './providers/fallback';
import type { LanguageModelV2, LanguageModelV2StreamPart } from './spec';

function ok(parts: LanguageModelV2StreamPart[]): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'ok',
    modelId: 'ok-1',
    async doGenerate() {
      return { content: [{ type: 'text', text: 'ok' }], finishReason: 'stop', usage: {} };
    },
    async doStream() {
      async function* gen() {
        for (const p of parts) yield p;
      }
      return { stream: gen() };
    },
  };
}

function throws(): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'throws',
    modelId: 'throws-1',
    async doGenerate() {
      throw new Error('boom');
    },
    async doStream() {
      throw new Error('stream-boom');
    },
  };
}

function firstChunkIsError(): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'err',
    modelId: 'err-1',
    async doGenerate() {
      throw new Error('gen-err');
    },
    async doStream() {
      async function* gen(): AsyncGenerator<LanguageModelV2StreamPart> {
        yield { type: 'error', error: new Error('first-chunk-error') };
      }
      return { stream: gen() };
    },
  };
}

describe('createFallbackModel', () => {
  it('falls through doGenerate failures to the next model', async () => {
    const model = createFallbackModel({
      models: [throws(), ok([])],
    });
    const result = await model.doGenerate({ prompt: [] });
    expect(result.finishReason).toBe('stop');
  });

  it('falls through doStream thrown errors', async () => {
    const model = createFallbackModel({
      models: [
        throws(),
        ok([
          { type: 'text-delta', id: 'a', delta: 'hello' },
          { type: 'finish', finishReason: 'stop', usage: {} },
        ]),
      ],
    });
    const result = await model.doStream({ prompt: [] });
    const chunks: string[] = [];
    for await (const p of result.stream) {
      if (p.type === 'text-delta') chunks.push(p.delta);
    }
    expect(chunks.join('')).toBe('hello');
  });

  it('falls through when first stream chunk is an error part', async () => {
    const model = createFallbackModel({
      models: [
        firstChunkIsError(),
        ok([
          { type: 'text-delta', id: 'a', delta: 'recovered' },
          { type: 'finish', finishReason: 'stop', usage: {} },
        ]),
      ],
    });
    const result = await model.doStream({ prompt: [] });
    const chunks: string[] = [];
    for await (const p of result.stream) {
      if (p.type === 'text-delta') chunks.push(p.delta);
    }
    expect(chunks.join('')).toBe('recovered');
  });

  it('throws when all providers fail', async () => {
    const model = createFallbackModel({ models: [throws(), throws()] });
    await expect(model.doGenerate({ prompt: [] })).rejects.toThrow(/boom/);
  });

  it('invokes onProviderError / onProviderSuccess', async () => {
    const errs: string[] = [];
    const succs: string[] = [];
    const model = createFallbackModel({
      models: [throws(), ok([{ type: 'finish', finishReason: 'stop', usage: {} }])],
      onProviderError: (p) => errs.push(p),
      onProviderSuccess: (p) => succs.push(p),
    });
    await model.doGenerate({ prompt: [] });
    expect(errs).toEqual(['throws']);
    expect(succs).toEqual(['ok']);
  });
});
