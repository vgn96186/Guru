import { getCachedImageSearch, setCachedImageSearch } from './cache';

describe('medicalSearch cache', () => {
  const realNow = Date.now;

  afterEach(() => {
    Date.now = realNow;
  });

  it('returns undefined when missing', () => {
    expect(getCachedImageSearch('missing')).toBeUndefined();
  });

  it('caches and expires entries', () => {
    Date.now = () => 1000;
    setCachedImageSearch('kidney', 'https://example.com/kidney.png');
    expect(getCachedImageSearch('kidney')).toBe('https://example.com/kidney.png');

    Date.now = () => 1000 + 10 * 60 * 1000 + 1;
    expect(getCachedImageSearch('kidney')).toBeUndefined();
  });
});
