import { getSubjectByName } from '../../db/queries/topics';
import type { Subject } from '../../types';

const GENERIC_SUBJECT_NAMES = new Set(['unknown', 'general']);

function normalizeSubjectName(subjectName?: string | null): string {
  return subjectName?.replace(/\s+/g, ' ').trim() ?? '';
}

function isGenericSubjectName(subjectName: string): boolean {
  return !subjectName || GENERIC_SUBJECT_NAMES.has(subjectName.toLowerCase());
}

export async function resolveLectureSubjectRequirement(subjectName?: string | null): Promise<{
  matchedSubject: Subject | null;
  normalizedSubjectName: string;
  requiresSelection: boolean;
}> {
  const normalizedSubjectName = normalizeSubjectName(subjectName);

  if (isGenericSubjectName(normalizedSubjectName)) {
    return {
      matchedSubject: null,
      normalizedSubjectName: '',
      requiresSelection: true,
    };
  }

  const matchedSubject = await getSubjectByName(normalizedSubjectName);
  return {
    matchedSubject,
    normalizedSubjectName,
    requiresSelection: !matchedSubject,
  };
}
