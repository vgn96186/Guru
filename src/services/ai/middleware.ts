// AI SDK v6 middleware wrapper — strict types applied
/**
 * Middleware — wrap a LanguageModel with cross-cutting concerns.
 *
 * Usage:
 *   const logged = withMiddleware(base, { onRequest, onStart, onFinish, onError });
 *
 * Keep middleware narrowly scoped. Retries belong in `createFallbackModel`,
 * not here.
 */

import type { FinishReason } from 'ai';
import type {
  LanguageModelV2 as LanguageModel,
  LanguageModelV2CallOptions as LanguageModelCallOptions,
  LanguageModelV2StreamPart as LanguageModelStreamPart,
  LanguageModelV2Usage as LanguageModelUsage,
} from '@ai-sdk/provider';
// Infer result types from the base LanguageModel's doGenerate/doStream signatures
type LanguageModelGenerateResult = Awaited<ReturnType<LanguageModel['doGenerate']>>;
type LanguageModelStreamResult = Awaited<ReturnType<LanguageModel['doStream']>>;

export interface Middleware {
  onRequest?: (ctx: {
    provider: string;
    modelId: string;
    options: LanguageModelCallOptions;
  }) => void;
  onStart?: (ctx: { provider: string; modelId: string; mode: 'generate' | 'stream' }) => void;
  onFinish?: (ctx: {
    provider: string;
    modelId: string;
    mode: 'generate' | 'stream';
    finishReason: FinishReason;
    usage: LanguageModelUsage;
    elapsedMs: number;
  }) => void;
  onError?: (ctx: {
    provider: string;
    modelId: string;
    mode: 'generate' | 'stream';
    error: unknown;
  }) => void;
}

export function withMiddleware(base: LanguageModel, mw: Middleware): LanguageModel {
  return {
    specificationVersion: 'v2',
    provider: base.provider,
    modelId: base.modelId,

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
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
        mw.onError?.({
          provider: base.provider,
          modelId: base.modelId,
          mode: 'generate',
          error: err,
        });
        throw err;
      }
    },

    async doStream(options): Promise<LanguageModelStreamResult> {
      const start = Date.now();
      mw.onRequest?.({ provider: base.provider, modelId: base.modelId, options });
      mw.onStart?.({ provider: base.provider, modelId: base.modelId, mode: 'stream' });
      let inner: LanguageModelStreamResult;
      try {
        inner = await base.doStream(options);
      } catch (err) {
        mw.onError?.({
          provider: base.provider,
          modelId: base.modelId,
          mode: 'stream',
          error: err,
        });
        throw err;
      }

      const { provider, modelId } = base;
      async function* wrapped(): AsyncGenerator<LanguageModelStreamPart> {
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

      return { stream: wrapped(), response: inner.response };
    },
  };
}
