import type { NoteItem } from './types';

export function countWords(text: string): number {
  return text?.trim() ? text.trim().split(/\s+/).length : 0;
}

export function getTitle(item: NoteItem): string {
  const summary = item.summary?.trim();
  if (
    summary &&
    !/^lecture content recorded(\.|\. review transcript for details\.)?$/i.test(summary) &&
    !/^lecture summary captured\.?$/i.test(summary)
  ) {
    return summary;
  }
  if (item.topics.length > 0) return item.topics.slice(0, 3).join(', ');
  return item.note?.slice(0, 60) || 'Untitled Note';
}

export function buildNoteGroundingContext(item: NoteItem): string {
  return [
    `Title: ${getTitle(item)}`,
    `Subject: ${item.subjectName || 'Unknown'}`,
    item.topics.length > 0 ? `Topics: ${item.topics.join(', ')}` : null,
    item.summary ? `Summary: ${item.summary}` : null,
    item.appName ? `Source: ${item.appName}` : null,
    `Saved note:\n${item.note.trim().slice(0, 4500)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildVaultGroundingContext(notes: NoteItem[]): string {
  return notes
    .slice(0, 5)
    .map((note, index) => `Note ${index + 1}\n${buildNoteGroundingContext(note)}`)
    .join('\n\n---\n\n');
}
