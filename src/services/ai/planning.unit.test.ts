jest.mock('./generate', () => ({
  generateJSONWithRouting: jest.fn(),
}));

import { generateJSONWithRouting } from './generate';
import { generateGuruPresenceMessages } from './planning';

describe('generateGuruPresenceMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns messages when the model responds with an object root', async () => {
    jest.mocked(generateJSONWithRouting).mockResolvedValue({
      parsed: {
        messages: [
          { text: 'Keep moving through Pharmacology.', trigger: 'periodic' },
          { text: 'One more question locked in.', trigger: 'card_done' },
        ],
      },
      modelUsed: 'groq/test',
    });

    const result = await generateGuruPresenceMessages(['Pharmacology'], ['Pharmacology']);

    expect(result).toEqual([
      { text: 'Keep moving through Pharmacology.', trigger: 'periodic' },
      { text: 'One more question locked in.', trigger: 'card_done' },
    ]);
  });

  it('returns messages when the model responds with a legacy array root', async () => {
    jest.mocked(generateJSONWithRouting).mockResolvedValue({
      parsed: [{ text: 'Still here with Biochemistry.', trigger: 'periodic' }],
      modelUsed: 'groq/test',
    });

    const result = await generateGuruPresenceMessages(['Biochemistry'], ['Biochemistry']);

    expect(result).toEqual([{ text: 'Still here with Biochemistry.', trigger: 'periodic' }]);
  });
});
