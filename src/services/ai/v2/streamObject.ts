/**
 * streamObject — streaming structured output.
 *
 * Streams raw JSON tokens while they arrive, and on completion validates
 * against the Zod schema (using jsonRepair as safety net). Callers get:
 *   - `textStream`: raw JSON chars as they come (for progress UI)
 *   - `object`: Promise<T> resolved/rejected at the end
 *
 * For UIs that want to render partial objects (e.g. "MCQ card filling in"),
 * consume `partialObjectStream` which emits `Partial<T>` snapshots parsed
 * leniently after each delta.
 */

import type { z } from 'zod';
import type { LanguageModelV2, ModelMessage } from './spec';
import { zodToJsonSchema } from './tool';
import { parseStructuredJson } from '../jsonRepair';

export interface StreamObjectOptions<T> {
  model: LanguageModelV2;
  messages: ModelMessage[];
  system?: string;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface StreamObjectResult<T> {
  textStream: AsyncIterable<string>;
  /** Lenient `Partial<T>` parse after each delta (undefined if not yet parseable). */
  partialObjectStream: AsyncIterable<Partial<T> | undefined>;
  object: Promise<T>;
}

export function streamObject<T>(options: StreamObjectOptions<T>): StreamObjectResult<T> {
  const prompt: ModelMessage[] = options.system
    ? [{ role: 'system', content: options.system }, ...options.messages]
    : [...options.messages];

  const jsonSchema = zodToJsonSchema(options.schema);
  const subscribers: Array<(p: { type: 'delta'; text: string } | { type: 'done' }) => void> = [];

  const makeIterable = <U>(map: (d: string) => U | undefined): AsyncIterable<U> => ({
    [Symbol.asyncIterator]() {
      const queue: U[] = [];
      let resolve: ((v: IteratorResult<U>) => void) | null = null;
      let done = false;
      subscribers.push((p) => {
        if (p.type === 'done') {
          done = true;
          if (resolve) {
            resolve({ value: undefined as unknown as U, done: true });
            resolve = null;
          }
          return;
        }
        const mapped = map(p.text);
        if (mapped === undefined) return;
        if (resolve) {
          resolve({ value: mapped, done: false });
          resolve = null;
        } else {
          queue.push(mapped);
        }
      });
      return {
        next(): Promise<IteratorResult<U>> {
          if (queue.length) return Promise.resolve({ value: queue.shift()!, done: false });
          if (done) return Promise.resolve({ value: undefined as unknown as U, done: true });
          return new Promise((r) => (resolve = r));
        },
      };
    },
  });

  let accumulated = '';

  const textStream = makeIterable<string>((text) => {
    accumulated += text;
    return text;
  });

  const partialObjectStream = makeIterable<Partial<T> | undefined>((_text) => {
    return tryParsePartial<T>(accumulated);
  });

  let resolveObject!: (v: T) => void;
  let rejectObject!: (e: unknown) => void;
  const object = new Promise<T>((res, rej) => {
    resolveObject = res;
    rejectObject = rej;
  });

  void (async () => {
    try {
      const { stream } = await options.model.doStream({
        prompt,
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
        abortSignal: options.abortSignal,
        responseFormat: { type: 'json', schema: jsonSchema },
      });
      for await (const part of stream) {
        if (part.type === 'text-delta' && !part.id.startsWith('reasoning-')) {
          for (const sub of subscribers) sub({ type: 'delta', text: part.delta });
        } else if (part.type === 'error') {
          throw part.error;
        }
      }
      const validated = await parseStructuredJson(accumulated, options.schema);
      resolveObject(validated);
    } catch (err) {
      rejectObject(err);
    } finally {
      for (const sub of subscribers) sub({ type: 'done' });
    }
  })();

  return { textStream, partialObjectStream, object };
}

/**
 * Best-effort lenient JSON parse for partial strings. Tries to balance
 * braces/brackets before parsing. Returns undefined if still unparseable.
 */
function tryParsePartial<T>(raw: string): Partial<T> | undefined {
  const trimmed = raw.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return undefined;

  // Quick balance: close any open {, [, " naively.
  let depthCurly = 0;
  let depthSquare = 0;
  let inString = false;
  let escape = false;
  for (const ch of trimmed) {
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    else if (!inString) {
      if (ch === '{') depthCurly++;
      else if (ch === '}') depthCurly--;
      else if (ch === '[') depthSquare++;
      else if (ch === ']') depthSquare--;
    }
  }

  let patched = trimmed;
  if (inString) patched += '"';
  while (depthSquare-- > 0) patched += ']';
  while (depthCurly-- > 0) patched += '}';

  try {
    return JSON.parse(patched) as Partial<T>;
  } catch {
    return undefined;
  }
}
