import AsyncStorage from '@react-native-async-storage/async-storage';
import { profileRepository } from '../db/repositories';
import { getApiKeys } from './ai/config';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';
import { searchDuckDuckGo } from './ai/medicalSearch';

type ExamCode = 'inicet' | 'neetpg';

interface ExamSourceConfig {
  exam: ExamCode;
  urls: string[];
  keyword: RegExp;
}

interface DateHit {
  date: string;
  sourceUrl: string;
  score: number;
}

export interface ExamDateSyncMeta {
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  inicetDate?: string;
  neetDate?: string;
  inicetSources?: string[];
  neetSources?: string[];
}

export interface ExamDateSyncResult {
  checkedAt: string;
  updated: boolean;
  inicetDate?: string;
  neetDate?: string;
  message: string;
}

const EXAM_SYNC_META_KEY = 'guru.exam_dates.sync.v2';

// Using reliable educational platforms since official websites use Next.js SPA/Cloudflare which are hard to scrape from mobile
const EXAM_SOURCES: ExamSourceConfig[] = [
  {
    exam: 'inicet',
    keyword: /ini[\s-]?cet|institute of national importance/i,
    urls: [
      'https://medicine.careers360.com/articles/ini-cet-exam-date',
      'https://medicine.careers360.com/articles/ini-cet-exam',
      'https://www.shiksha.com/medicine-health-sciences/ini-cet-exam-dates',
      'https://prepladder.com/neet-pg-study-material/notifications/ini-cet-exam',
    ],
  },
  {
    exam: 'neetpg',
    keyword: /neet[\s-]?pg|national eligibility cum entrance test/i,
    urls: [
      'https://medicine.careers360.com/articles/neet-pg-exam-dates',
      'https://medicine.careers360.com/articles/neet-pg-exam',
      'https://www.shiksha.com/medicine-health-sciences/neet-pg-exam-dates',
    ],
  },
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DATE_REGEX =
  /(\d{4}-\d{2}-\d{2})|(\d{1,2}[-/]\d{1,2}[-/]\d{4})|(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+\d{4})|((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i;

function normalizeIsoDate(year: number, month: number, day: number): string | null {
  const currentYear = new Date().getFullYear();
  if (year < currentYear || year > currentYear + 3) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
  const dt = new Date(year, month - 1, day);

  // Verify it represents a valid Date object.
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null;
  }

  // NEVER accept dates that are in the past. Exam dates are in the future!
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (dt.getTime() < now.getTime()) {
    return null;
  }

  return iso;
}

function parseAnyDate(raw: string): string | null {
  const text = raw
    .trim()
    .replace(/\./g, '')
    .replace(/(\d)(st|nd|rd|th)/gi, '$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return normalizeIsoDate(y, m, d);
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [a, b, y] = text.split(/[/-]/).map(Number);
    // India context: day first
    return normalizeIsoDate(y, b, a);
  }

  const dmy = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2].toLowerCase()];
    const year = Number(dmy[3]);
    if (!month) return null;
    return normalizeIsoDate(year, month, day);
  }

  const mdy = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (!month) return null;
    return normalizeIsoDate(year, month, day);
  }

  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-IN,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSourceText(url: string): Promise<string> {
  // Try direct fetch first
  try {
    const direct = await fetchWithTimeout(url, 10000);
    const normalized = htmlToText(direct);
    if (normalized.length > 800) return normalized;
  } catch {
    // Fallback to proxy
  }

  // Fallback to proxy for better rendering and to bypass potential mobile-UA blocks
  try {
    const proxyUrl = `https://r.jina.ai/${url}`;
    const proxied = await fetchWithTimeout(proxyUrl, 15000);
    return htmlToText(proxied);
  } catch {
    return '';
  }
}

