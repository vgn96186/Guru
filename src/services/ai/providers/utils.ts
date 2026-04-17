import type { Message } from '../types';
import { logStreamEvent } from '../runtimeDebug';

function splitForPseudoStream(text: string, targetChunkChars = 34): string[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length > 0 && current.length + part.length > targetChunkChars) {
      chunks.push(current);
      current = part;
      continue;
    }
    current += part;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

export async function emitPseudoStreamFallback(
  text: string,
  onDelta: (delta: string) => void,
  meta: {
    provider: string;
    model: string;
    reason: 'no_body' | 'empty_sse' | 'v4_chat_no_sse' | 'gateway_no_sse';
  },
) {
  const chunks = splitForPseudoStream(text);
  const targetDurationMs = Math.min(1400, Math.max(280, Math.round(text.length * 2.2)));
  const delayMs =
    chunks.length > 1
      ? Math.max(12, Math.min(56, Math.round(targetDurationMs / (chunks.length - 1))))
      : 0;

  logStreamEvent('fallback_chunk_stream_start', {
    provider: meta.provider,
    model: meta.model,
    reason: meta.reason,
    outputChars: text.length,
    chunks: chunks.length,
    delayMs,
  });

  for (let i = 0; i < chunks.length; i += 1) {
    onDelta(chunks[i]);
    if (delayMs > 0 && i < chunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  logStreamEvent('fallback_chunk_stream_complete', {
    provider: meta.provider,
    model: meta.model,
    reason: meta.reason,
    outputChars: text.length,
    chunks: chunks.length,
    delayMs,
  });
}

export function ensureJsonModeHint(messages: Message[]): Message[] {
  if (!messages.some((m) => m.content.toLowerCase().includes('json'))) {
    const cloned = [...messages];
    const systemIdx = cloned.findIndex((m) => m.role === 'system');
    const targetIdx = systemIdx !== -1 ? systemIdx : 0;
    cloned[targetIdx] = {
      ...cloned[targetIdx],
      content: cloned[targetIdx].content + '\nRespond in JSON format.',
    };
    return cloned;
  }
  return messages;
}

function truncateMessageMiddle(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  const head = Math.floor((maxLen - 120) * 0.5);
  const tail = maxLen - head - 80;
  const omitted = content.length - head - tail;
  return `${content.slice(0, head)}\n\n… [${omitted} characters omitted for API limit] …\n\n${content.slice(-tail)}`;
}

export function clampMessagesToCharBudget(
  messages: Message[],
  charBudget: number,
  devLogName: string,
): Message[] {
  const origChars = messages.reduce((s, m) => s + m.content.length, 0);
  const out = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let guard = 0; guard < 24; guard += 1) {
    const total = out.reduce((s, m) => s + m.content.length, 0);
    if (total <= charBudget) {
      if (__DEV__ && origChars > charBudget) {
        console.warn(`[AI] ${devLogName} messages clamped: ${origChars} → ${total} chars`);
      }
      return out;
    }
    let bestI = 0;
    let bestLen = 0;
    for (let i = 0; i < out.length; i += 1) {
      if (out[i].content.length > bestLen) {
        bestLen = out[i].content.length;
        bestI = i;
      }
    }
    if (bestLen < 900) break;
    const totalNow = out.reduce((s, m) => s + m.content.length, 0);
    const target = Math.max(800, bestLen - (totalNow - charBudget) - 400);
    out[bestI] = {
      ...out[bestI],
      content: truncateMessageMiddle(out[bestI].content, target),
    };
  }

  if (__DEV__) {
    const finalTotal = out.reduce((s, m) => s + m.content.length, 0);
    if (finalTotal > charBudget) {
      console.warn(
        `[AI] ${devLogName} clamp: messages still ~${finalTotal} chars (budget ${charBudget})`,
      );
    } else if (origChars > charBudget) {
      console.warn(`[AI] ${devLogName} messages clamped: ${origChars} → ${finalTotal} chars`);
    }
  }
  return out;
}
