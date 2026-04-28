import { deepseekWebProvider } from './deepseekWeb';
import { generateText } from '../../ai/v2/generateText';

jest.mock('../../ai/v2/generateText', () => ({
  generateText: jest.fn(),
}));

describe('deepseekWebProvider', () => {
  it('requests webSearch mode for DeepSeek', async () => {
    (generateText as jest.Mock).mockResolvedValue({ text: '' });

    await deepseekWebProvider.searchText({
      query: 'test query',
      limit: 5,
      profile: { deepseekKey: 'x' },
    } as any);

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        webSearch: true,
      }),
    );
  });
});
