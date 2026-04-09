import { calculateTextSimilarity, detectContradictions } from './medicalFactCheck';

describe('medicalFactCheck', () => {
  describe('calculateTextSimilarity', () => {
    it('returns 1.0 for identical texts', () => {
      expect(
        calculateTextSimilarity('artemisinin treats malaria', 'artemisinin treats malaria'),
      ).toBe(1.0);
    });

    it('returns high similarity for similar texts', () => {
      const score = calculateTextSimilarity(
        'Artemisinin is first-line for falciparum malaria treatment',
        'Artemisinin is the drug of choice for falciparum malaria',
      );
      expect(score).toBeGreaterThan(0.3);
    });

    it('returns low similarity for unrelated texts', () => {
      const score = calculateTextSimilarity(
        'Metformin is first-line for type 2 diabetes',
        'Amoxicillin treats urinary tract infections',
      );
      expect(score).toBeLessThan(0.3);
    });

    it('handles empty strings', () => {
      expect(calculateTextSimilarity('', '')).toBe(0);
      expect(calculateTextSimilarity('test', '')).toBe(0);
    });
  });

  describe('detectContradictions', () => {
    it('detects contradictions when similar texts differ', () => {
      const aiClaims = [
        {
          sentence: 'Standard dose is 20mg/kg artemether daily for malaria',
          entities: ['artemether'],
        },
      ];
      const trustedSources = [
        { source: 'DBMCI', text: 'Artemether dose is 80mg twice daily for 3 days malaria' },
      ];

      const contradictions = detectContradictions(aiClaims, trustedSources);
      expect(contradictions.length).toBeGreaterThan(0);
    });

    it('does not flag highly matching claims', () => {
      const aiClaims = [
        {
          sentence: 'Artemisinin-based combination therapy is first-line for falciparum malaria',
          entities: ['artemether', 'malaria'],
        },
      ];
      const trustedSources = [
        {
          source: 'WHO',
          text: 'Artemisinin-based combination therapy is first-line for falciparum malaria treatment',
        },
      ];

      const contradictions = detectContradictions(aiClaims, trustedSources);
      expect(contradictions.length).toBe(0);
    });

    it('returns empty for no claims', () => {
      expect(detectContradictions([], [{ source: 'test', text: 'some text' }])).toEqual([]);
    });
  });
});
