import { searchGoogleCustomSearch } from './google';

jest.mock('../../../../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('../../config', () => ({
  getApiKeys: jest.fn(),
}));

jest.mock('../utils', () => ({
  clipText: jest.fn((s: string) => s),
  fetchJsonWithTimeout: jest.fn(),
}));

describe('searchGoogleCustomSearch', () => {
  const { profileRepository } = require('../../../../db/repositories');
  const { getApiKeys } = require('../../config');
  const { fetchJsonWithTimeout } = require('../utils');

  const asMock = <T>(v: T) => v as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    asMock(profileRepository.getProfile).mockResolvedValue({ id: 1 });
  });

  it('returns empty array when api key is missing', async () => {
    asMock(getApiKeys).mockReturnValue({ googleCustomSearchKey: '' });
    const results = await searchGoogleCustomSearch('kidney', 5);
    expect(results).toEqual([]);
  });

  it('returns parsed results and filters unsupported images', async () => {
    const realNow = Date.now;
    Date.now = () => 123;

    asMock(getApiKeys).mockReturnValue({ googleCustomSearchKey: ' key ' });
    asMock(fetchJsonWithTimeout).mockResolvedValue({
      items: [
        { title: 'A', link: 'https://example.com/a.png', image: { contextLink: 'https://ctx/a' } },
        { title: 'B', link: 'https://example.com/b.svg' },
        {
          title: 'C',
          image: { thumbnailLink: '//example.com/c.png', contextLink: 'https://ctx/c' },
        },
      ],
    });

    const results = await searchGoogleCustomSearch('kidney', 10);
    expect(results.length).toBe(2);
    expect(results[0].source).toBe('Google Custom Search');
    expect(results[0].url).toBe('https://ctx/a');
    expect(results[0].imageUrl).toBe('https://example.com/a.png');
    expect(results[1].imageUrl).toBe('https://example.com/c.png');

    Date.now = realNow;
  });
});
