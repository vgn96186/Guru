/**
 * Push-based async iterator bridge for streaming providers.
 *
 * Used by adapters that don't natively produce AsyncIterable streams
 * (e.g. GitLab Duo, Gemini Nano, LiteRT) but instead push tokens via
 * callbacks. This bridge turns those callbacks into an AsyncIterable
 * of `LanguageModelV2StreamPart` that the v2 framework can consume.
 *
 * Before this utility, the same ~40-line pattern was copy-pasted in
 * 5 provider files.
 *
 * Also provides `toLegacyMessages()` — converts v2 ModelMessage[] to
 * the legacy Message[] format still required by some provider SDKs
 * (GitLab Duo, Poe). Was copy-pasted in 3 files.
 */

import type { LanguageModelV2StreamPart, ModelMessage } from '../spec';
import type { Message as LegacyMessage } from '../../types';

export interface StreamBridge {
  /** The AsyncIterable to return from `doStream()`. */
  stream: AsyncIterable<LanguageModelV2StreamPart>;
  /** Push a stream part into the iterable. */
  push: (part: LanguageModelV2StreamPart) => void;
  /** Signal that no more parts will be pushed. */
  end: () => void;
}

/**
 * Create a push-based async iterator bridge.
 *
 * Usage:
 *   const { stream, push, end } = createStreamBridge();
 *   someCallbackApi.onToken((token) => push({ type: 'text-delta', id: 'text-0', delta: token }));
 *   someCallbackApi.onDone(() => { push({ type: 'finish', finishReason: 'stop', usage: {} }); end(); });
 *   return { stream };
 */
export function createStreamBridge(): StreamBridge {
  const queue: LanguageModelV2StreamPart[] = [];
  let resolveNext: ((v: IteratorResult<LanguageModelV2StreamPart>) => void) | null = null;
  let done = false;

  const push = (part: LanguageModelV2StreamPart) => {
    if (resolveNext) {
      resolveNext({ value: part, done: false });
      resolveNext = null;
    } else {
      queue.push(part);
    }
  };

  const end = () => {
    done = true;
    if (resolveNext) {
      resolveNext({ value: undefined as unknown as LanguageModelV2StreamPart, done: true });
      resolveNext = null;
    }
  };

  const stream: AsyncIterable<LanguageModelV2StreamPart> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<LanguageModelV2StreamPart>> {
          if (queue.length) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as LanguageModelV2StreamPart,
              done: true,
            });
          }
          return new Promise((r) => (resolveNext = r));
        },
      };
    },
  };

  return { stream, push, end };
}

/**
 * Convert v2 ModelMessage[] to legacy Message[] format.
 *
 * Used by providers that still call legacy SDK functions (GitLab Duo, Poe)
 * which expect the simpler { role, content: string } shape.
 */
export function toLegacyMessages(messages: ModelMessage[]): LegacyMessage[] {
  const out: LegacyMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'tool') continue;
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : msg.content
            .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
            .map((p) => p.text)
            .join('\n');
    out.push({ role: msg.role, content });
  }
  return out;
}
