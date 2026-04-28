import { useMemo } from 'react';
import { countWords } from '../utils';
import type { NoteItem } from '../types';

export function useNotesVaultDiagnostics(notes: NoteItem[], visibleNotes: NoteItem[]) {
  // Junk notes: very short
  const junkNotes = useMemo(() => notes.filter((n) => countWords(n.note) < 80), [notes]);

  // Duplicate detection by content prefix
  const duplicateIds = useMemo(() => {
    const groups = new Map<string, NoteItem[]>();
    for (const n of notes) {
      if (!n.note || countWords(n.note) < 5) continue;
      const key = n.note.trim().slice(0, 200);
      const group = groups.get(key) ?? [];
      group.push(n);
      groups.set(key, group);
    }
    const dupes = new Set<number>();
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      // Keep newest, mark rest
      group.sort((a, b) => b.createdAt - a.createdAt);
      for (let i = 1; i < group.length; i++) dupes.add(group[i].id);
    }
    return dupes;
  }, [notes]);

  // Notes needing relabeling: no subject or generic labels
  const unlabeledNotes = useMemo(
    () =>
      notes.filter((n) => {
        if (countWords(n.note) < 80) return false;
        const subj = (n.subjectName ?? '').toLowerCase();
        return (
          !subj ||
          subj === 'general' ||
          subj === 'unknown' ||
          subj === 'lecture' ||
          (!n.summary && n.topics.length === 0)
        );
      }),
    [notes],
  );

  // Bad title patterns from previous AI runs
  const badTitleNotes = useMemo(
    () =>
      notes.filter((n) => {
        const s = (n.summary ?? '').toLowerCase();
        return (
          !!s &&
          (/\b(covers?|focuses?|discusses?|overview of|about the|this note)\b/.test(s) ||
            /^lecture content recorded(\. review transcript for details\.)?$/.test(s) ||
            /^lecture summary captured\.?$/.test(s))
        );
      }),
    [notes],
  );

  const taggedNotesCount = useMemo(
    () => notes.filter((note) => note.topics.length > 0).length,
    [notes],
  );

  const wordCountMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const note of visibleNotes) {
      map.set(note.id, countWords(note.note));
    }
    return map;
  }, [visibleNotes]);

  return {
    junkNotes,
    duplicateIds,
    unlabeledNotes,
    badTitleNotes,
    taggedNotesCount,
    wordCountMap,
  };
}
