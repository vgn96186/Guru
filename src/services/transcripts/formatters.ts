import { LectureHistoryItem } from '../../db/queries/aiCache';
import { buildLectureDisplayTitle } from '../lecture/lectureIdentity';

/** Extract the first meaningful line from a note (skip markdown headers) */
export function extractFirstLine(note: string): string {
  const lines = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const stripped = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');
    if (stripped.length > 10) return stripped;
  }
  return lines[0] ?? 'Lecture note';
}

export function getLectureTitle(
  item: Pick<LectureHistoryItem, 'subjectName' | 'topics' | 'note' | 'summary'>,
): string {
  return buildLectureDisplayTitle({
    subjectName: item.subjectName,
    topics: item.topics,
    note: item.note,
    summary: item.summary,
  });
}
