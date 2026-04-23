import type { Message } from '../types';

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[*_`()[\]{}:;,.!?'"\\/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function hasTailPrefixOverlap(base: string, continuation: string): boolean {
  const baseWords = normalizeWords(base).slice(-6);
  const continuationWords = normalizeWords(continuation).slice(0, 8);
  const maxLen = Math.min(baseWords.length, continuationWords.length, 4);
  for (let len = maxLen; len >= 2; len -= 1) {
    const baseSlice = baseWords.slice(-len).join(' ');
    const continuationSlice = continuationWords.slice(0, len).join(' ');
    if (baseSlice && baseSlice === continuationSlice) return true;
  }
  return false;
}

export function looksLikeRestartedReply(base: string, continuation: string): boolean {
  const trimmedBase = base.trim();
  const trimmedContinuation = continuation.trim();
  if (!trimmedBase || !trimmedContinuation) return false;
  if (/[.!?]["')\]]?$/.test(trimmedBase)) return false;
  if (hasTailPrefixOverlap(trimmedBase, trimmedContinuation)) return false;
  return /^(correct|exactly|yes|no|the\b|this\b|that\b|remember\b|it\b|both\b|\*\*)/i.test(
    trimmedContinuation,
  );
}

export function hasUsefulContinuation(base: string, continuation: string): boolean {
  const c = continuation.trim();
  if (!c) return false;
  if (c.length < 8) return false;
  if (base.includes(c)) return false;
  if (looksLikeRestartedReply(base, c)) return false;
  return true;
}

export function appendContinuation(base: string, continuation: string): string {
  const b = base.trimEnd();
  const c = continuation.trim();
  if (!c) return b;
  if (/^[,.;:!?)}\]]/.test(c) || b.endsWith(' ')) return `${b}${c}`;
  return `${b} ${c}`;
}

export function buildContinuationMessages(base: Message[], partialReply: string): Message[] {
  const trailingExcerpt = partialReply.trim().slice(-120);
  return [
    ...base,
    { role: 'assistant', content: partialReply },
    {
      role: 'user',
      content: `Continue exactly from where your previous reply stopped.
Do not restart the answer.
Do not repeat any prior text.
Do not answer the student's earlier question from scratch.
Return only the missing continuation that comes immediately after this trailing excerpt:
"${trailingExcerpt}"`,
    },
  ];
}
