import type { MedicalGroundingSource } from '../types';

export function dedupeGroundingSources(
  sources: MedicalGroundingSource[],
): MedicalGroundingSource[] {
  const seen = new Set<string>();
  const deduped: MedicalGroundingSource[] = [];
  for (const src of sources) {
    const key = `${src.title.toLowerCase()}|${src.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(src);
  }
  return deduped;
}

const QUERY_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'what',
  'which',
  'when',
  'why',
  'india',
  'indian',
  'icmr',
  'aiims',
  'who',
  'guidelines',
  'guideline',
  'protocol',
  'protocols',
  'diagnosis',
  'diagnostic',
  'treatment',
  'clinical',
  'presentation',
  'management',
  'approach',
  'overview',
  'medicine',
  'medical',
  'disease',
  'disorder',
]);

export function extractQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !QUERY_STOPWORDS.has(term)),
    ),
  );
}

export function scoreGroundingSource(source: MedicalGroundingSource, query: string): number {
  const title = source.title.toLowerCase();
  const snippet = source.snippet.toLowerCase();
  const url = source.url.toLowerCase();
  const queryTerms = extractQueryTerms(query);
  let score =
    source.source === 'PubMed'
      ? 36
      : source.source === 'EuropePMC'
        ? 34
        : source.source === 'Wikipedia'
          ? 22
          : source.source === 'DuckDuckGo'
            ? 6
            : 18;

  let titleHits = 0;
  let snippetHits = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 8;
      titleHits += 1;
      continue;
    }
    if (snippet.includes(term)) {
      score += 3;
      snippetHits += 1;
      continue;
    }
    if (url.includes(term)) {
      score += 2;
    }
  }

  if (queryTerms.length > 0 && titleHits === 0 && snippetHits === 0) {
    score -= 18;
  }

  if (source.source === 'DuckDuckGo') {
    score -= 6;
    if (titleHits === 0) score -= 10;
  }

  if (source.source === 'Wikipedia' && titleHits === 0) {
    score -= 6;
  }

  if (source.publishedAt && /^\d{4}/.test(source.publishedAt)) {
    const publishedYear = Number(source.publishedAt.slice(0, 4));
    const ageYears = Number.isFinite(publishedYear)
      ? Math.max(0, new Date().getFullYear() - publishedYear)
      : 0;
    score += Math.max(0, 6 - Math.min(ageYears, 6));
  }

  return score;
}

export function rankGroundingSources(
  sources: MedicalGroundingSource[],
  query: string,
  maxResults: number,
): MedicalGroundingSource[] {
  return dedupeGroundingSources(sources)
    .map((source, index) => ({
      source,
      index,
      score: scoreGroundingSource(source, query),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .slice(0, maxResults)
    .map(({ source }) => source);
}

const MEDICAL_TERMS = [
  'medical',
  'anatomy',
  'disease',
  'pathology',
  'histology',
  'radiology',
  'x-ray',
  'xray',
  'ct scan',
  'mri',
  'ultrasound',
  'ecg',
  'ekg',
  'microscopy',
  'biopsy',
  'clinical',
  'surgical',
  'dermato',
  'ophthalm',
  'cardio',
  'neuro',
  'hepat',
  'renal',
  'pulmon',
  'gastro',
  'hematol',
  'oncol',
  'endocrin',
  'immunol',
  'infect',
  'pharma',
  'symptom',
  'diagnosis',
  'treatment',
  'syndrome',
  'carcinoma',
  'tumor',
  'tumour',
  'fracture',
  'lesion',
  'abscess',
  'edema',
  'oedema',
  'fibrosis',
  'necrosis',
  'inflammation',
  'hemorrhage',
  'haemorrhage',
  'virus',
  'bacteria',
  'fungal',
  'parasite',
  'organ',
  'tissue',
  'cell',
  'specimen',
  'stain',
  'gram stain',
  'h&e',
  'slide',
];

const NOISE_TERMS = [
  'logo',
  'icon',
  'flag',
  'map',
  'coat of arms',
  'screenshot',
  'photo of building',
  'portrait',
  'headshot',
  'selfie',
];

export function scoreWikimediaRelevance(
  title: string,
  description: string,
  originalQuery: string,
): number {
  const titleLower = title.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = `${titleLower} ${descLower}`;
  const queryTerms = originalQuery
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  let score = 0;

  for (const term of queryTerms) {
    if (titleLower.includes(term)) score += 3;
    else if (descLower.includes(term)) score += 2;
  }

  for (const term of MEDICAL_TERMS) {
    if (combined.includes(term)) {
      score += 1;
      break;
    }
  }

  for (const term of NOISE_TERMS) {
    if (combined.includes(term)) {
      score -= 5;
      break;
    }
  }

  return score;
}
