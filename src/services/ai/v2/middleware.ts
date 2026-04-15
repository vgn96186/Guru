/**
 * Middleware — wrap a LanguageModelV2 with cross-cutting concerns.
 *
 * Usage:
 *   const logged = withMiddleware(base, { onRequest, onStart, onFinish, onError });
 *
 * Keep middleware narrowly scoped. Retries belong in `createFallbackModel`,
 * not here.
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
  LanguageModelV2Usage,
  FinishReason,
} from './spec';

export interface Middleware {
  onRequest?: (ctx: { provider: string; modelId: string; options: LanguageModelV2CallOptions }) => void;
  onStart?: (ctx: { provider: string; modelId: string; mode: 'generate' | 'stream' }) => void;
  onFinish?: (ctx: {
    provider: string;
    modelId: string;
    mode: 'generate' | 'stream';
    finishReason: FinishReason;
    usage: LanguageModelV2Usage;
    elapsedMs: number;
  }) => void;
  onError?: (ctx: { provider: string; modelId: string; mode: 'generate' | 'stream'; error: unknown }) => void;
}

export function withMiddleware(base: LanguageModelV2, mw: Middleware): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: base.provider,
    modelId: base.modelId,

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      const start = Date.now();
      mw.onRequest?.({ provider: base.provider, modelId: base.modelId, options });
      mw.onStart?.({ provider: base.provider, modelId: base.modelId, mode: 'generate' });
      try {
        const result = await base.doGenerate(options);
        mw.onFinish?.({
          provider: base.provider,
          modelId: base.modelId,
          mode: 'generate',
          finishReason: result.finishReason,
          usage: result.usage,
          elapsedMs: Date.now() - start,
        });
        return result;
      } catch (err) {
        mw.onError?.({ provider: base.provider, modelId: base.modelId, mode: 'generate', error: err });
        throw err;
      }
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      const start = Date.now();
      mw.onRequest?.({ provider: base.provider, modelId: base.modelId, options });
      mw.onStart?.({ provider: base.provider, modelId: base.modelId, mode: 'stream' });
      let inner: LanguageModelV2StreamResult;
      try {
        inner = await base.doStream(options);
      } catch (err) {
        mw.onError?.({ provider: base.provider, modelId: base.modelId, mode: 'stream', error: err });
        throw err;
      }

      const { provider, modelId } = base;
      async function* wrapped(): AsyncGenerator<LanguageModelV2StreamPart> {
        try {
          for await (const part of inner.stream) {
            if (part.type === 'finish') {
              mw.onFinish?.({
                provider,
                modelId,
                mode: 'stream',
                finishReason: part.finishReason,
                usage: part.usage,
                elapsedMs: Date.now() - start,
              });
            } else if (part.type === 'error') {
              mw.onError?.({ provider, modelId, mode: 'stream', error: part.error });
            }
            yield part;
          }
        } catch (err) {
          mw.onError?.({ provider, modelId, mode: 'stream', error: err });
          throw err;
        }
      }

      return { stream: wrapped(), rawResponse: inner.rawResponse };
    },
  };
}
