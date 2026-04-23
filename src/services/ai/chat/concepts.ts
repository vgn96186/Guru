export const QUESTION_PREFIX_RE = /^question:\s*/i;
export const QUESTION_STOPWORDS = new Set([
  'a',
  'an',
  'are',
  'be',
  'called',
  'can',
  'do',
  'does',
  'for',
  'how',
  'if',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'the',
  'their',
  'this',
  'to',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'your',
]);

export function normalizeQuestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(QUESTION_PREFIX_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractKeyTerms(text: string): string[] {
  return Array.from(
    new Set(
      normalizeQuestionText(text)
        .split(' ')
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !QUESTION_STOPWORDS.has(term)),
    ),
  );
}

export function buildConceptKey(text: string): string {
  return extractKeyTerms(text).slice(0, 5).join('_');
}

export function conceptOverlap(a: string, b: string): boolean {
  const aTerms = extractKeyTerms(a);
  const bTerms = extractKeyTerms(b);
  if (aTerms.length === 0 || bTerms.length === 0) return false;
  const bSet = new Set(bTerms);
  const overlapCount = aTerms.filter((term) => bSet.has(term)).length;
  const minLen = Math.min(aTerms.length, bTerms.length);
  return (
    overlapCount >= Math.min(2, minLen) ||
    overlapCount / Math.max(aTerms.length, bTerms.length) >= 0.6
  );
}

export function dedupeConcepts(values: Array<string | null | undefined>): string[] {
  const items: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (!trimmed) continue;
    if (items.some((existing) => conceptOverlap(existing, trimmed))) continue;
    items.push(trimmed);
  }
  return items;
}
