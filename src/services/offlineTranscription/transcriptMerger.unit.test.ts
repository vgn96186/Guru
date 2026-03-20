import { TranscriptMerger } from './transcriptMerger';
import { TranscriptSegment } from './types';

jest.mock('expo-crypto', () => ({
  randomUUID: () => 'test-uuid',
}));

describe('TranscriptMerger', () => {
  let merger: TranscriptMerger;

  beforeEach(() => {
    merger = new TranscriptMerger();
  });

  describe('merge', () => {
    it('should merge segments and build full text', () => {
      const segments: TranscriptSegment[] = [
        { id: 0, start: 0, end: 5, text: 'Hello world from the transcriber.' },
        { id: 1, start: 5, end: 10, text: 'This is a test of the merger.' },
      ];
      const result = merger.merge(segments, 'Test Lecture', '2023-01-01T00:00:00Z', 10, 'base', {});

      expect(result.title).toBe('Test Lecture');
      expect(result.text).toBe('Hello world from the transcriber. This is a test of the merger.');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].id).toBe(0);
      expect(result.segments[1].id).toBe(1);
      expect(result.id).toBe('lecture_test-uuid');
    });

    it('should sort segments by start time', () => {
      const segments: TranscriptSegment[] = [
        { id: 1, start: 5, end: 10, text: 'The second segment comes after.' },
        { id: 0, start: 0, end: 5, text: 'The first segment comes before.' },
      ];
      const result = merger.merge(segments, 'Sorted', '2023-01-01T00:00:00Z', 10, 'base', {});
      expect(result.text).toBe('The first segment comes before. The second segment comes after.');
      expect(result.segments[0].text).toBe('The first segment comes before.');
      expect(result.segments[1].text).toBe('The second segment comes after.');
    });

    it('should deduplicate overlaps', () => {
      const segments: TranscriptSegment[] = [
        { id: 0, start: 0, end: 10, text: 'the mitochondria is the powerhouse of' },
        { id: 1, start: 9, end: 20, text: 'powerhouse of the cell and it produces' },
      ];
      const result = merger.merge(segments, 'Overlap', '2023-01-01T00:00:00Z', 20, 'base', {});
      expect(result.text).toBe('the mitochondria is the powerhouse of the cell and it produces');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('the mitochondria is the powerhouse of');
      expect(result.segments[1].text).toBe('the cell and it produces');
    });

    it('should fuzzy deduplicate overlaps', () => {
        // fuzzyWordMatch allows 1 word difference for overlapLen >= 4
        const segments: TranscriptSegment[] = [
          { id: 0, start: 0, end: 10, text: 'one two three four five' },
          { id: 1, start: 9, end: 20, text: 'two three something four five six' },
        ];
        // overlapLen = 5: "one two three four five" tails: "one two three four five"
        // "two three something four five six" heads: "two three something four five"
        // diffs: "one" vs "two", "two" vs "three", ... many diffs.
        
        // Let's try overlapLen = 4:
        // tailA: "two three four five"
        // headB: "two three something four"
        // diffs: 1 ("something" vs "four" ? no, "four" vs "five")
        // "two" === "two"
        // "three" === "three"
        // "four" !== "something" (diff 1)
        // "five" !== "four" (diff 2) -> fails.
        
        // Let's try:
        // textA: "this is a very long sentence"
        // textB: "is a REALLY long sentence that continues"
        // wordsA: ["this", "is", "a", "very", "long", "sentence"]
        // wordsB: ["is", "a", "REALLY", "long", "sentence", "that", "continues"]
        // overlapLen 5:
        // tailA: ["is", "a", "very", "long", "sentence"]
        // headB: ["is", "a", "REALLY", "long", "sentence"]
        // diffs: "very" vs "REALLY" (1 diff) -> Match!
        
        const segments2: TranscriptSegment[] = [
            { id: 0, start: 0, end: 10, text: 'this is a very long sentence' },
            { id: 1, start: 9, end: 20, text: 'is a REALLY long sentence that continues' },
        ];
        const result = merger.merge(segments2, 'Fuzzy Overlap', '2023-01-01T00:00:00Z', 20, 'base', {});
        // If matched with overlapLen 5:
        // remaining B: wordsB.slice(5) -> ["that", "continues"]
        expect(result.text).toBe('this is a very long sentence that continues');
    });

    it('should consolidate short segments', () => {
      const segments: TranscriptSegment[] = [
        { id: 0, start: 0, end: 5, text: 'This is a long segment.' },
        { id: 1, start: 5, end: 6, text: 'Short.' },
        { id: 2, start: 6, end: 10, text: 'Another long segment here.' },
      ];
      const result = merger.merge(segments, 'Consolidate', '2023-01-01T00:00:00Z', 10, 'base', {});
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].text).toBe('This is a long segment.');
      expect(result.segments[1].text).toBe('Short. Another long segment here.');
    });

    it('should handle edge case: only short segments', () => {
        const segments: TranscriptSegment[] = [
          { id: 0, start: 0, end: 1, text: 'One.' },
          { id: 1, start: 1, end: 2, text: 'Two.' },
          { id: 2, start: 2, end: 3, text: 'Three.' },
        ];
        const result = merger.merge(segments, 'Shorties', '2023-01-01T00:00:00Z', 3, 'base', {});
        // seg 0: "One." (1 word) -> buffer = seg 0
        // seg 1: "Two." (1 word) -> buffer = "One. Two."
        // seg 2: "Three." (1 word) -> buffer = "One. Two. Three."
        // flush buffer -> result = ["One. Two. Three."]
        expect(result.segments).toHaveLength(1);
        expect(result.segments[0].text).toBe('One. Two. Three.');
      });

    it('should handle empty segments array', () => {
      const result = merger.merge([], 'Empty', '2023-01-01T00:00:00Z', 0, 'base', {});
      expect(result.text).toBe('');
      expect(result.segments).toHaveLength(0);
    });

    it('should handle segment with no words', () => {
        const segments: TranscriptSegment[] = [
            { id: 0, start: 0, end: 5, text: 'Hello' },
            { id: 1, start: 5, end: 10, text: '   ' },
            { id: 2, start: 10, end: 15, text: 'World' },
        ];
        const result = merger.merge(segments, 'Spaces', '2023-01-01T00:00:00Z', 15, 'base', {});
        expect(result.text).toBe('Hello World');
    });
  });
});
