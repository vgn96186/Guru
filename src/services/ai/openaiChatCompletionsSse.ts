/**
 * OpenAI Chat Completions SSE — single implementation for:
 * - Legacy `readOpenAiCompatibleSse(response, onDelta)` (providers + llmRouting)
 * - AI v2 `LanguageModelV2` streaming via `sseToStreamParts` → streamText
 *
 * Keep streaming parse logic in one place to avoid drift between helpers.
 */

import type { FinishReason, LanguageModelV2StreamPart, LanguageModelV2Usage } from './v2/spec';

/** Extract text deltas from one SSE event block (content between blank lines). */
export function consumeSseEventBlock(block: string): { texts: string[]; sawDone: boolean } {
  const texts: string[] = [];
  let sawDone = false;
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') {
      sawDone = true;
      continue;
    }
    try {
      const json = JSON.parse(payload);
      const ch0 = json?.choices?.[0];
      const piece =
        (typeof ch0?.delta?.content === 'string' && ch0.delta.content) ||
        (typeof ch0?.message?.content === 'string' && ch0.message.content) ||
        (typeof ch0?.delta?.reasoning === 'string' && ch0.delta.reasoning) ||
        (typeof ch0?.delta?.reasoning_content === 'string' && ch0.delta.reasoning_content) ||
        '';
      if (piece.length) {
        texts.push(piece);
      }
    } catch {
      // ignore malformed JSON lines
    }
  }
  return { texts, sawDone };
}

export function mapFinishReason(r: string | undefined): FinishReason {
  switch (r) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'tool_calls':
    case 'function_call':
      return 'tool-calls';
    case 'content_filter':
      return 'content-filter';
    default:
      return r ? 'other' : 'stop';
  }
}

/**
 * Rich stream parts for LanguageModelV2.doStream (tool calls, text lifecycle, finish).
 */
export async function* sseToStreamParts(
  response: Response,
): AsyncGenerator<LanguageModelV2StreamPart> {
  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: new Error('No readable body') };
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  const textId = 'text-0';
  let textStarted = false;

  const toolAccum = new Map<number, { id: string; name: string; args: string }>();

  let finishReason: FinishReason = 'stop';
  const usage: LanguageModelV2Usage = {};

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();

    let match: RegExpExecArray | null;
    const boundaryRegex = /\r?\n\r?\n/g;

    // Process all complete chunks
    while ((match = boundaryRegex.exec(buffer)) !== null) {
      const boundary = match.index;
      const boundaryLength = match[0].length;
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + boundaryLength);
      boundaryRegex.lastIndex = 0;
      for (const line of rawEvent.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          for (const [, tc] of toolAccum) {
            let input: unknown = {};
            try {
              input = tc.args ? JSON.parse(tc.args) : {};
            } catch {
              input = { _raw: tc.args };
            }
            yield { type: 'tool-call', toolCallId: tc.id, toolName: tc.name, input };
          }
          yield { type: 'finish', finishReason, usage };
          return;
        }
        try {
          const json = JSON.parse(payload);
          if (json?.usage) {
            usage.inputTokens = json.usage.prompt_tokens;
            usage.outputTokens = json.usage.completion_tokens;
            usage.totalTokens = json.usage.total_tokens;
          }
          const choice = json?.choices?.[0];
          const delta = choice?.delta ?? {};
          const msg = choice?.message;
          const messageFallback =
            typeof msg?.content === 'string' && msg.content ? msg.content : '';

          let primaryText = '';
          if (typeof delta.content === 'string' && delta.content) {
            primaryText = delta.content;
          } else if (messageFallback) {
            primaryText = messageFallback;
          }

          if (primaryText) {
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            yield { type: 'text-delta', id: textId, delta: primaryText };
          }

          const reasoningDelta =
            (typeof delta.reasoning === 'string' && delta.reasoning) ||
            (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
            '';
          if (reasoningDelta) {
            if (!textStarted) {
              textStarted = true;
              yield { type: 'text-start', id: textId };
            }
            yield { type: 'text-delta', id: `reasoning-${textId}`, delta: reasoningDelta };
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              const existing = toolAccum.get(idx) ?? { id: '', name: '', args: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              toolAccum.set(idx, existing);
            }
          }
          if (choice?.finish_reason) {
            finishReason = mapFinishReason(choice.finish_reason);
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    if (done) {
      // Process any remaining buffer that didn't end with a newline boundary
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            for (const [, tc] of toolAccum) {
              let input: unknown = {};
              try {
                input = tc.args ? JSON.parse(tc.args) : {};
              } catch {
                input = { _raw: tc.args };
              }
              yield { type: 'tool-call', toolCallId: tc.id, toolName: tc.name, input };
            }
            yield { type: 'finish', finishReason, usage };
            return;
          }
          try {
            const json = JSON.parse(payload);
            const choice = json?.choices?.[0];
            const delta = choice?.delta ?? {};
            if (typeof delta.content === 'string' && delta.content) {
              if (!textStarted) {
                textStarted = true;
                yield { type: 'text-start', id: textId };
              }
              yield { type: 'text-delta', id: textId, delta: delta.content };
            }
          } catch {
            // ignore
          }
        }
      }

      if (textStarted) yield { type: 'text-end', id: textId };
      yield { type: 'finish', finishReason, usage };
      return;
    }
  }
}

/**
 * Reads an HTTP response body as an OpenAI-style SSE stream and accumulates assistant text.
 * Invokes onDelta for each token chunk (content and reasoning, matching legacy contract).
 */
export async function readOpenAiCompatibleSse(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<string> {
  if (!response.body) {
    throw new Error('Streaming unavailable: response has no readable body');
  }

  let full = '';
  for await (const part of sseToStreamParts(response)) {
    if (part.type === 'text-delta') {
      onDelta(part.delta);
      full += part.delta;
    }
    if (part.type === 'error') {
      const err = part.error;
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  return full;
}
