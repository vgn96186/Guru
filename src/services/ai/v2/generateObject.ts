/**
 * generateObject — structured output via Zod schema.
 *
 * Prefers provider-native JSON mode (responseFormat). Falls back to prompting
 * + jsonRepair. This is where Guru's existing `jsonRepair` shines as a safety
 * net.
 */

import type { z } from 'zod';
import type { LanguageModelV2, ModelMessage } from './spec';
import { zodToJsonSchema } from './tool';
import { parseStructuredJson } from '../jsonRepair';

export interface GenerateObjectOptions<T> {
  model: LanguageModelV2;
  messages: ModelMessage[];
  system?: string;
  schema: z.ZodType<T>;
  /** Optional name hint some providers use. */
  schemaName?: string;
  maxOutputTokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface GenerateObjectResult<T> {
  object: T;
  rawText: string;
}

export async function generateObject<T>(
  options: GenerateObjectOptions<T>,
): Promise<GenerateObjectResult<T>> {
  const { model, messages, system, schema, maxOutputTokens, temperature, abortSignal } = options;
  const jsonSchema = zodToJsonSchema(schema);

  const prompt: ModelMessage[] = system
    ? [{ role: 'system', content: system }, ...messages]
    : [...messages];

  const result = await model.doGenerate({
    prompt,
    maxOutputTokens,
    temperature,
    abortSignal,
    responseFormat: { type: 'json', schema: jsonSchema },
  });

  // Extract raw text from content parts.
  const rawText = result.content
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');

  // Use Guru's jsonRepair as safety net (handles repair + zod validation).
  const validated = await parseStructuredJson(rawText, schema);

  return { object: validated, rawText };
}
