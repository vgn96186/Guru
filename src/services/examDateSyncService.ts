import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserProfile, updateUserProfile } from '../db/queries/progress';

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

const EXAM_SYNC_META_KEY = 'guru.exam_dates.sync.v1';

const EXAM_SOURCES: ExamSourceConfig[] = [
  {
    exam: 'inicet',
    keyword: /ini[\s-]?cet|institute of national importance/i,
    urls: [
      'https://www.aiimsexams.ac.in/',
      'https://www.aiimsexams.ac.in/info/Course.html',
      'https://www.aiimsexams.ac.in/info/Notice.html',
    ],
  },
  {
    exam: 'neetpg',
    keyword: /neet[\s-]?pg|national eligibility cum entrance test/i,
    urls: [
      'https://natboard.edu.in/',
      'https://natboard.edu.in/viewnbeexam?exam=neetpg',
      'https://natboard.edu.in/viewnotice?exam=neetpg',
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
  /(\d{4}-\d{2}-\d{2})|(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})|(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?,?\s+\d{4})|((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4})/i;

function normalizeIsoDate(year: number, month: number, day: number): string | null {
  if (year < 2020 || year > 2035) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const iso = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}

function parseAnyDate(raw: string): string | null {
  const text = raw.trim().replace(/\./g, '').replace(/(\d)(st|nd|rd|th)/gi, '$1');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split('-').map(Number);
    return normalizeIsoDate(y, m, d);
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text)) {
    const [a, b, y] = text.split(/[/-]/).map(Number);
    // India context: day first
    return normalizeIsoDate(y, b, a);
  }

  const dmy = text.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
  );
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTHS[dmy[2].toLowerCase()];
    const year = Number(dmy[3]);
    if (!month) return null;
    return normalizeIsoDate(year, month, day);
  }

  const mdy = text.match(
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
  );
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

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSourceText(url: string): Promise<string> {
  try {
    const direct = await fetchWithTimeout(url);
    const normalized = htmlToText(direct);
    if (normalized.length > 500) return normalized;
  } catch {
    // Fallback below
  }

  // Proxy fallback often works better for JS-heavy pages
  const proxied = await fetchWithTimeout(`https://r.jina.ai/https://${url.replace(/^https?:\/\//i, '')}`, 15000);
  return htmlToText(proxied);
}

function scoreHit(context: string, examKeyword: RegExp): number {
  let score = 1;
  if (examKeyword.test(context)) score += 2;
  if (/(exam date|scheduled|to be held|conducted on|notification|prospectus)/i.test(context)) score += 1;
  return score;
}

function extractDateHits(text: string, sourceUrl: string, examKeyword: RegExp): DateHit[] {
  const hits: DateHit[] = [];
  const lower = text.toLowerCase();
  // Create a new RegExp with /g flag per call to avoid shared lastIndex state
  const localRegex = new RegExp(DATE_REGEX.source, 'gi');

  let match: RegExpExecArray | null;
  while ((match = localRegex.exec(text)) !== null) {
    const raw = match[0];
    const iso = parseAnyDate(raw);
    if (!iso) continue;

    const start = Math.max(0, match.index - 180);
    const end = Math.min(text.length, match.index + raw.length + 180);
    const context = lower.slice(start, end);
    const score = scoreHit(context, examKeyword);

    // ignore weak/global dates that are probably unrelated posting dates
    if (score < 2) continue;
    hits.push({ date: iso, sourceUrl, score });
  }
  return hits;
}

function resolveBestDate(hits: DateHit[]): { date: string; sources: string[] } | null {
  if (hits.length === 0) return null;
  const byDate = new Map<string, { totalScore: number; sources: Set<string> }>();
  for (const hit of hits) {
    const row = byDate.get(hit.date) ?? { totalScore: 0, sources: new Set<string>() };
    row.totalScore += hit.score;
    row.sources.add(hit.sourceUrl);
    byDate.set(hit.date, row);
  }

  const ranked = [...byDate.entries()]
    .sort((a, b) => {
      const bySources = b[1].sources.size - a[1].sources.size;
      if (bySources !== 0) return bySources;
      return b[1].totalScore - a[1].totalScore;
    });

  const [bestDate, best] = ranked[0];
  if (!bestDate) return null;

  // Verification rule: either repeated across multiple official pages,
  // or strong single-source evidence.
  const isVerified = best.sources.size >= 2 || best.totalScore >= 4;
  if (!isVerified) return null;

  return { date: bestDate, sources: [...best.sources] };
}

async function syncOneExam(config: ExamSourceConfig): Promise<{ date?: string; sources: string[] }> {
  const allHits: DateHit[] = [];
  for (const url of config.urls) {
    try {
      const text = await fetchSourceText(url);
      const hits = extractDateHits(text, url, config.keyword);
      allHits.push(...hits);
    } catch {
      // Ignore individual source failures
    }
  }

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

export async function syncExamDatesFromInternet(): Promise<ExamDateSyncResult> {
  const now = new Date();
  const checkedAt = now.toISOString();
  const meta = await readMeta();

  const [inicetSync, neetSync] = await Promise.all([
    syncOneExam(EXAM_SOURCES[0]),
    syncOneExam(EXAM_SOURCES[1]),
  ]);

  const profile = getUserProfile();
  const updates: { inicetDate?: string; neetDate?: string } = {};

  if (inicetSync.date && inicetSync.date !== profile.inicetDate) {
    updates.inicetDate = inicetSync.date;
  }
  if (neetSync.date && neetSync.date !== profile.neetDate) {
    updates.neetDate = neetSync.date;
  }
  if (updates.inicetDate || updates.neetDate) {
    updateUserProfile(updates);
  }

  const nextMeta: ExamDateSyncMeta = {
    lastCheckedAt: checkedAt,
    lastSuccessAt: (inicetSync.date || neetSync.date) ? checkedAt : meta.lastSuccessAt,
    lastError: (!inicetSync.date && !neetSync.date) ? 'Unable to verify updated official exam dates from web sources.' : null,
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
