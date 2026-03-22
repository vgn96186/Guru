import type { UserProfile } from '../types';
import { profileRepository } from '../db/repositories';

const MAX_LEN = 520;

/**
 * Compact, bounded snapshot of FSRS/review state + exam countdown for Guru Chat prompts.
 * Omits heavy joins; safe to call on each send (samples only).
 */
export async function buildBoundedGuruChatStudyContext(
  profile: UserProfile | null,
): Promise<string | undefined> {
  if (!profile) return undefined;
  try {
    const [due, weak] = await Promise.all([
      profileRepository.getReviewDueTopics(),
      profileRepository.getWeakestTopics(5),
    ]);
    const examLabel = profile.examType === 'NEET' ? 'NEET-PG' : 'INI-CET';
    const examDate = profile.examType === 'NEET' ? profile.neetDate : profile.inicetDate;
    const days = profileRepository.getDaysToExam(examDate);

    const parts: string[] = [];
    if (days > 0) {
      parts.push(`${examLabel} in ${days} day(s)`);
    }
    if (due.length > 0) {
      const sample = due
        .slice(0, 6)
        .map((t) => t.topicName)
        .join(', ');
      parts.push(`Review queue (sample): ${sample}`);
    }
    if (weak.length > 0) {
      const w = weak
        .slice(0, 4)
        .map((t) => t.name)
        .join(', ');
      parts.push(`Lower-confidence topics (sample): ${w}`);
    }
    if (parts.length === 0) return undefined;
    let out = parts.join(' | ');
    if (out.length > MAX_LEN) {
      out = `${out.slice(0, MAX_LEN - 3)}...`;
    }
    return out;
  } catch {
    return undefined;
  }
}
