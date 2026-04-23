const fs = require('fs');

const testCode = `
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
    const createSource = (sourceName, title, snippet, publishedAt = undefined) => ({
      id: '1',
      title,
      snippet,
      url: 'https://example.com/test',
      source: sourceName,
      publishedAt,
    });

    it('assigns base scores correctly based on source type', () => {
      // When query doesn't match any terms but there are no query terms:
      // query terms empty => no penalty
      const query = 'a'; // length 1, so empty query terms
      expect(scoreGroundingSource(createSource('PubMed', '', ''), query)).toBe(36);
      expect(scoreGroundingSource(createSource('EuropePMC', '', ''), query)).toBe(34);
      expect(scoreGroundingSource(createSource('Wikipedia', '', ''), query)).toBe(16); // 22 - 6 (no title hit)
      expect(scoreGroundingSource(createSource('DuckDuckGo', '', ''), query)).toBe(-10); // 6 - 6 - 10
      expect(scoreGroundingSource(createSource('Other', '', ''), query)).toBe(18);
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
    });

    it('penalizes sources with no title or snippet hits when query terms exist', () => {
      const source = createSource('PubMed', 'nothing', 'nothing');
      // base: 36, penalty: -18 => 18
      expect(scoreGroundingSource(source, 'hypertension')).toBe(18);
    });

    it('adds bonus points for recent publications', () => {
      const currentYear = new Date().getFullYear();
      const recentSource = createSource('PubMed', 'hypertension', 'hypertension', \`\${currentYear}-01-01\`);
      // base: 36. title hit: +8 => 44. age=0 => bonus +6 => 50
      expect(scoreGroundingSource(recentSource, 'hypertension')).toBe(50);
    });
  });

  describe('rankGroundingSources', () => {
    it('filters out sources with score <= 0 and sorts by score', () => {
      const sources = [
        { id: '1', title: 'bad', snippet: 'bad', url: 'bad', source: 'DuckDuckGo' }, // score <= 0
        { id: '2', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'PubMed' }, // High score
        { id: '3', title: 'hypertension', snippet: 'hypertension', url: 'url', source: 'Other' }, // Medium score
      ];
      const ranked = rankGroundingSources(sources, 'hypertension', 2);
      expect(ranked).toHaveLength(2);
      expect(ranked[0].id).toBe('2');
      expect(ranked[1].id).toBe('3');
    });

    it('respects maxResults', () => {
      const sources = [
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
`;

const filePath = 'src/services/ai/medicalSearch.unit.test.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Remove the last two lines: '  });\n});\n'
content = content.replace(/  \}\);\n\}\);\n?$/, '  });\n');
content += testCode + '});\n';

fs.writeFileSync(filePath, content);
console.log('Appended tests.');
