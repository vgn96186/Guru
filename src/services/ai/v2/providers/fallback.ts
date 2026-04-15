/**
 * Fallback model — Guru's moat, expressed as a LanguageModelV2.
 *
 * Wraps an ordered list of LanguageModelV2 instances. On each call, tries
 * them in order; if one throws (or the stream errors before any token),
 * moves to the next. Once a stream starts emitting tokens, we commit to that
 * provider for the remainder of that call.
 *
 * This is how you keep Guru's 12-provider resilience after adopting the
 * unified API: build concrete provider adapters (Groq, OpenRouter, …) and
 * wrap them here. The REST of the SDK (streamText, generateObject, useChat)
 * treats the fallback as a single model.
 */

import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamPart,
  LanguageModelV2StreamResult,
} from '../spec';

export interface FallbackModelOptions {
  models: LanguageModelV2[];
  /** Called when a model fails; useful for telemetry / providerHealth.ts. */
  onProviderError?: (provider: string, modelId: string, error: unknown) => void;
  /** Called when a model succeeds so health bookkeeping can react. */
  onProviderSuccess?: (provider: string, modelId: string) => void;
}

export function createFallbackModel(opts: FallbackModelOptions): LanguageModelV2 {
  if (!opts.models.length) {
    throw new Error('createFallbackModel: at least one model required');
  }
  const first = opts.models[0];

  return {
    specificationVersion: 'v2',
    provider: 'fallback',
    modelId: opts.models.map((m) => `${m.provider}/${m.modelId}`).join('|'),

    async doGenerate(options): Promise<LanguageModelV2GenerateResult> {
      let lastError: unknown;
      for (const model of opts.models) {
        try {
          const result = await model.doGenerate(options);
          opts.onProviderSuccess?.(model.provider, model.modelId);
          return result;
        } catch (err) {
          lastError = err;
          opts.onProviderError?.(model.provider, model.modelId, err);
        }
      }
      throw lastError ?? new Error('All fallback providers failed');
    },

    async doStream(options): Promise<LanguageModelV2StreamResult> {
      let lastError: unknown;
      for (const model of opts.models) {
        try {
          const attempt = await tryStream(model, options);
          if (attempt) {
            opts.onProviderSuccess?.(model.provider, model.modelId);
            return attempt;
          }
        } catch (err) {
          lastError = err;
          opts.onProviderError?.(model.provider, model.modelId, err);
        }
      }
      throw lastError ?? new Error('All fallback providers failed');
    },
  };
}

/**
 * Peek at the first stream part. If it's an 'error', treat as provider failure
 * and fall through. If it's anything else, wrap a fresh AsyncIterable that
 * replays the peeked part + continues.
 */
async function tryStream(
  model: LanguageModelV2,
  options: LanguageModelV2CallOptions,
): Promise<LanguageModelV2StreamResult | null> {
  const result = await model.doStream(options);
  const iterator = result.stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    // Empty stream — treat as failure so next provider is tried.
    return null;
  }
  if (first.value.type === 'error') {
    throw first.value.error;
  }

  async function* wrapped(): AsyncGenerator<LanguageModelV2StreamPart> {
    yield first.value;
    while (true) {
      const { done, value } = await iterator.next();
      if (done) return;
      yield value;
    }
  }

  return { stream: wrapped(), rawResponse: result.rawResponse };
}
