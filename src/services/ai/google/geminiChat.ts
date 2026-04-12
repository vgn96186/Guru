import type { GenerateContentResponse } from '@google/genai';
import { CLOUD_MAX_COMPLETION_TOKENS } from '../completionLimits';
import type { Message } from '../types';
import { getGoogleGenAI } from './genaiClient';
import { messagesToGeminiContents } from './geminiContents';
import { isGeminiSdkRateLimitError, rethrowGeminiSdkError } from './geminiSdkErrors';
import { logStreamEvent } from '../runtimeDebug';

/** Align with OpenAI-style cloud cap; Guru answers can be long when the student asks for depth. */
const MAX_OUTPUT_TOKENS = CLOUD_MAX_COMPLETION_TOKENS;
/** Slightly lower than 0.7 for steadier exam-style tutoring; still conversational. */
const TEMPERATURE = 0.65;

/**
 * Gemini text generation via @google/genai (primary path).
 * Caller handles fallback to REST on non-rate-limit failures.
 */
export async function geminiGenerateContentSdk(
  messages: Message[],
  geminiKey: string,
  model: string,
): Promise<string> {
  const ai = getGoogleGenAI(geminiKey);
  const { systemInstruction, contents } = messagesToGeminiContents(messages);
  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
    const text = response.text?.trim();
    if (!text) {
      throw new Error('Empty response from Gemini SDK');
    }
    return text;
  } catch (err) {
    if (isGeminiSdkRateLimitError(err)) {
      rethrowGeminiSdkError(err, model);
    }
    throw err;
  }
}

/**
 * Streams Gemini output via SDK; invokes `onDelta` with incremental text.
 * Returns full concatenated text (trimmed).
 */
export async function geminiGenerateContentStreamSdk(
  messages: Message[],
  geminiKey: string,
  model: string,
  onDelta: (delta: string) => void,
): Promise<string> {
  const ai = getGoogleGenAI(geminiKey);
  const { systemInstruction, contents } = messagesToGeminiContents(messages);
  let stream: AsyncGenerator<GenerateContentResponse>;
  try {
    stream = await ai.models.generateContentStream({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: TEMPERATURE,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    });
  } catch (err) {
    if (isGeminiSdkRateLimitError(err)) {
      rethrowGeminiSdkError(err, model);
    }
    throw err;
  }

  let lastEmitted = '';
  try {
    for await (const chunk of stream) {
      const raw = chunk.text ?? '';
      if (!raw) continue;
      if (lastEmitted && raw.startsWith(lastEmitted)) {
        const delta = raw.slice(lastEmitted.length);
        lastEmitted = raw;
        if (delta) onDelta(delta);
      } else if (!lastEmitted) {
        lastEmitted = raw;
        onDelta(raw);
      } else {
        lastEmitted += raw;
        onDelta(raw);
      }
    }
  } catch (err) {
    if (isGeminiSdkRateLimitError(err)) {
      rethrowGeminiSdkError(err, model);
    }
    throw err;
  }

  const full = lastEmitted.trim();
  if (!full) {
    throw new Error('Empty response from Gemini SDK stream');
  }
  logStreamEvent('sdk_stream_complete', {
    provider: 'gemini',
    model,
    outputChars: full.length,
  });
  return full;
}
