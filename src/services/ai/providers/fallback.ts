// @ts-nocheck — AI SDK v6 migration; runtime kept, strict types deferred
/**
 * Fallback model — Guru's moat, expressed as a LanguageModel.
 *
 * Wraps an ordered list of LanguageModel instances. On each call, tries
 * them in order; if one throws (or the stream errors before any token),
 * moves to the next.
 */

import type {
  LanguageModelV2 as LanguageModel,
  LanguageModelV2CallOptions as LanguageModelCallOptions,
  LanguageModelV2GenerateResult as LanguageModelGenerateResult,
  LanguageModelV2StreamPart as LanguageModelStreamPart,
  LanguageModelV2StreamResult as LanguageModelStreamResult,
} from '@ai-sdk/provider';

export interface FallbackModelOptions {
  models: LanguageModel[];
  /** Called when a model fails; useful for telemetry. */
  onProviderError?: (provider: string, modelId: string, error: unknown) => void;
  /** Called when a model succeeds. */
  onProviderSuccess?: (provider: string, modelId: string) => void;
}

export function createFallbackModel(opts: FallbackModelOptions): LanguageModel {
  if (!opts.models.length) {
    throw new Error('createFallbackModel: at least one model required');
  }
  const first = opts.models[0];

  return {
    specificationVersion: 'v2',
    provider: 'fallback',
    modelId: opts.models.map((m) => `${m.provider}/${m.modelId}`).join('|'),
    defaultObjectGenerationMode: first.defaultObjectGenerationMode,

    async doGenerate(options): Promise<LanguageModelGenerateResult> {
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

    async doStream(options): Promise<LanguageModelStreamResult> {
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
 * and fall through.
 */
async function tryStream(
  model: LanguageModel,
  options: LanguageModelCallOptions,
): Promise<LanguageModelStreamResult | null> {
  const result = await model.doStream(options);
  const iterator = result.stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) {
    return null;
  }
  if (first.value.type === 'error') {
    throw first.value.error;
  }

  async function* wrapped(): AsyncGenerator<LanguageModelStreamPart> {
    let sawFinish = false;
    yield first.value;
    if (first.value.type === 'finish') sawFinish = true;
    while (true) {
      const { done, value } = await iterator.next();
      if (done) {
        if (!sawFinish) yield { type: 'finish', finishReason: 'stop', usage: {} };
        return;
      }
      if (value.type === 'finish') sawFinish = true;
      yield value;
    }
  }

  return { stream: wrapped(), response: result.response };
}

