import {
  clipText,
  buildMedicalSearchQuery,
  dedupeGroundingSources,
  renderSourcesForPrompt,
} from './medicalSearch';
import type { MedicalGroundingSource } from './types';

describe('medicalSearch utilities', () => {
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
      expect(raw).toMatch(/India|Indian|ICMR|AIIMS|WHO|guidelines|protocol|diagnosis|treatment|clinical presentation/i);
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
});