function scoreHit(context: string, examKeyword: RegExp, _sourceUrl: string): number {
  let score = 1;
  if (examKeyword.test(context)) score += 2;
  if (
    /(exam date|scheduled|to be held|conducted on|exam is scheduled|will be conducted)/i.test(
      context,
    )
  )
    score += 2;
  if (/(expected|tentative)/i.test(context)) score -= 1;
  if (/(updated on|published on|last updated|written on|edited on)/i.test(context)) score -= 10;
  return score;
}

function extractDateHits(text: string, sourceUrl: string, examKeyword: RegExp): DateHit[] {
  const hits: DateHit[] = [];
  const lower = text.toLowerCase();
  const localRegex = new RegExp(DATE_REGEX.source, 'gi');

  let match: RegExpExecArray | null;
  while ((match = localRegex.exec(text)) !== null) {
    const raw = match[0];
    const iso = parseAnyDate(raw);
    if (!iso) continue;

    const start = Math.max(0, match.index - 180);
    const end = Math.min(text.length, match.index + raw.length + 180);
    const context = lower.slice(start, end);
    const score = scoreHit(context, examKeyword, sourceUrl);

    if (score < 2) continue;
    hits.push({ date: iso, sourceUrl, score });
  }
  return hits;
}

function resolveBestDate(hits: DateHit[]): { date: string; sources: string[] } | null {
  if (hits.length === 0) return null;
  const byDate = new Map<string, { totalScore: number; sources: Set<string>; hitCount: number }>();
  for (const hit of hits) {
    const row = byDate.get(hit.date) ?? { totalScore: 0, sources: new Set<string>(), hitCount: 0 };
    row.totalScore += hit.score;
    row.sources.add(hit.sourceUrl);
    row.hitCount += 1;
    byDate.set(hit.date, row);
  }

  const ranked = [...byDate.entries()].sort((a, b) => {
    const bySources = b[1].sources.size - a[1].sources.size;
    if (bySources !== 0) return bySources;
    const byHits = b[1].hitCount - a[1].hitCount;
    if (byHits !== 0) return byHits;
    return b[1].totalScore - a[1].totalScore;
  });

  const [bestDate, best] = ranked[0];
  if (!bestDate) return null;

  // Verification rule: either mentioned across multiple domains,
  // or mentioned multiple times on one domain with high contextual score.
  const isVerified = best.sources.size >= 2 || (best.hitCount >= 2 && best.totalScore >= 5);
  if (!isVerified) return null;

  return { date: bestDate, sources: [...best.sources] };
}

async function syncOneExam(
  config: ExamSourceConfig,
): Promise<{ date?: string; sources: string[] }> {
  const allHits: DateHit[] = [];
  const promises = config.urls.map(async (url) => {
    try {
      const text = await fetchSourceText(url);
      if (text.length > 0) {
        return extractDateHits(text, url, config.keyword);
      }
    } catch {
      // Ignore individual source failures
    }
    return [];
  });

  const results = await Promise.allSettled(promises);
  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      allHits.push(...result.value);
    }
  });

  const best = resolveBestDate(allHits);
  if (!best) return { sources: [] };
  return { date: best.date, sources: best.sources };
}

async function readMeta(): Promise<ExamDateSyncMeta> {
  const raw = await AsyncStorage.getItem(EXAM_SYNC_META_KEY);
  if (!raw) return { lastCheckedAt: null, lastSuccessAt: null, lastError: null };
  try {
    const parsed = JSON.parse(raw) as ExamDateSyncMeta;
    return {
      lastCheckedAt: parsed.lastCheckedAt ?? null,
      lastSuccessAt: parsed.lastSuccessAt ?? null,
      lastError: parsed.lastError ?? null,
      inicetDate: parsed.inicetDate,
      neetDate: parsed.neetDate,
      inicetSources: parsed.inicetSources ?? [],
      neetSources: parsed.neetSources ?? [],
    };
  } catch {
    return { lastCheckedAt: null, lastSuccessAt: null, lastError: null };
  }
}

