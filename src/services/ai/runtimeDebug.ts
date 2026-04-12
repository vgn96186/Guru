import type { Message } from './types';
import { markAiRuntimeFinish, markAiRuntimeStart } from './runtimeActivity';

const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
let nextRequestId = 1;
const MAX_REPLY_LOG_CHARS = 8000;
const REPLY_LOG_CHUNK_CHARS = 1200;

function sanitizePreview(text: string, maxLen = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function clipReplyText(
  text: string,
  maxLen = MAX_REPLY_LOG_CHARS,
): {
  text: string;
  wasTruncated: boolean;
} {
  const normalized = text.trim();
  if (normalized.length <= maxLen) {
    return { text: normalized, wasTruncated: false };
  }
  return {
    text: `${normalized.slice(0, maxLen)}\n...[reply log clipped]`,
    wasTruncated: true,
  };
}

function splitIntoChunks(text: string, chunkSize = REPLY_LOG_CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

export function createAiRequestTrace(
  kind: 'json' | 'text' | 'stream',
  messages: Message[],
  meta?: Record<string, unknown>,
) {
  const requestId = `${kind}-${nextRequestId++}`;
  const startedAt = Date.now();
  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const promptPreview = sanitizePreview(messages[messages.length - 1]?.content ?? '', 120);

  if (isDev) {
    console.info('[AI_TRACE] start', {
      requestId,
      kind,
      messageCount: messages.length,
      promptChars,
      promptPreview,
      ...meta,
    });
  }

  markAiRuntimeStart({
    requestId,
    kind,
    startedAt,
  });

  return {
    requestId,
    startedAt,
    success(metaUpdate?: Record<string, unknown>) {
      markAiRuntimeFinish(requestId, {
        kind,
        backend: typeof metaUpdate?.backend === 'string' ? metaUpdate.backend : undefined,
        modelUsed: typeof metaUpdate?.modelUsed === 'string' ? metaUpdate.modelUsed : undefined,
      });
      if (!isDev) return;
      console.info('[AI_TRACE] success', {
        requestId,
        kind,
        elapsedMs: Date.now() - startedAt,
        ...metaUpdate,
      });

      const responseText =
        typeof metaUpdate?.responseText === 'string' ? metaUpdate.responseText : null;
      if (responseText) {
        const clipped = clipReplyText(responseText);
        console.info('[AI_REPLY]', {
          requestId,
          kind,
          chars: responseText.length,
          clipped: clipped.wasTruncated,
        });
        const chunks = splitIntoChunks(clipped.text);
        chunks.forEach((chunk, index) => {
          console.info(
            `[AI_REPLY_TEXT] requestId=${requestId} kind=${kind} chunk=${index + 1}/${
              chunks.length
            }\n${chunk}`,
          );
        });
      }
    },
    fail(error: unknown, metaUpdate?: Record<string, unknown>) {
      markAiRuntimeFinish(
        requestId,
        {
          kind,
          backend: typeof metaUpdate?.backend === 'string' ? metaUpdate.backend : undefined,
          modelUsed: typeof metaUpdate?.modelUsed === 'string' ? metaUpdate.modelUsed : undefined,
        },
        error instanceof Error ? error.message : String(error),
      );
      if (!isDev) return;
      console.warn('[AI_TRACE] fail', {
        requestId,
        kind,
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        ...metaUpdate,
      });
    },
  };
}

export function logJsonParseSummary(meta: {
  rawLength: number;
  candidateCount: number;
  preview: string;
}) {
  if (!isDev) return;
  console.info('[AI_PARSE] received', meta);
}

export function logJsonParseSuccess(meta: { candidateIndex: number; candidateLength: number }) {
  if (!isDev) return;
  console.info('[AI_PARSE] success', meta);
}

export function logJsonParseFailure(meta: {
  candidateCount: number;
  candidateLengths: number[];
  error?: string;
}) {
  if (!isDev) return;
  console.warn('[AI_PARSE] failed', meta);
}

export function logBootstrapEvent(event: string, meta?: Record<string, unknown>) {
  if (!isDev) return;
  console.info('[BOOTSTRAP_TRACE]', { event, ...meta });
}

export function logGroundingEvent(event: string, meta?: Record<string, unknown>) {
  if (!isDev) return;
  console.info('[GROUNDING_TRACE]', { event, ...meta });
}

export function logStreamEvent(event: string, meta?: Record<string, unknown>) {
  if (!isDev) return;
  console.info('[STREAM_TRACE]', { event, ...meta });
}

export function previewText(text: string, maxLen = 160): string {
  return sanitizePreview(text, maxLen);
}
