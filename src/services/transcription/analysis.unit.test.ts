import { analyzeTranscript } from './analysis';
import { generateJSONWithRouting } from '../aiService';

jest.mock('../aiService', () => ({
  generateJSONWithRouting: jest.fn(),
}));

const okParsed = {
  subject: 'Medicine',
  topics: ['Heart failure'],
  key_concepts: ['LVEF'],
  high_yield_highlights: ['BNP'],
  lecture_summary: 'Summary text.',
  estimated_confidence: 2,
};

describe('analyzeTranscript', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns fallback when every segment analysis fails', async () => {
    (generateJSONWithRouting as jest.Mock).mockRejectedValue(new Error('network'));
    const r = await analyzeTranscript('some transcript text');
    expect(r.subject).toBe('Unknown');
    expect(r.topics).toEqual([]);
    expect(r.lectureSummary).not.toMatch(/analysis failed/i);
    expect(r.estimatedConfidence).toBe(1);
  });

  it('maps a successful single-segment analysis', async () => {
    (generateJSONWithRouting as jest.Mock).mockResolvedValue({
      parsed: okParsed,
      modelUsed: 'test-model',
    });
    const r = await analyzeTranscript('short segment');
    expect(r.subject).toBe('Medicine');
    expect(r.topics).toEqual(['Heart failure']);
    expect(r.keyConcepts).toEqual(['LVEF']);
    expect(r.highYieldPoints).toEqual(['BNP']);
    expect(r.lectureSummary).toBe('Summary text.');
    expect(r.estimatedConfidence).toBe(2);
    expect(r.modelUsed).toBe('test-model');
  });

  it('splits long transcripts into multiple segments and meta-summarizes', async () => {
    const longText = 'x'.repeat(13000);
    (generateJSONWithRouting as jest.Mock)
      .mockResolvedValueOnce({ parsed: { ...okParsed, subject: 'A' }, modelUsed: 'm1' })
      .mockResolvedValueOnce({
        parsed: { ...okParsed, subject: 'B', topics: ['T2'] },
        modelUsed: 'm2',
      })
      .mockResolvedValueOnce({
        parsed: {
          ...okParsed,
          subject: 'Merged',
          topics: ['Merged topic'],
          key_concepts: ['k'],
          high_yield_highlights: ['h'],
          lecture_summary: 'merged sum',
          estimated_confidence: 3,
        },
        modelUsed: 'meta',
      });

    const r = await analyzeTranscript(longText);
    expect(generateJSONWithRouting).toHaveBeenCalledTimes(3);
    expect(r.subject).toBe('Merged');
    expect(r.topics).toEqual(['Merged topic']);
  });

  it('uses aggregation fallback when meta-summarization throws', async () => {
    const longText = 'y'.repeat(13000);
    (generateJSONWithRouting as jest.Mock)
      .mockResolvedValueOnce({
        parsed: { ...okParsed, subject: 'S1', topics: ['a'], key_concepts: ['c1'] },
        modelUsed: 'm1',
      })
      .mockResolvedValueOnce({
        parsed: {
          ...okParsed,
          subject: 'S2',
          topics: ['b'],
          key_concepts: ['c2'],
          high_yield_highlights: ['hy'],
        },
        modelUsed: 'm2',
      })
      .mockRejectedValueOnce(new Error('meta fail'));

    const r = await analyzeTranscript(longText);
    expect(r.subject).toBe('S1');
    expect(r.topics.length).toBeGreaterThan(0);
    expect(r.lectureSummary).toContain('...');
  });
});
