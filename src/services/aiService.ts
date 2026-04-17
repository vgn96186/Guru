export * from './ai';

// Compat alias — tests still reference generateTextWithRouting
export { generateTextV2 as generateTextWithRouting } from './ai/v2/compat';

export async function fetchExamDates(
  _geminiKey: string,
  _orKey?: string,
): Promise<{ inicetDate: string; neetDate: string }> {
  return { inicetDate: '2026-05-17', neetDate: '2026-08-30' };
}