async function writeMeta(meta: ExamDateSyncMeta): Promise<void> {
  await AsyncStorage.setItem(EXAM_SYNC_META_KEY, JSON.stringify(meta));
}

export async function getExamDateSyncMeta(): Promise<ExamDateSyncMeta> {
  return readMeta();
}

// ---------------------------------------------------------------------------
// Brave Search – fetch exam dates via the Brave Web Search API
// ---------------------------------------------------------------------------

interface BraveSearchResult {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveSearchResult[] };
}

const EXAM_QUERIES: { exam: ExamCode; query: string; keyword: RegExp }[] = [
  {
    exam: 'inicet',
    query: 'INI-CET 2026 exam date official notification',
    keyword: /ini[\s-]?cet|institute of national importance/i,
  },
  {
    exam: 'neetpg',
    query: 'NEET-PG 2026 exam date official notification',
    keyword: /neet[\s-]?pg|national eligibility cum entrance test/i,
  },
];

async function braveWebSearch(
  query: string,
  count: number,
  braveKey: string,
): Promise<BraveSearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query,
  )}&count=${Math.min(count, 10)}&search_lang=en&country=in&freshness=py&spellcheck=1`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveKey,
      },
    });
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
    const data = (await res.json()) as BraveSearchResponse;
    return data?.web?.results ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function extractDateHitsFromBrave(results: BraveSearchResult[], examKeyword: RegExp): DateHit[] {
  const hits: DateHit[] = [];
  for (const item of results) {
    const sourceUrl = item.url || '';
    const text = `${item.title || ''} ${item.description || ''}`;
    if (!text) continue;

    const localRegex = new RegExp(DATE_REGEX.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = localRegex.exec(text)) !== null) {
      const raw = match[0];
      const iso = parseAnyDate(raw);
      if (!iso) continue;

      const context = text.toLowerCase();
      const score = scoreHit(context, examKeyword, sourceUrl);
      if (score < 2) continue;
      hits.push({ date: iso, sourceUrl, score });
    }
  }
  return hits;
}

/**
 * Extract date hits from DuckDuckGo search results.
 */
function extractDateHitsFromDuckDuckGo(
  results: { title: string; snippet: string; url: string }[],
  examKeyword: RegExp,
): DateHit[] {
  const hits: DateHit[] = [];
  for (const item of results) {
    const sourceUrl = item.url || '';
    const text = `${item.title || ''} ${item.snippet || ''}`;
    if (!text) continue;

    const localRegex = new RegExp(DATE_REGEX.source, 'gi');
    let match: RegExpExecArray | null;
    while ((match = localRegex.exec(text)) !== null) {
      const raw = match[0];
      const iso = parseAnyDate(raw);
      if (!iso) continue;

      const context = text.toLowerCase();
      const score = scoreHit(context, examKeyword, sourceUrl);
      if (score < 2) continue;
      hits.push({ date: iso, sourceUrl, score });
    }
  }
  return hits;
}

/**
 * Fetch exam dates via search APIs (Brave preferred, DuckDuckGo fallback).
 * Falls back to web scraping if no APIs available.
 */
export async function fetchExamDatesViaBrave(): Promise<{
  inicetDate?: string;
  neetDate?: string;
  inicetSources?: string[];
  neetSources?: string[];
  method: 'brave' | 'ddg' | 'scrape' | 'brave+ddg' | 'brave+scrape' | 'ddg+scrape' | 'none';
}> {
  const profile = await profileRepository.getProfile().catch(() => null);
  const { braveSearchKey } = getApiKeys(profile);
  const braveKey = braveSearchKey?.trim();

  // Try Brave Search first if key available
  if (braveKey) {
    const [inicetHits, neetHits] = await Promise.all(
      EXAM_QUERIES.map(async (eq) => {
        try {
          const results = await braveWebSearch(eq.query, 8, braveKey);
          return extractDateHitsFromBrave(results, eq.keyword);
        } catch {
          return [] as DateHit[];
        }
      }),
    );

    const inicetBest = resolveBestDate(inicetHits);
    const neetBest = resolveBestDate(neetHits);

    // If Brave verified both dates, return them
    if (inicetBest && neetBest) {
      return {
        inicetDate: inicetBest.date,
        neetDate: neetBest.date,
        inicetSources: inicetBest.sources,
        neetSources: neetBest.sources,
        method: 'brave',
      };
    }

    // Try DuckDuckGo to supplement missing dates
    const [ddgInicet, ddgNeet] = await Promise.all(
      EXAM_QUERIES.map(async (eq) => {
        try {
          const results = await searchDuckDuckGo(eq.query, 4);
          return extractDateHitsFromDuckDuckGo(
            results.map((r) => ({ title: r.title, snippet: r.snippet || '', url: r.url || '' })),
            eq.keyword,
          );
        } catch {
          return [] as DateHit[];
        }
      }),
    );

    const ddgInicetBest = resolveBestDate(ddgInicet);
    const ddgNeetBest = resolveBestDate(ddgNeet);

    const finalInicet = inicetBest ?? ddgInicetBest;
    const finalNeet = neetBest ?? ddgNeetBest;

    // If we got any dates from Brave+DDG combination
    if (finalInicet || finalNeet) {
      // Try scraping as final supplement if still missing dates
      if (!finalInicet || !finalNeet) {
        try {
          const scrapeResult = await syncExamDatesFromInternet();
          return {
            inicetDate: finalInicet?.date ?? scrapeResult.inicetDate,
            neetDate: finalNeet?.date ?? scrapeResult.neetDate,
            inicetSources: finalInicet?.sources ?? ddgInicetBest?.sources,
            neetSources: finalNeet?.sources ?? ddgNeetBest?.sources,
            method:
              (inicetBest || neetBest) && (ddgInicetBest || ddgNeetBest)
                ? 'brave+ddg'
                : 'ddg+scrape',
          };
        } catch {
          // Return what we have from Brave+DDG
        }
      }

      return {
        inicetDate: finalInicet?.date,
        neetDate: finalNeet?.date,
        inicetSources: finalInicet?.sources,
        neetSources: finalNeet?.sources,
        method: (inicetBest || neetBest) && (ddgInicetBest || ddgNeetBest) ? 'brave+ddg' : 'ddg',
      };
    }

    // Brave failed completely, try scraping
    try {
      const scrapeResult = await syncExamDatesFromInternet();
      return {
        inicetDate: scrapeResult.inicetDate,
        neetDate: scrapeResult.neetDate,
        method: 'brave+scrape',
      };
    } catch {
      return { method: 'none' };
    }
  }

  // No Brave key → try DuckDuckGo (free, no API key needed)
  const [ddgInicet, ddgNeet] = await Promise.all(
    EXAM_QUERIES.map(async (eq) => {
      try {
        const results = await searchDuckDuckGo(eq.query, 4);
        return extractDateHitsFromDuckDuckGo(
          results.map((r) => ({ title: r.title, snippet: r.snippet || '', url: r.url || '' })),
          eq.keyword,
        );
      } catch {
        return [] as DateHit[];
      }
    }),
  );

  const ddgInicetBest = resolveBestDate(ddgInicet);
  const ddgNeetBest = resolveBestDate(ddgNeet);

  // If DuckDuckGo verified both dates, return them
  if (ddgInicetBest && ddgNeetBest) {
    return {
      inicetDate: ddgInicetBest.date,
      neetDate: ddgNeetBest.date,
      inicetSources: ddgInicetBest.sources,
      neetSources: ddgNeetBest.sources,
      method: 'ddg',
    };
  }

  // If DDG got some dates, try scraping for the rest
  if (ddgInicetBest || ddgNeetBest) {
    try {
      const scrapeResult = await syncExamDatesFromInternet();
      return {
        inicetDate: ddgInicetBest?.date ?? scrapeResult.inicetDate,
        neetDate: ddgNeetBest?.date ?? scrapeResult.neetDate,
        inicetSources: ddgInicetBest?.sources,
        neetSources: ddgNeetBest?.sources,
        method: 'ddg+scrape',
      };
    } catch {
      // Return what we have from DDG
      return {
        inicetDate: ddgInicetBest?.date,
        neetDate: ddgNeetBest?.date,
        inicetSources: ddgInicetBest?.sources,
        neetSources: ddgNeetBest?.sources,
        method: 'ddg',
      };
    }
  }

  // DDG failed completely → fall back to scraping
  try {
    const result = await syncExamDatesFromInternet();
    return {
      inicetDate: result.inicetDate,
      neetDate: result.neetDate,
      method: 'scrape',
    };
  } catch {
    return { method: 'none' };
  }
}

export async function syncExamDatesIfStale(maxAgeHours = 24): Promise<ExamDateSyncResult | null> {
  const meta = await readMeta();
  const lastChecked = meta.lastCheckedAt ? Date.parse(meta.lastCheckedAt) : NaN;
  const maxAgeMs = Math.max(1, maxAgeHours) * 60 * 60 * 1000;
  if (Number.isFinite(lastChecked) && Date.now() - lastChecked < maxAgeMs) {
    return null;
  }
  return syncExamDatesFromInternet();
}

export async function syncExamDatesFromInternet(): Promise<ExamDateSyncResult> {
  const now = new Date();
  const checkedAt = now.toISOString();
  const meta = await readMeta();

  const [inicetSync, neetSync] = await Promise.all([
    syncOneExam(EXAM_SOURCES[0]),
    syncOneExam(EXAM_SOURCES[1]),
  ]);

  const profile = await profileRepository.getProfile();
  const updates: { inicetDate?: string; neetDate?: string } = {};

  // Only auto-sync dates that are still at their hardcoded defaults.
  // If the user (or a previous sync) has set a custom date, don't overwrite it —
  // the user can always update manually in Settings.
  const HARDCODED_INICET_DEFAULTS = [DEFAULT_INICET_DATE];
  const HARDCODED_NEET_DEFAULTS = [DEFAULT_NEET_DATE];

  if (
    inicetSync.date &&
    inicetSync.date !== profile.inicetDate &&
    HARDCODED_INICET_DEFAULTS.includes(profile.inicetDate)
  ) {
    updates.inicetDate = inicetSync.date;
  }
  if (
    neetSync.date &&
    neetSync.date !== profile.neetDate &&
    HARDCODED_NEET_DEFAULTS.includes(profile.neetDate)
  ) {
    updates.neetDate = neetSync.date;
  }
  if (updates.inicetDate || updates.neetDate) {
    await profileRepository.updateProfile(updates);
  }

  const nextMeta: ExamDateSyncMeta = {
    lastCheckedAt: checkedAt,
    lastSuccessAt: inicetSync.date || neetSync.date ? checkedAt : meta.lastSuccessAt,
    lastError:
      !inicetSync.date && !neetSync.date
        ? 'Unable to verify updated official exam dates from web sources.'
        : null,
    inicetDate: inicetSync.date ?? profile.inicetDate,
    neetDate: neetSync.date ?? profile.neetDate,
    inicetSources: inicetSync.sources,
    neetSources: neetSync.sources,
  };
  await writeMeta(nextMeta);

  const updated = Boolean(updates.inicetDate || updates.neetDate);
  return {
    checkedAt,
    updated,
    inicetDate: nextMeta.inicetDate,
    neetDate: nextMeta.neetDate,
    message: updated
      ? 'Exam dates were updated from verified online sources.'
      : 'No verified exam date changes found online.',
  };
}
