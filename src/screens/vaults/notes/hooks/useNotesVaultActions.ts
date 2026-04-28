import { useCallback } from 'react';
import { deleteLectureNote } from '../../../../db/queries/aiCache';
import { showInfo } from '../../../../components/Toast';
import { confirmDestructive } from '../../../../utils/confirm';
import type { NoteItem } from '../types';

export function useNotesVaultActions(
  setNotes: React.Dispatch<React.SetStateAction<NoteItem[]>>,
  selectedIds: Set<number>,
  setSelectedIds: (ids: Set<number>) => void,
  loadNotes: () => Promise<void>,
  junkNotes: NoteItem[],
  duplicateIds: Set<number>,
) {
  const handleSingleDelete = useCallback(
    async (id: number) => {
      const ok = await confirmDestructive('Delete note?', 'This cannot be undone.');
      if (!ok) return;
      try {
        await deleteLectureNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        void loadNotes();
      } catch (e: unknown) {
        const lastErr = (e instanceof Error ? e.message : String(e)) ?? String(e);
        void showInfo('Could not delete note', `Error: ${lastErr}`);
      }
    },
    [loadNotes, setNotes],
  );

  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size;
    const ok = await confirmDestructive(
      `Delete ${count} note${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
    );
    if (!ok) return;
    let deleted = 0;
    let lastErr = '';
    for (const id of selectedIds) {
      try {
        await deleteLectureNote(id);
        deleted++;
      } catch (e: unknown) {
        lastErr = (e instanceof Error ? e.message : String(e)) ?? String(e);
      }
    }
    setSelectedIds(new Set());
    setNotes((prev) => prev.filter((n) => !selectedIds.has(n.id)));
    void loadNotes();
    if (deleted < selectedIds.size) {
      void showInfo(
        'Some notes could not be deleted',
        `Deleted ${deleted}/${selectedIds.size}.\n\nError: ${lastErr}`,
      );
    }
  }, [selectedIds, loadNotes, setNotes, setSelectedIds]);

  const handleDeleteJunk = useCallback(async () => {
    const count = junkNotes.length;
    const ok = await confirmDestructive(
      `Delete ${count} junk note${count !== 1 ? 's' : ''}?`,
      'Permanently deletes notes with fewer than 80 words.',
    );
    if (!ok) return;
    for (const n of junkNotes) {
      try {
        await deleteLectureNote(n.id);
      } catch {
        /* skip */
      }
    }
    void loadNotes();
  }, [junkNotes, loadNotes]);

  const handleDeleteDuplicates = useCallback(async () => {
    const count = duplicateIds.size;
    const ok = await confirmDestructive(
      `Delete ${count} duplicate${count !== 1 ? 's' : ''}?`,
      'Keeps the newest copy of each note.',
    );
    if (!ok) return;
    for (const id of duplicateIds) {
      try {
        await deleteLectureNote(id);
      } catch {
        /* skip */
      }
    }
    void loadNotes();
  }, [duplicateIds, loadNotes]);

  return {
    handleSingleDelete,
    handleBatchDelete,
    handleDeleteJunk,
    handleDeleteDuplicates,
  };
}
