import { z } from 'zod';

/**
 * JSON Schema for Gemini `responseJsonSchema` (subset supported by the API).
 * Uses Zod 4 native conversion; returns null if the schema uses unrepresentable types.
 */
export function zodSchemaToGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> | null {
  try {
    const out = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      unrepresentable: 'any',
    }) as Record<string, unknown>;
    if (!out || typeof out !== 'object') return null;
    return out;
  } catch {
    return null;
  }
}
