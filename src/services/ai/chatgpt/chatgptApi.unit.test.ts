import { callChatGpt, streamChatGpt } from './chatgptApi';
import { getAccountId, getValidAccessToken } from './chatgptTokenStore';

jest.mock('./chatgptTokenStore', () => ({
  getValidAccessToken: jest.fn(),
  getAccountId: jest.fn(),
}));

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(),
}));

const { fetch: expoFetch } = jest.requireMock('expo/fetch') as { fetch: jest.Mock };

describe('chatgptApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (expoFetch as jest.Mock).mockReset();
    (getValidAccessToken as jest.Mock).mockResolvedValue('access_tok');
    (getAccountId as jest.Mock).mockResolvedValue('acct_123');
  });

  it('calls the Codex backend with Codex-compatible headers', async () => {
    (expoFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: null,
      text: async () =>
        'data: {"type":"response.output_text.delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n',
    });

    await expect(callChatGpt([{ role: 'user', content: 'hello' }], undefined, false)).resolves.toBe(
      'ok',
    );

    expect(expoFetch).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          Authorization: 'Bearer access_tok',
          'OpenAI-Beta': 'responses=experimental',
          Originator: 'codex_cli_rs',
          'chatgpt-account-id': 'acct_123',
        }),
      }),
    );

    expect(JSON.parse((expoFetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      model: 'gpt-5.4',
      instructions:
        'You are Codex, a careful coding assistant. Follow the user instructions exactly and return useful plain text.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      ],
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
    });
  });

  it('streams from the Codex backend with event-stream accept header', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"response.output_text.delta","delta":"hi"}\n\n'),
        );
        controller.close();
      },
    });

    (expoFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: stream,
    });

    const deltas: string[] = [];
    await expect(
      streamChatGpt([{ role: 'user', content: 'hello' }], 'gpt-5.1-codex', (d) => deltas.push(d)),
    ).resolves.toBe('hi');

    expect(deltas).toEqual(['hi']);
    expect((expoFetch as jest.Mock).mock.calls[0][1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          'OpenAI-Beta': 'responses=experimental',
          Originator: 'codex_cli_rs',
        }),
      }),
    );
  });

  it('parses buffered SSE text when the runtime provides no readable body', async () => {
    (expoFetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      body: null,
      text: async () =>
        'data: {"type":"response.output_text.delta","delta":"fallback "}\n\n' +
        'data: {"type":"response.output_text.delta","delta":"text"}\n\n' +
        'data: [DONE]\n\n',
    });

    const deltas: string[] = [];
    await expect(
      streamChatGpt([{ role: 'user', content: 'hello' }], 'gpt-5.4', (d) => deltas.push(d)),
    ).resolves.toBe('fallback text');

    expect(deltas.join('')).toBe('fallback text');
    expect(expoFetch).toHaveBeenCalledTimes(1);
  });

  it('moves system messages into top-level instructions', async () => {
    (expoFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: null,
      text: async () =>
        'data: {"type":"response.output_text.delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n',
    });

    await callChatGpt(
      [
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'hello' },
      ],
      'gpt-5.4',
      true,
    );

    expect(JSON.parse((expoFetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      model: 'gpt-5.4',
      instructions: 'Be precise.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello\n\nRespond in JSON format.' }],
        },
      ],
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
      text: { format: { type: 'json_object' } },
    });
  });

  it('does not append the JSON cue when input already mentions json', async () => {
    (expoFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: null,
      text: async () =>
        'data: {"type":"response.output_text.delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n',
    });

    await callChatGpt(
      [
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Return valid JSON with keys a and b.' },
      ],
      'gpt-5.4',
      true,
    );

    expect(JSON.parse((expoFetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      model: 'gpt-5.4',
      instructions: 'Be precise.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Return valid JSON with keys a and b.' }],
        },
      ],
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
      text: { format: { type: 'json_object' } },
    });
  });

  it('encodes assistant history as output_text content', async () => {
    (expoFetch as jest.Mock).mockResolvedValue({
      ok: true,
      body: null,
      text: async () =>
        'data: {"type":"response.output_text.delta","delta":"ok"}\n\n' + 'data: [DONE]\n\n',
    });

    await callChatGpt(
      [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'prior reply' },
        { role: 'user', content: 'follow up' },
      ],
      'gpt-5.4',
      false,
    );

    expect(JSON.parse((expoFetch as jest.Mock).mock.calls[0][1].body)).toEqual({
      model: 'gpt-5.4',
      instructions:
        'You are Codex, a careful coding assistant. Follow the user instructions exactly and return useful plain text.',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'prior reply' }],
        },
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'follow up' }],
        },
      ],
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
    });
  });
});
