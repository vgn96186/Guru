export * from './ai';
import { subscribeToAiRuntime } from './ai/runtimeActivity';

export function addLlmStateListener(
  listener: (state: 'idle' | 'initializing') => void,
): () => void {
  return subscribeToAiRuntime((snapshot) => {
    listener(snapshot.activeCount > 0 ? 'initializing' : 'idle');
  });
}

// Compat alias — tests still reference generateTextWithRouting
export { generateTextV2 as generateTextWithRouting } from './ai/v2/compat';

export async function fetchExamDates(
  _geminiKey: string,
  _orKey?: string,
): Promise<{ inicetDate: string; neetDate: string }> {
  return { inicetDate: '2026-05-17', neetDate: '2026-08-30' };
}
