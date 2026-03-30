/**
 * ChatGPT Responses API caller.
 * Adapts the app's Message[] format to the OpenAI Responses API.
 */
import type { Message } from '../types';
import type { ChatGptAccountSlot } from '../../../types';
import { getValidAccessToken, getAccountId } from './chatgptTokenStore';
import { CHATGPT_MODELS } from '../../../config/appConfig';

const RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses';
const OPENAI_BETA_HEADER = 'responses=experimental';
const ORIGINATOR_HEADER = 'codex_cli_rs';

interface ResponsesApiInput {
  type: 'message';
  role: 'user' | 'assistant' | 'developer';
  content: Array<{
    type: 'input_text' | 'output_text';
    text: string;
  }>;
}

const DEFAULT_CODEX_INSTRUCTIONS =
  'You are Codex, a careful coding assistant. Follow the user instructions exactly and return useful plain text.';
const JSON_FORMAT_CUE = 'Respond in JSON format.';

function getChatGptFetch(): typeof fetch {
  try {
    const expoFetchModule = require('expo/fetch') as { fetch?: typeof fetch };
    if (typeof expoFetchModule.fetch === 'function') {
      return expoFetchModule.fetch.bind(expoFetchModule);
    }
  } catch {
    // Fall through to the global fetch implementation when expo/fetch is unavailable in tests.
  }

  if (typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis) as typeof fetch;
  }

  throw new Error('No fetch implementation available for ChatGPT transport');
}

function extractTextFromResponsesData(data: any): string {
  const output = data?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'output_text' && typeof c.text === 'string') {
            return c.text;
          }
        }
      }
    }
  }
  throw new Error('ChatGPT returned no text output');
}

function ensureJsonWordInResponsesInput(messages: Message[]): Message[] {
  if (messages.length === 0) return messages;

  const hasJsonWord = messages.some((message) => /\bjson\b/i.test(message.content));
  if (hasJsonWord) return messages;

  const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  const targetIndex = lastUserIndex >= 0 ? lastUserIndex : messages.length - 1;
  const targetMessage = messages[targetIndex];
  const separator = targetMessage.content.trimEnd().length > 0 ? '\n\n' : '';

  return messages.map((message, index) =>
    index === targetIndex
      ? {
          ...message,
          content: `${targetMessage.content.trimEnd()}${separator}${JSON_FORMAT_CUE}`,
        }
      : message,
  );
}

function parseBufferedChatGptResponseText(raw: string, onDelta?: (delta: string) => void): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('ChatGPT stream returned no text');

  if (trimmed.startsWith('{')) {
    return extractTextFromResponsesData(JSON.parse(trimmed));
  }

  let full = '';
  const blocks = trimmed.split('\n\n');
  for (const block of blocks) {
    for (const line of block.split('\n')) {
      const lineTrimmed = line.trim();
      if (!lineTrimmed.startsWith('data:')) continue;
      const payload = lineTrimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          full += event.delta;
          onDelta?.(event.delta);
          continue;
        }

        const candidate = event.response ?? event;
        try {
          const text = extractTextFromResponsesData(candidate);
          if (text) return text;
        } catch {
          // Continue scanning other events.
        }
      } catch {
        // Ignore malformed chunks.
      }
    }
  }

  if (full) return full;
  throw new Error('ChatGPT stream returned no text');
}

function splitForPseudoStream(text: string, targetChunkChars = 34): string[] {
  const parts = text.split(/(\s+)/).filter((part) => part.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    if (current.length > 0 && current.length + part.length > targetChunkChars) {
      chunks.push(current);
      current = part;
      continue;
    }
    current += part;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

async function emitPseudoStreamFallback(
  text: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  for (const chunk of splitForPseudoStream(text)) {
    onDelta(chunk);
  }
  return text;
}

async function readChatGptSseResponse(
  res: Response,
  onDelta?: (delta: string) => void,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) {
    const raw = await res.text().catch(() => '');
    return parseBufferedChatGptResponseText(raw, onDelta);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    if (done) buffer += decoder.decode();

    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const event = JSON.parse(payload);
          if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
            full += event.delta;
            onDelta?.(event.delta);
            continue;
          }

          const candidate = event.response ?? event;
          try {
            const text = extractTextFromResponsesData(candidate);
            if (text && !full) full = text;
          } catch {
            // Continue scanning other events.
          }
        } catch {
          // Ignore malformed chunks.
        }
      }
    }

    if (done) break;
  }

  if (full) return full;
  if (buffer.trim()) return parseBufferedChatGptResponseText(buffer, onDelta);
  throw new Error('ChatGPT stream returned no text');
}

