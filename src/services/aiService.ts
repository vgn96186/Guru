export * from './ai';
import { subscribeToAiRuntime } from './ai/runtimeActivity';
import { profileRepository } from '../db/repositories';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

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
  const profile = await profileRepository.getProfile().catch(() => null);
  if (!profile) {
    return { inicetDate: DEFAULT_INICET_DATE, neetDate: DEFAULT_NEET_DATE };
  }
  const { fetchExamDates } = require('./examDateSyncService');
  const result = await fetchExamDates(profile);
  return {
    inicetDate: result.inicetDate ?? profile?.inicetDate ?? DEFAULT_INICET_DATE,
    neetDate: result.neetDate ?? profile?.neetDate ?? DEFAULT_NEET_DATE,
  };
}
