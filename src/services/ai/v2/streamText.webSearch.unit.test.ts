import { streamText } from './streamText';

describe('streamText webSearch', () => {
  it('passes webSearch through to model.doStream', async () => {
    const doStream = jest.fn().mockResolvedValue({
      stream: (async function* () {
        yield { type: 'finish', finishReason: 'stop', usage: {} };
      })(),
    });

    const model = {
      specificationVersion: 'v2' as const,
      provider: 'test',
      modelId: 'test',
      doGenerate: jest.fn(),
      doStream,
    };

    const result = streamText({
      model: model as any,
      messages: [{ role: 'user', content: 'hi' }],
      webSearch: true,
    } as any);

    for await (const _ of result.fullStream) {
    }

    expect(doStream).toHaveBeenCalledWith(expect.objectContaining({ webSearch: true }));
  });
});
