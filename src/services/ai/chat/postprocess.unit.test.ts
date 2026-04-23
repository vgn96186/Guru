import { shouldDropFinalQuestion, splitReplyAndFinalQuestion } from './postprocess';

describe('postprocess', () => {
  describe('splitReplyAndFinalQuestion', () => {
    it('extracts explicitly prefixed question', () => {
      const text = 'Here is the explanation.\nQuestion: What is the next step?';
      const result = splitReplyAndFinalQuestion(text);
      expect(result.body).toBe('Here is the explanation.');
      expect(result.question).toBe('What is the next step?');
    });

    it('extracts trailing question mark', () => {
      const text = 'This is because of X. Why does Y happen?';
      const result = splitReplyAndFinalQuestion(text);
      expect(result.body).toBe('This is because of X.');
      expect(result.question).toBe('Why does Y happen?');
    });

    it('handles no question', () => {
      const text = 'Just a statement.';
      const result = splitReplyAndFinalQuestion(text);
      expect(result.body).toBe('Just a statement.');
      expect(result.question).toBeNull();
    });
  });

  describe('shouldDropFinalQuestion', () => {
    it('drops repeated question', () => {
      expect(shouldDropFinalQuestion('body. What is X?', ['what is x?'])).toBe(true);
    });

    it('keeps new question', () => {
      expect(shouldDropFinalQuestion('body. What is X?', ['what is y?'])).toBe(false);
    });

    it('drops question that overlaps heavily with body in a direct answer', () => {
      expect(shouldDropFinalQuestion('The answer is diabetes. What is diabetes?')).toBe(true);
    });
  });
});