function buildResponsesPayload(
  messages: Message[],
  model: string,
  stream?: boolean,
  jsonMode?: boolean,
): Record<string, unknown> {
  const instructionParts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content.trim())
    .filter(Boolean);

  const inputMessages = messages.filter((m) => m.role !== 'system');
  const normalizedInputMessages = jsonMode
    ? ensureJsonWordInResponsesInput(inputMessages)
    : inputMessages;

  const input = normalizedInputMessages.map((m) => ({
    type: 'message' as const,
    role: m.role,
    content: [
      {
        type: (m.role === 'assistant' ? 'output_text' : 'input_text') as
          | 'input_text'
          | 'output_text',
        text: m.content,
      },
    ],
  }));

  const body: Record<string, unknown> = {
    model,
    instructions: instructionParts.join('\n\n') || DEFAULT_CODEX_INSTRUCTIONS,
    input,
    store: false,
    include: ['reasoning.encrypted_content'],
  };

  if (stream) {
    body.stream = true;
  }

  if (jsonMode) {
    body.text = { format: { type: 'json_object' } };
  }

  return body;
}

function buildChatGptHeaders(
  accessToken: string,
  accountId: string,
  accept: 'application/json' | 'text/event-stream',
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: accept,
    Authorization: `Bearer ${accessToken}`,
    'OpenAI-Beta': OPENAI_BETA_HEADER,
    Originator: ORIGINATOR_HEADER,
    ...(accountId ? { 'chatgpt-account-id': accountId } : {}),
  };
}

async function throwChatGptError(
  res: Response,
  mode: 'request' | 'stream',
  model: string,
): Promise<never> {
  const text = await res.text().catch(() => '');
  const suffix =
    res.status === 401
      ? ' This ChatGPT/Codex connection expects Codex-capable model IDs, not GPT-4.x models.'
      : '';
  throw new Error(`ChatGPT ${mode} error (${res.status}) [${model}]: ${text}${suffix}`);
}

/**
 * Non-streaming call to ChatGPT Responses API.
 */
export async function callChatGpt(
  messages: Message[],
  model?: string,
  jsonMode?: boolean,
  slot: ChatGptAccountSlot = 'primary',
): Promise<string> {
  const accessToken = await getValidAccessToken(slot);
  const accountId = await getAccountId(slot);
  const selectedModel = model ?? CHATGPT_MODELS[0];
  const body = buildResponsesPayload(messages, selectedModel, true, jsonMode);
  const transportFetch = getChatGptFetch();

  const res = await transportFetch(RESPONSES_URL, {
    method: 'POST',
    headers: buildChatGptHeaders(accessToken, accountId, 'text/event-stream'),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwChatGptError(res, 'request', selectedModel);
  }

  return readChatGptSseResponse(res);
}

/**
 * Streaming call to ChatGPT Responses API.
 */
export async function streamChatGpt(
  messages: Message[],
  model: string,
  onDelta: (delta: string) => void,
  slot: ChatGptAccountSlot = 'primary',
): Promise<string> {
  const accessToken = await getValidAccessToken(slot);
  const accountId = await getAccountId(slot);
  const body = buildResponsesPayload(messages, model, true, false);
  const transportFetch = getChatGptFetch();

  const res = await transportFetch(RESPONSES_URL, {
    method: 'POST',
    headers: buildChatGptHeaders(accessToken, accountId, 'text/event-stream'),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    await throwChatGptError(res, 'stream', model);
  }

  return readChatGptSseResponse(res, onDelta);
}
