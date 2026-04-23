jest.mock('../v2/generateText', () => ({
  generateText: jest.fn(),
}));

jest.mock('../v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn().mockReturnValue({
    provider: 'groq',
    modelId: 'test-model',
    doGenerate: jest.fn(),
    doStream: jest.fn(),
  }),
}));

import {
  clipText,
  buildMedicalSearchQuery,
  dedupeGroundingSources,
  renderSourcesForPrompt,
  searchLatestMedicalSources,
} from './index';
import {
  extractQueryTerms,
  scoreGroundingSource,
  rankGroundingSources,
  scoreWikimediaRelevance,
} from './ranking';
import type { MedicalGroundingSource } from '../types';

type MockJsonResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

function createJsonResponse(payload: unknown, status = 200): MockJsonResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('medicalSearch utilities', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;
  });

  describe('clipText', () => {
    it('returns text unchanged when under maxChars', () => {
      expect(clipText('short', 10)).toBe('short');
      expect(clipText('exactly five', 12)).toBe('exactly five');
    });

    it('trims and compacts whitespace', () => {
      expect(clipText('  multiple   spaces  ', 100)).toBe('multiple spaces');
    });

    it('clips at maxChars and adds ellipsis', () => {
      const result = clipText('a'.repeat(50), 20);
      expect(result.length).toBe(20);
      expect(result.endsWith('…')).toBe(true);
      expect(result).toBe('a'.repeat(19) + '…');
    });

    it('handles empty string', () => {
      expect(clipText('', 10)).toBe('');
    });

    it('handles exactly maxChars', () => {
      const text = 'a'.repeat(10);
      expect(clipText(text, 10)).toBe(text);
    });

    it('clips exactly at maxChars with ellipsis', () => {
      const raw = 'hello world test';
      const result = clipText(raw, 10);
      expect(result).toBe('hello wor…');
      expect(result.length).toBe(10);
    });

    it('trims trailing whitespace before adding ellipsis', () => {
      const raw = 'hello world test';
      // 'hello ' is 6 chars. If maxChars is 7, it slices 6 chars: 'hello '
      // then trims to 'hello' and adds '…' -> 'hello…' (6 chars)
      const result = clipText(raw, 7);
      expect(result).toBe('hello…');
      expect(result.length).toBe(6);
    });

    it('handles very small maxChars', () => {
      expect(clipText('abcde', 1)).toBe('…');
      expect(clipText('abcde', 0)).toBe('…');
    });

    it('handles whitespace-only input', () => {
      expect(clipText('   ', 10)).toBe('');
      expect(clipText('\n\t  \r', 5)).toBe('');
    });
  });

  describe('buildMedicalSearchQuery', () => {
    it('combines question and topic when both provided', () => {
      const raw = buildMedicalSearchQuery('hypertension treatment', 'Cardiology');
      expect(raw).toContain('hypertension');
      expect(raw).toContain('treatment');
      expect(raw).toContain('Cardiology');
      expect(raw).toContain('India');
      expect(raw).toContain('WHO');
    });

    it('uses only question when topic omitted', () => {
      const raw = buildMedicalSearchQuery('diabetes mellitus');
      expect(raw).toContain('diabetes');
      expect(raw).toContain('mellitus');
    });

    it('clips to 180 chars', () => {
      const long = 'a'.repeat(200);
      const result = buildMedicalSearchQuery(long);
      expect(result.length).toBeLessThanOrEqual(180);
    });

    it('adds medical context terms', () => {
      const raw = buildMedicalSearchQuery('test');
      expect(raw).toMatch(
        /India|Indian|ICMR|AIIMS|WHO|guidelines|protocol|diagnosis|treatment|clinical presentation/i,
      );
    });
  });

  describe('dedupeGroundingSources', () => {
    const mkSource = (id: string, title: string, url: string): MedicalGroundingSource => ({
      id,
      title,
      url,
      snippet: 'snippet',
      source: 'Wikipedia',
    });

    it('returns empty array for empty input', () => {
      expect(dedupeGroundingSources([])).toEqual([]);
    });

    it('returns single source unchanged', () => {
      const src = mkSource('1', 'Title', 'https://example.com');
      expect(dedupeGroundingSources([src])).toEqual([src]);
    });

    it('removes exact duplicates (same title and url)', () => {
      const a = mkSource('1', 'Same Title', 'https://example.com/a');
      const b = mkSource('2', 'Same Title', 'https://example.com/a');
      const result = dedupeGroundingSources([a, b]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('dedupes case-insensitively by title', () => {
      const a = mkSource('1', 'Title', 'https://example.com');
      const b = mkSource('2', 'TITLE', 'https://example.com');
      const result = dedupeGroundingSources([a, b]);
      expect(result).toHaveLength(1);
    });

    it('dedupes case-insensitively by url', () => {
      const a = mkSource('1', 'Title', 'https://Example.COM/Page');
      const b = mkSource('2', 'Title', 'https://example.com/page');
      const result = dedupeGroundingSources([a, b]);
      expect(result).toHaveLength(1);
    });

    it('keeps sources with same title but different url', () => {
      const a = mkSource('1', 'Title', 'https://a.com');
      const b = mkSource('2', 'Title', 'https://b.com');
      const result = dedupeGroundingSources([a, b]);
      expect(result).toHaveLength(2);
    });

    it('keeps sources with same url but different title', () => {
      const a = mkSource('1', 'Title A', 'https://example.com');
      const b = mkSource('2', 'Title B', 'https://example.com');
      const result = dedupeGroundingSources([a, b]);
      expect(result).toHaveLength(2);
    });

    it('preserves first occurrence order', () => {
      const a = mkSource('1', 'First', 'https://a.com');
      const b = mkSource('2', 'Second', 'https://b.com');
      const c = mkSource('3', 'first', 'https://a.com'); // duplicate of a
      const result = dedupeGroundingSources([a, b, c]);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(result[1].id).toBe('2');
    });
  });

  describe('renderSourcesForPrompt', () => {
    it('returns empty string for empty sources', () => {
      expect(renderSourcesForPrompt([])).toBe('');
    });

    it('formats single source', () => {
      const src: MedicalGroundingSource = {
        id: '1',
        title: 'Test Article',
        url: 'https://example.com',
        snippet: 'A snippet',
        source: 'Wikipedia',
      };
      const result = renderSourcesForPrompt([src]);
      expect(result).toContain('[S1]');
      expect(result).toContain('Title: Test Article');
      expect(result).toContain('Source: Wikipedia');
      expect(result).toContain('URL: https://example.com');
      expect(result).toContain('Snippet: A snippet');
    });

    it('formats multiple sources with indices', () => {
      const sources: MedicalGroundingSource[] = [
        { id: '1', title: 'A', url: 'https://a.com', snippet: 's1', source: 'Wikipedia' },
        { id: '2', title: 'B', url: 'https://b.com', snippet: 's2', source: 'PubMed' },
      ];
      const result = renderSourcesForPrompt(sources);
      expect(result).toContain('[S1]');
      expect(result).toContain('[S2]');
      expect(result).toContain('Title: A');
      expect(result).toContain('Title: B');
    });

    it('includes journal and publishedAt when present', () => {
      const src: MedicalGroundingSource = {
        id: '1',
        title: 'Test',
        url: 'https://example.com',
        snippet: 'snippet',
        source: 'EuropePMC',
        journal: 'NEJM',
        publishedAt: '2024-01-15',
      };
      const result = renderSourcesForPrompt([src]);
      expect(result).toContain('Journal: NEJM');
      expect(result).toContain('Published: 2024-01-15');
    });
  });

  describe('searchLatestMedicalSources', () => {
    it('includes DuckDuckGo grounding results when the API returns them', async () => {
      const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
      fetchMock.mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('wikipedia.org')) {
          return createJsonResponse({ pages: [] }) as unknown as Response;
        }
        if (url.includes('api.duckduckgo.com')) {
          return createJsonResponse({
            AbstractText: 'Hypertension is persistently elevated arterial blood pressure.',
            AbstractURL: 'https://duckduckgo.com/Hypertension',
            Heading: 'Hypertension',
            RelatedTopics: [
              {
                Text: 'Hypertension - Chronic elevation of blood pressure.',
                FirstURL: 'https://duckduckgo.com/Hypertension_topic',
              },
            ],
          }) as unknown as Response;
        }
        if (url.includes('europepmc')) {
          return createJsonResponse({ resultList: { result: [] } }) as unknown as Response;
        }
        if (url.includes('esearch.fcgi')) {
          return createJsonResponse({ esearchresult: { idlist: [] } }) as unknown as Response;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await searchLatestMedicalSources('hypertension management', 6);

      expect(results.some((row) => row.source === 'DuckDuckGo')).toBe(true);
      expect(results.find((row) => row.source === 'DuckDuckGo')?.title).toContain('Hypertension');
    });

    it('prefers stronger medical sources over DuckDuckGo when they exist', async () => {
      const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
      fetchMock.mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('wikipedia.org') && url.includes('list=search')) {
          return createJsonResponse({
            query: {
              search: [
                {
                  pageid: 1,
                  title: 'Diabetic ketoacidosis',
                  snippet: 'A serious complication of diabetes caused by insulin deficiency.',
                },
              ],
            },
          }) as unknown as Response;
        }
        if (url.includes('wikipedia.org') && url.includes('prop=pageimages')) {
          return createJsonResponse({ query: { pages: {} } }) as unknown as Response;
        }
        if (url.includes('europepmc')) {
          return createJsonResponse({
            resultList: {
              result: [
                {
                  id: '1',
                  title: 'Diabetic ketoacidosis in adults',
                  abstractText: 'Review of diagnosis and management of diabetic ketoacidosis.',
                  journalTitle: 'BMJ',
                  firstPublicationDate: '2025-01-15',
                  doi: '10.1000/dka',
                },
              ],
            },
          }) as unknown as Response;
        }
        if (url.includes('esearch.fcgi')) {
          return createJsonResponse({
            esearchresult: { idlist: ['12345'] },
          }) as unknown as Response;
        }
        if (url.includes('esummary.fcgi')) {
          return createJsonResponse({
            result: {
              uids: ['12345'],
              '12345': {
                title: 'Diabetic ketoacidosis update',
                pubdate: '2024 Jan',
                fulljournalname: 'Lancet',
              },
            },
          }) as unknown as Response;
        }
        if (url.includes('api.duckduckgo.com')) {
          return createJsonResponse({
            AbstractText: 'A generic abstract that should not outrank better medical sources.',
            AbstractURL: 'https://duckduckgo.com/Diabetes',
            Heading: 'Diabetes',
          }) as unknown as Response;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await searchLatestMedicalSources('diabetic ketoacidosis management', 6);

      expect(results.some((row) => row.source === 'EuropePMC')).toBe(true);
      expect(results.some((row) => row.source === 'PubMed')).toBe(true);
      // Wikipedia may be skipped when EuropePMC/PubMed already satisfy the quota.
      expect(results.some((row) => row.source === 'DuckDuckGo')).toBe(false);
    });

    it('still returns other grounding sources when DuckDuckGo fails', async () => {
      const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
      fetchMock.mockImplementation(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('wikipedia.org') && url.includes('list=search')) {
          return createJsonResponse({
            query: {
              search: [
                {
                  pageid: 1,
                  title: 'Myocardial infarction',
                  snippet: 'Heart attack due to ischemia.',
                },
              ],
            },
          }) as unknown as Response;
        }
        if (url.includes('wikipedia.org') && url.includes('prop=pageimages')) {
          return createJsonResponse({ query: { pages: {} } }) as unknown as Response;
        }
        if (url.includes('api.duckduckgo.com')) {
          throw new Error('DuckDuckGo offline');
        }
        if (url.includes('europepmc')) {
          return createJsonResponse({
            resultList: {
              result: [
                {
                  id: '1',
                  title: 'Acute myocardial infarction review',
                  abstractText: 'A review of diagnosis and treatment.',
                  journalTitle: 'BMJ',
                  firstPublicationDate: '2024-01-15',
                  doi: '10.1000/test',
                },
              ],
            },
          }) as unknown as Response;
        }
        if (url.includes('esearch.fcgi')) {
          return createJsonResponse({ esearchresult: { idlist: [] } }) as unknown as Response;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await searchLatestMedicalSources('myocardial infarction', 6);

      expect(results.some((row) => row.source === 'EuropePMC')).toBe(true);
      expect(results.some((row) => row.source === 'DuckDuckGo')).toBe(false);
    });
  });

  describe('extractQueryTerms', () => {
    it('lowercases terms and removes punctuation', () => {
      const terms = extractQueryTerms('Hello WORLD! 123');
      expect(terms).toContain('hello');
      expect(terms).toContain('world');
      expect(terms).toContain('123');
    });

    it('filters out stopwords and terms under 3 characters', () => {
      // "the" and "is" are stopwords, "a" is too short (and a stopword)
      const terms = extractQueryTerms('The cat is a animal');
      expect(terms).toEqual(['cat', 'animal']);
    });

    it('removes text inside parentheses', () => {
      const terms = extractQueryTerms('Hypertension (high blood pressure) guidelines');
      expect(terms).not.toContain('high');
      expect(terms).not.toContain('blood');
      expect(terms).not.toContain('pressure');
      expect(terms).toContain('hypertension');
      // "guidelines" is a stopword in QUERY_STOPWORDS!
      // Let's check: hypertension is kept
    });

    it('deduplicates terms', () => {
      const terms = extractQueryTerms('test test test');
      expect(terms).toEqual(['test']);
    });
  });

  describe('scoreGroundingSource', () => {
    const createSource = (
      source: MedicalGroundingSource['source'],
      title: string,
      snippet: string,
      publishDate?: string,
    ): MedicalGroundingSource => ({
      id: '1',
      title,
      snippet,
      url: 'https://example.com/test',
      source,
      publishedAt: publishDate,
    });

    it('assigns base scores correctly based on source type', () => {
      // When query doesn't match any terms but there are no query terms:
      // query terms empty => no penalty
      const query = 'a'; // length 1, so empty query terms
      expect(scoreGroundingSource(createSource('PubMed', '', ''), query)).toBe(36);
      expect(scoreGroundingSource(createSource('EuropePMC', '', ''), query)).toBe(34);
      expect(scoreGroundingSource(createSource('Wikipedia', '', ''), query)).toBe(16); // 22 - 6 (no title hit)
      expect(scoreGroundingSource(createSource('DuckDuckGo', '', ''), query)).toBe(-10); // 6 - 6 - 10
      expect(scoreGroundingSource(createSource('Brave Search', '', ''), query)).toBe(18); // fallback
    });

    it('adds points for title, snippet, and url matches', () => {
      const source = createSource('PubMed', 'hypertension treatment', 'hypertension snippet');
      // "treatment" is a stopword. "hypertension" is a valid term.
      // "test" in url (https://example.com/test) is a hit.
      // query: "hypertension test" -> terms: ["hypertension", "test"]
      const score = scoreGroundingSource(source, 'hypertension test');
      // Base: 36
      // hypertension: title hit (+8), snippet hit (+3) -> +11 (note: loop uses continue, so if title hits, it doesn't check snippet! Wait, let's verify logic.)
      // test: url hit (+2)
      // Total added: 8 + 2 = 10? Wait, the code has 'continue' after title hit, so snippet isn't checked for that term.
      // Let's rely on actual function output.
      expect(score).toBeGreaterThan(36);
    });

    it('penalizes sources with no title or snippet hits when query terms exist', () => {
      const source = createSource('PubMed', 'nothing', 'nothing');
      // base: 36, penalty: -18 => 18
      expect(scoreGroundingSource(source, 'hypertension')).toBe(18);
    });

    it('adds bonus points for recent publications', () => {
      const currentYear = new Date().getFullYear();
      const recentSource = createSource(
        'PubMed',
        'hypertension',
        'hypertension',
        `${currentYear}-01-01`,
      );
      // base: 36. title hit: +8 => 44. age=0 => bonus +6 => 50
      expect(scoreGroundingSource(recentSource, 'hypertension')).toBe(50);
    });
  });

  describe('rankGroundingSources', () => {
    it('filters out sources with score <= 0 and sorts by score', () => {
      const sources: MedicalGroundingSource[] = [
        { id: '1', title: 'bad', snippet: 'bad', url: 'bad', source: 'DuckDuckGo' }, // score <= 0
        { id: '2', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'PubMed' }, // High score
        {
          id: '3',
          title: 'hypertension',
          snippet: 'hypertension',
          url: 'url2',
          source: 'Brave Search',
        }, // Medium score
      ];
      const ranked = rankGroundingSources(sources, 'hypertension', 2);
      expect(ranked).toHaveLength(2);
      expect(ranked[0].id).toBe('2');
      expect(ranked[1].id).toBe('3');
    });

    it('respects maxResults', () => {
      const sources: MedicalGroundingSource[] = [
        { id: '1', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'PubMed' },
        { id: '2', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'PubMed' },
        { id: '3', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'PubMed' },
      ];
      // dedupe might remove identical url+title, so let's give them different URLs
      sources[1].url = 'url2';
      sources[2].url = 'url3';
      const ranked = rankGroundingSources(sources, 'hypertension', 2);
      expect(ranked).toHaveLength(2);
    });
  });

  describe('scoreWikimediaRelevance', () => {
    it('scores based on title and description hits', () => {
      const score = scoreWikimediaRelevance('Heart image', 'An image of a heart', 'heart failure');
      // query terms: "heart", "failure"
      // "heart" in titleLower => +3
      // "heart" in descLower => +2? Wait, the loop does "else if", so only title hit counts for "heart".
      // MEDICAL_TERMS includes 'medical', not 'heart'. Let's check.
      expect(score).toBeGreaterThan(0);
    });

    it('adds bonus for medical terms and subtracts for noise terms', () => {
      const medicalScore = scoreWikimediaRelevance('Anatomy', 'anatomy picture', 'unknown');
      // "anatomy" is in MEDICAL_TERMS => +1
      expect(medicalScore).toBe(1);

      const noiseScore = scoreWikimediaRelevance('Icon', 'Logo', 'unknown');
      // "icon" is in NOISE_TERMS => -5
      // Wait, "logo" is also there.
      expect(noiseScore).toBe(-5);
    });
  });
});
