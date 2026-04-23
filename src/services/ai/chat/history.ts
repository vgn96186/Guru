import type { Message } from '../types';
import { clipText } from '../medicalSearch';

export function buildHistoryMessages(
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  limit: number,
): Message[] {
  return history.slice(-limit).map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'assistant',
    content: clipText(entry.text, 280),
  }));
}

export function extractRecentGuruQuestions(
  history: Array<{ role: 'user' | 'guru'; text: string }>,
  limit = 4,
): string[] {
  const seen = new Set<string>();
  const questions: string[] = [];

  for (let i = history.length - 1; i >= 0 && questions.length < limit; i -= 1) {
    const entry = history[i];
    if (entry.role !== 'guru') continue;

    const explicitQuestions = entry.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^question:\s*/i.test(line))
      .map((line) => line.replace(/^question:\s*/i, '').trim());

    const fallbackQuestion =
      explicitQuestions.length === 0 && /\?\s*$/.test(entry.text.trim())
        ? (entry.text
            .trim()
            .split('\n')
            .pop()
            ?.trim()
            .replace(/^question:\s*/i, '') ?? '')
        : '';

    for (const candidate of [...explicitQuestions, fallbackQuestion].filter(Boolean)) {
      const normalized = candidate.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      questions.push(candidate);
      if (questions.length >= limit) break;
    }
  }

  return questions.reverse();
}
