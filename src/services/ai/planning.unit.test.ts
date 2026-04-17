jest.mock('./v2/generateObject', () => ({
  generateObject: jest.fn(),
}));

jest.mock('../../db/repositories/profileRepository', () => ({
  profileRepository: { getProfile: jest.fn(async () => ({})) },
}));

jest.mock('./v2/providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({})),
}));

import { generateObject } from './v2/generateObject';
import { generateGuruPresenceMessages } from './planning';

describe('generateGuruPresenceMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns messages when the model responds with an object root', async () => {
    jest.mocked(generateObject).mockResolvedValue({
      object: {
        messages: [
          { text: 'Keep moving through Pharmacology.', trigger: 'periodic' },
          { text: 'One more question locked in.', trigger: 'card_done' },
        ],
      },
      rawText: '',
    });

    const result = await generateGuruPresenceMessages(['Pharmacology'], ['Pharmacology']);

    expect(result).toEqual([
      { text: 'Keep moving through Pharmacology.', trigger: 'periodic' },
      { text: 'One more question locked in.', trigger: 'card_done' },
    ]);
  });

  it('returns messages when the model responds with a legacy array root', async () => {
    jest.mocked(generateObject).mockResolvedValue({
      object: [{ text: 'Still here with Biochemistry.', trigger: 'periodic' }],
      rawText: '',
    });

    const result = await generateGuruPresenceMessages(['Biochemistry'], ['Biochemistry']);

    expect(result).toEqual([{ text: 'Still here with Biochemistry.', trigger: 'periodic' }]);
  });
});
