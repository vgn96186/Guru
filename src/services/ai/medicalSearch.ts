import type { MedicalGroundingSource } from './types';

function compactWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function clipText(raw: string, maxChars: number): string {
  const text = compactWhitespace(raw);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function buildMedicalSearchQuery(question: string, topicName?: string): string {
  const base = compactWhitespace(`${topicName ?? ''} ${question}`.trim());
  const cleaned = base.replace(/[^\w\s\-(),./]/g, ' ');
  return clipText(`${cleaned} (India OR Indian OR ICMR OR AIIMS OR WHO OR guidelines OR protocol OR diagnosis OR treatment OR "clinical presentation")`, 180);
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'User-Agent': 'GuruStudyApp/1.0 (https://guru.study; help@guru.study)'
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Deduplicates sources by title+url (case-insensitive). Exported for unit testing. */
export function dedupeGroundingSources(sources: MedicalGroundingSource[]): MedicalGroundingSource[] {
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

/** Wikipedia: curriculum-aligned summaries, good for NEET-PG/INICET concepts */
async function searchWikipedia(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=${maxResults}`;
  const data = await fetchJsonWithTimeout<{ pages?: Array<{ id?: number; key?: string; title?: string; excerpt?: string; description?: string; thumbnail?: { url?: string } }> }>(url, 8000);
  const pages = Array.isArray(data?.pages) ? data.pages : [];
  return pages
    .filter((p) => p?.title && p?.key)
    .slice(0, maxResults)
    .map((p) => {
      const title = clipText(String(p.title), 220);
      const key = String(p.key ?? p.title ?? '');
      const excerpt = (p.excerpt ?? p.description ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      let imageUrl: string | undefined = undefined;
      const tUrl = p.thumbnail?.url;
      if (tUrl) {
        imageUrl = tUrl.startsWith('//') ? `https:${tUrl}` : tUrl;
      }
      
      return {
        id: `wiki-${p.id ?? key}`,
        title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
        imageUrl,
        snippet: clipText(excerpt || title, 420),
        source: 'Wikipedia' as const,
      };
    });
}

async function searchEuropePMC(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const europeQuery = `(${query}) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(europeQuery)}&format=json&pageSize=${maxResults}&sort=relevance`;
  const data = await fetchJsonWithTimeout<any>(url, 14000);
  const rows = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];

  return rows
    .filter((row: any) => row?.title)
    .slice(0, maxResults)
    .map((row: any, idx: number): MedicalGroundingSource => {
      const title = clipText(String(row.title), 220);
      const doi = String(row.doi ?? '').trim();
      const pmid = String(row.pmid ?? '').trim();
      const sourceId = String(row.id ?? pmid ?? idx + 1);
      const urlFromId = pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/article/${row.source ?? 'MED'}/${sourceId}`;
      const snippetRaw = String(row.abstractText ?? row.authorString ?? 'No abstract snippet available.');

      return {
        id: `epmc-${sourceId}`,
        title,
        url: doi ? `https://doi.org/${doi}` : urlFromId,
        snippet: clipText(snippetRaw, 420),
        journal: String(row.journalTitle ?? '').trim() || undefined,
        publishedAt: String(row.firstPublicationDate ?? row.pubYear ?? '').trim() || undefined,
        source: 'EuropePMC',
      };
    });
}

async function searchPubMedFallback(query: string, maxResults: number): Promise<MedicalGroundingSource[]> {
  const term = `${query} AND (english[Language]) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(term)}`;
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist) ? searchData.esearchresult.idlist : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryData = await fetchJsonWithTimeout<any>(summaryUrl);
  const uidList: string[] = Array.isArray(summaryData?.result?.uids) ? summaryData.result.uids : ids;

  return uidList
    .map((uid): MedicalGroundingSource | null => {
      const row = summaryData?.result?.[uid];
      if (!row?.title) return null;
      const publishedAt = String(row.pubdate ?? '').trim() || undefined;
      const journal = String(row.fulljournalname ?? row.source ?? '').trim() || undefined;
      return {
        id: `pmid-${uid}`,
        title: clipText(String(row.title), 220),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        snippet: clipText(
          `Indexed on PubMed${journal ? ` in ${journal}` : ''}${publishedAt ? ` (${publishedAt})` : ''}. Open source link for abstract and full metadata.`,
          420,
        ),
        journal,
        publishedAt,
        source: 'PubMed',
      };
    })
    .filter((row): row is MedicalGroundingSource => !!row);
}

export async function searchLatestMedicalSources(query: string, maxResults = 6): Promise<MedicalGroundingSource[]> {
  const collected: MedicalGroundingSource[] = [];
  const wikiLimit = Math.min(3, maxResults);
  const litLimit = maxResults;

  try {
    const wiki = await searchWikipedia(query, wikiLimit);
    collected.push(...wiki);
  } catch (err) {
    if (__DEV__) console.warn('[GuruGrounded] Wikipedia failed:', (err as Error).message);
  }

  try {
    const europe = await searchEuropePMC(query, litLimit);
    collected.push(...europe);
  } catch (err) {
    if (__DEV__) console.warn('[GuruGrounded] EuropePMC failed:', (err as Error).message);
  }

  if (collected.length < Math.min(4, maxResults)) {
    try {
      const pubmed = await searchPubMedFallback(query, litLimit);
      collected.push(...pubmed);
    } catch (err) {
      if (__DEV__) console.warn('[GuruGrounded] PubMed fallback failed:', (err as Error).message);
    }
  }

  return dedupeGroundingSources(collected).slice(0, maxResults);
}

export function renderSourcesForPrompt(sources: MedicalGroundingSource[]): string {
  return sources
    .map((src, idx) => {
      const published = src.publishedAt ? `Published: ${src.publishedAt}` : 'Published: unknown date';
      const journal = src.journal ? `Journal: ${src.journal}` : 'Journal: not listed';
      return `[S${idx + 1}]
Title: ${src.title}
Source: ${src.source}
${published}
${journal}
URL: ${src.url}
Snippet: ${src.snippet}`;
    })
    .join('\n\n');
}

export { buildMedicalSearchQuery };
