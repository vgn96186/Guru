import type { MedicalGroundingSource } from '../../types';
import { clipText, fetchJsonWithTimeout } from '../utils';

export async function searchPubMedFallback(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const term = `${query} AND (english[Language]) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${maxResults}&term=${encodeURIComponent(
    term,
  )}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const searchData = await fetchJsonWithTimeout<any>(searchUrl);
  const ids: string[] = Array.isArray(searchData?.esearchresult?.idlist)
    ? searchData.esearchresult.idlist
    : [];
  if (ids.length === 0) return [];

  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(
    ',',
  )}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  const summaryData = await fetchJsonWithTimeout<any>(summaryUrl);
  const uidList: string[] = Array.isArray(summaryData?.result?.uids)
    ? summaryData.result.uids
    : ids;

  return uidList
    .map((uid: string): MedicalGroundingSource | null => {
      const row = summaryData?.result?.[uid];
      if (!row?.title) return null;
      const publishedAt = String(row.pubdate ?? '').trim() || undefined;
      const journal = String(row.fulljournalname ?? row.source ?? '').trim() || undefined;
      return {
        id: `pmid-${uid}`,
        title: clipText(String(row.title), 220),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        snippet: clipText(
          `Indexed on PubMed${journal ? ` in ${journal}` : ''}${
            publishedAt ? ` (${publishedAt})` : ''
          }. Open source link for abstract and full metadata.`,
          420,
        ),
        journal,
        publishedAt,
        source: 'PubMed',
      };
    })
    .filter((row): row is MedicalGroundingSource => !!row);
}
