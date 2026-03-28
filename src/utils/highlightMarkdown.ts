const HIGHLIGHT_STOPWORDS = new Set([
  'about',
  'after',
  'because',
  'before',
  'between',
  'correct',
  'diagnosis',
  'during',
  'explanation',
  'following',
  'important',
  'management',
  'memory',
  'option',
  'options',
  'patient',
  'question',
  'remember',
  'treatment',
  'visible',
  'which',
  'wrong',
]);

export function emphasizeHighYieldMarkdown(markdown: string, maxHighlights = 4): string {
  const trimmed = markdown?.trim();
  if (!trimmed) return markdown;

  const protectedSegments: string[] = [];
  const working = markdown.replace(/\*\*[^*]+\*\*/g, (match) => {
    protectedSegments.push(match);
    return String.fromCharCode(0xe000 + protectedSegments.length - 1);
  });
  const existingBoldCount = protectedSegments.length;
  const remainingHighlights = Math.max(0, maxHighlights - existingBoldCount);
  if (remainingHighlights === 0) return markdown;

  const candidates: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b\d+(?:\.\d+)?\s?(?:%|mg|mcg|g|kg|mmHg|mEq|mL|L|mm|cm|days?|weeks?|months?|years?|hrs?|hours?|minutes?|mins?)\b/g,
    /\b(?:[A-Z]{2,}(?:-[A-Z0-9]+)*|[A-Za-z]*\d+[A-Za-z0-9-]*|[A-Za-z]+(?:-[A-Za-z0-9]+)+)\b/g,
    /\b[a-z]{9,}\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of working.matchAll(pattern)) {
      const value = match[0]?.trim();
      const key = value?.toLowerCase();
      if (!value || !key || seen.has(key) || HIGHLIGHT_STOPWORDS.has(key)) continue;
      if (
        candidates.some((candidate) => {
          const existing = candidate.toLowerCase();
          return existing.includes(key) || key.includes(existing);
        })
      ) {
        continue;
      }
      seen.add(key);
      candidates.push(value);
      if (candidates.length >= remainingHighlights) break;
    }
    if (candidates.length >= remainingHighlights) break;
  }

  if (candidates.length === 0) return markdown;

  let result = working;
  for (const candidate of candidates) {
    result = result.replace(candidate, `**${candidate}**`);
  }

  return protectedSegments.reduce(
    (restored, segment, index) => restored.replaceAll(String.fromCharCode(0xe000 + index), segment),
    result,
  );
}
