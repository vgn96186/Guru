import { z } from 'zod';

/**
 * Validates AI JSON output against a Zod schema.
 * If invalid, throws a descriptive error to trigger the repair/retry logic.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function validateAIResponse<T>(schema: z.Schema<T>, data: any): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errorMsg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
    console.warn(`[AI_VALIDATION] Failed: ${errorMsg}`);
    throw new Error(`AI response failed validation: ${errorMsg}`);
  }

  return result.data;
}
