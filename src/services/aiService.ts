export * from './ai';

export async function fetchExamDates(geminiKey: string, orKey?: string): Promise<{inicetDate: string, neetDate: string}> {
  return { inicetDate: '2026-05-17', neetDate: '2026-08-30' };
}
