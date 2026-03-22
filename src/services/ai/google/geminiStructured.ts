import { z } from 'zod';
import { GEMINI_STRUCTURED_JSON_MODELS } from '../../../config/appConfig';
import type { Message } from '../types';
import { getGoogleGenAI } from './genaiClient';
import { messagesToGeminiContents } from './geminiContents';
import { isGeminiSdkRateLimitError, rethrowGeminiSdkError } from './geminiSdkErrors';
import { zodSchemaToGeminiJsonSchema } from './zodToResponseJsonSchema';

function pickGeminiModelForStructured(taskComplexity: 'low' | 'high'): string {
  return taskComplexity === 'high'
    ? GEMINI_STRUCTURED_JSON_MODELS.high
    : GEMINI_STRUCTURED_JSON_MODELS.low;
}

/**
 * Gemini native JSON generation using `responseMimeType` + `responseJsonSchema` (Zod 4 → JSON Schema).
 * Throws if the Zod schema cannot be converted, or on SDK/network errors (rate limits rethrown as RateLimitError).
 */
export async function geminiGenerateStructuredJsonSdk<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  geminiKey: string,
  taskComplexity: 'low' | 'high',
): Promise<{ parsed: T; modelUsed: string }> {
  const jsonSchema = zodSchemaToGeminiJsonSchema(schema);
  if (!jsonSchema) {
    throw new Error('Zod schema could not be converted to JSON Schema for Gemini structured output');
  }

  const ai = getGoogleGenAI(geminiKey);
  const model = pickGeminiModelForStructured(taskComplexity);
  const { systemInstruction, contents } = messagesToGeminiContents(messages);

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        // Lower temps → more deterministic JSON (preview/chat use higher temps in geminiChat.ts).
        temperature: taskComplexity === 'high' ? 0.32 : 0.22,
        maxOutputTokens: taskComplexity === 'high' ? 8192 : 4096,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
      },
    });

    const raw = response.text?.trim();
    if (!raw) {
      throw new Error('Empty structured response from Gemini');
    }

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error('Gemini returned non-JSON text for structured output');
    }

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Gemini JSON failed Zod validation: ${parsed.error.message}`);
    }

    return { parsed: parsed.data, modelUsed: `gemini/${model}` };
  } catch (err) {
    if (isGeminiSdkRateLimitError(err)) {
      rethrowGeminiSdkError(err, model);
    }
    throw err;
  }
}
