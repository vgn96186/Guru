import {
  getLectureSubjectLabel,
  getLectureTopicLabels,
  buildLectureDisplayTitle,
  buildLectureFileStem,
  buildLectureArtifactFileName,
} from './lectureIdentity';

describe('lectureIdentity', () => {
  describe('getLectureSubjectLabel', () => {
    it('returns the normalized subject name', () => {
      expect(getLectureSubjectLabel('  Mathematics  ')).toBe('Mathematics');
      expect(getLectureSubjectLabel('Computer   Science')).toBe('Computer Science');
    });

    it('returns "General" for null, undefined, or empty strings', () => {
      expect(getLectureSubjectLabel(null)).toBe('General');
      expect(getLectureSubjectLabel(undefined)).toBe('General');
      expect(getLectureSubjectLabel('')).toBe('General');
      expect(getLectureSubjectLabel('   ')).toBe('General');
    });
  });

  describe('getLectureTopicLabels', () => {
    it('returns unique normalized topic labels', () => {
      expect(getLectureTopicLabels(['Algebra', ' Geometry ', 'ALGEBRA'])).toEqual(['Algebra', 'Geometry']);
    });

    it('removes empty or whitespace-only topics', () => {
      expect(getLectureTopicLabels(['', '  ', 'Calculus'])).toEqual(['Calculus']);
    });

    it('returns an empty array for null, undefined, or empty input', () => {
      expect(getLectureTopicLabels(null)).toEqual([]);
      expect(getLectureTopicLabels(undefined)).toEqual([]);
      expect(getLectureTopicLabels([])).toEqual([]);
    });
  });

  describe('buildLectureDisplayTitle', () => {
    const input = {
      subjectName: 'History',
      topics: ['Renaissance', 'Enlightenment', 'French Revolution', 'Industrial Revolution'],
    };

    it('builds a display title with subject and topics', () => {
      expect(buildLectureDisplayTitle({ ...input, topics: ['Renaissance'] })).toBe('History - Renaissance');
    });

    it('caps the number of topics and adds a "more" suffix', () => {
      expect(buildLectureDisplayTitle(input, 2)).toBe('History - Renaissance, Enlightenment + 2 more');
    });

    it('returns only the subject label if no topics are provided', () => {
      expect(buildLectureDisplayTitle({ subjectName: 'Physics', topics: [] })).toBe('Physics');
      expect(buildLectureDisplayTitle({ subjectName: 'Physics', topics: null })).toBe('Physics');
    });
  });

  describe('buildLectureFileStem', () => {
    it('slugifies and clips the subject and topics', () => {
      const input = {
        subjectName: 'Computer Science: Advanced Algorithms',
        topics: ['Dynamic Programming & Optimization', 'Graph Theory and Applications'],
      };
      // subject: computer-science-advanced-algori (32 chars)
      // topic1: dynamic-programming-optimiza (28 chars)
      // topic2: graph-theory-and-application (28 chars)
      const stem = buildLectureFileStem(input, 2);
      expect(stem).toBe('computer-science-advanced-algori__dynamic-programming-optimiza__graph-theory-and-application');
    });

    it('adds "plus-X-more" for hidden topics', () => {
      const input = {
        subjectName: 'Math',
        topics: ['T1', 'T2', 'T3', 'T4'],
      };
      expect(buildLectureFileStem(input, 2)).toBe('math__t1__t2__plus-2-more');
    });

    it('handles empty/null inputs gracefully', () => {
      expect(buildLectureFileStem({ subjectName: null, topics: null })).toBe('general');
    });
    
    it('handles special characters in topics', () => {
        expect(buildLectureFileStem({ subjectName: 'A#B', topics: ['C%D'] })).toBe('a-b__c-d');
    });
  });

  describe('buildLectureArtifactFileName', () => {
    const input = { subjectName: 'Bio', topics: ['Cells'] };
    const timestamp = 1625097600000;

    it('combines stem, kind, timestamp, and extension', () => {
      expect(buildLectureArtifactFileName('transcript', input, timestamp, 'txt')).toBe('bio__cells__transcript__1625097600000.txt');
    });

    it('handles extensions with or without leading dots', () => {
      expect(buildLectureArtifactFileName('note', input, timestamp, '.md')).toBe('bio__cells__note__1625097600000.md');
      expect(buildLectureArtifactFileName('recording', input, timestamp, 'm4a')).toBe('bio__cells__recording__1625097600000.m4a');
    });
  });
});
