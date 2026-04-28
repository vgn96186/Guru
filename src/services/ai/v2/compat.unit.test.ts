jest.mock('../../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn(async () => ({ displayName: 'Vishnu' })),
  },
}));

jest.mock('./providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({
    provider: 'groq',
    modelId: 'llama-test',
  })),
}));

jest.mock('./generateText');
jest.mock('./generateObject');

jest.mock('./streamText', () => {
  return {
    streamText: jest.fn(() => ({
      textStream: {
        [Symbol.asyncIterator]() {
          let done = false;
          return {
            async next() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: 'hello' };
            },
          };
        },
      },
      fullStream: {
        [Symbol.asyncIterator]() {
          let done = false;
          return {
            async next() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: { type: 'text-delta', text: 'hello' } };
            },
          };
        },
      },
      text: Promise.resolve('hello'),
    })),
  };
});

import { createGuruFallbackModel } from './providers/guruFallback';
import { chatWithGuruV2, chatWithGuruStreamV2, generateJSONV2, generateTextV2 } from './compat';
import { generateText } from './generateText';
import { generateObject } from './generateObject';
import { z } from 'zod';

import { streamText } from './streamText';

describe('compat chosen-model forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createGuruFallbackModel as jest.Mock).mockReturnValue({
      provider: 'groq',
      modelId: 'llama-test',
    });
    (generateText as jest.Mock).mockResolvedValue({
      text: 'ok',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
      usage: {},
      responseMessages: [],
    });
    (generateObject as jest.Mock).mockResolvedValue({
      object: { ok: true },
      finishReason: 'stop',
      usage: {},
    });
    (streamText as jest.Mock).mockReturnValue({
      textStream: {
        [Symbol.asyncIterator]() {
          let done = false;
          return {
            async next() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: 'hello' };
            },
          };
        },
      },
      fullStream: {
        [Symbol.asyncIterator]() {
          let done = false;
          return {
            async next() {
              if (done) return { done: true, value: undefined };
              done = true;
              return { done: false, value: { type: 'text-delta', text: 'hello' } };
            },
          };
        },
      },
      text: Promise.resolve('hello'),
    });
  });

  it('passes chosenModel into generateTextV2', async () => {
    console.log('model is:', createGuruFallbackModel({} as any));
    await generateTextV2([{ role: 'user', content: 'Hi' }], {
      chosenModel: 'groq/llama-3.3-70b-spec',
    });

    expect(createGuruFallbackModel).toHaveBeenCalledWith(
      expect.objectContaining({ chosenModel: 'groq/llama-3.3-70b-spec' }),
    );
  });

  it('passes chosenModel into generateJSONV2', async () => {
    await generateJSONV2([{ role: 'user', content: 'Hi' }], z.object({ ok: z.boolean() }), {
      chosenModel: 'gemini/gemini-3.1-flash-lite',
    });

    expect(createGuruFallbackModel).toHaveBeenCalledWith(
      expect.objectContaining({ chosenModel: 'gemini/gemini-3.1-flash-lite' }),
    );
  });

  it('passes chosenModel into chatWithGuruV2', async () => {
    await chatWithGuruV2('Explain shock', 'Medicine', [], {
      chosenModel: 'chatgpt/gpt-5-mini',
    });

    expect(createGuruFallbackModel).toHaveBeenCalledWith(
      expect.objectContaining({ chosenModel: 'chatgpt/gpt-5-mini' }),
    );
  });

  it('passes chosenModel into chatWithGuruStreamV2', async () => {
    await chatWithGuruStreamV2('Explain shock', 'Medicine', [], jest.fn(), {
      chosenModel: 'meta-llama/llama-3.3-70b-instruct:free',
    });

    expect(createGuruFallbackModel).toHaveBeenCalledWith(
      expect.objectContaining({ chosenModel: 'meta-llama/llama-3.3-70b-instruct:free' }),
    );
  });
});
