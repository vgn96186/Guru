import { normalizeMindMapExplanation } from './mindMapAI';

describe('normalizeMindMapExplanation', () => {
  it('strips code fences and collapses whitespace into a compact sentence', () => {
    expect(
      normalizeMindMapExplanation(
        '```text\n  A fast rhythm from the ventricles. \n\n Can be fatal. \n```',
      ),
    ).toBe('A fast rhythm from the ventricles. Can be fatal.');
  });

  it('falls back to a safe default when the model returns nothing useful', () => {
    expect(normalizeMindMapExplanation('```json\n{}\n```')).toBe(
      'Short explanation unavailable. Tap again after a refresh.',
    );
  });
});
