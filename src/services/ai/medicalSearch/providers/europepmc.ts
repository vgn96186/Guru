import type { MedicalGroundingSource } from '../../types';
import { clipText, fetchJsonWithTimeout } from '../utils';

export async function searchEuropePMC(
  query: string,
  maxResults: number,
): Promise<MedicalGroundingSource[]> {
  const europeQuery = `(${query}) AND (HAS_ABSTRACT:y OR OPEN_ACCESS:y) NOT (veterinary OR animal OR murine OR mice OR rat OR dog OR cat)`;
  const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
    europeQuery,
  )}&format=json&pageSize=${maxResults}&sort=relevance`;
  const data = await fetchJsonWithTimeout<any>(url, 20000);
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
      const snippetRaw = String(
        row.abstractText ?? row.authorString ?? 'No abstract snippet available.',
      );

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
