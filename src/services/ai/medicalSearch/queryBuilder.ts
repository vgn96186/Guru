import { clipText, compactWhitespace } from './utils';

export function buildMedicalSearchQuery(question: string, topicName?: string): string {
  const base = compactWhitespace(`${topicName ?? ''} ${question}`.trim());
  const cleaned = base.replace(/[^\w\s\-(),./]/g, ' ');
  return clipText(
    `${cleaned} (India OR Indian OR ICMR OR AIIMS OR WHO OR guidelines OR protocol OR diagnosis OR treatment OR "clinical presentation")`,
    180,
  );
}

const IMAGE_QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'clinical',
  'context',
  'diagram',
  'exam',
  'examination',
  'find',
  'for',
  'image',
  'in',
  'is',
  'medical',
  'movement',
  'of',
  'or',
  'question',
  'relevant',
  'showing',
  'student',
  'the',
  'this',
  'to',
  'what',
  'with',
]);

export function compactImageSearchQuery(raw: string, maxTerms = 8): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/["']/g, ' ')
    .replace(/[^a-z0-9\s/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const prioritized = cleaned
    .split(' ')
    .filter((term) => term.length > 2 && !IMAGE_QUERY_STOPWORDS.has(term));

  return Array.from(new Set(prioritized)).slice(0, maxTerms).join(' ').trim();
}

export function normalizeImageQuery(raw: string): string {
  return compactWhitespace(raw).toLowerCase();
}

export function dedupeImageQueries(queries: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const query of queries) {
    const trimmed = compactWhitespace(query ?? '');
    if (!trimmed) continue;
    const normalized = normalizeImageQuery(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(trimmed);
  }
  return unique;
}

export function upscaleWikipediaThumbnail(url?: string): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
  return normalized.replace(/\/\d+px-([^/?#]+)([?#].*)?$/i, '/640px-$1$2');
}

export function buildConceptFamilyImageQueries(query: string): string[] {
  const normalized = normalizeImageQuery(query);
  const familyQueries: string[] = [];

  const extraocularPattern =
    /\b(superior|inferior|medial|lateral)\s+(oblique|rectus)\b|\b(extraocular|extra-ocular|ocular muscles?)\b/;
  if (extraocularPattern.test(normalized)) {
    familyQueries.push('extraocular muscles', 'orbit anatomy');
  }

  const eyeAnatomyPattern =
    /\b(iris|cornea|lens|retina|choroid|ciliary body|sclera|optic disc|optic nerve head)\b/;
  if (eyeAnatomyPattern.test(normalized)) {
    familyQueries.push('eye anatomy');
  }

  return dedupeImageQueries(familyQueries);
}

export function buildImageSearchQueryLadder(query: string): string[] {
  const compacted = compactImageSearchQuery(query);
  const familyQueries = buildConceptFamilyImageQueries(compacted || query);
  return dedupeImageQueries([...familyQueries, compacted, query]);
}
