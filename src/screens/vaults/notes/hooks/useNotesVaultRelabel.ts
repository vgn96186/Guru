import { useState, useCallback } from 'react';
import { aiRelabelNote } from '../../../../services/ai/aiActions';
import { updateLectureAnalysisMetadata } from '../../../../db/queries/aiCache';
import { getSubjectByName } from '../../../../db/queries/subjects';
import { showSuccess } from '../../../../components/Toast';
import { confirm } from '../../../../utils/confirm';
import type { NoteItem } from '../types';

export function useNotesVaultRelabel(loadNotes: () => Promise<void>) {
  const [relabelProgress, setRelabelProgress] = useState<string | null>(null);

  const runRelabel = useCallback(
    async (targets: NoteItem[]) => {
      let fixed = 0;
      let failed = 0;
      for (let i = 0; i < targets.length; i++) {
        const n = targets[i];
        setRelabelProgress(`${i + 1}/${targets.length}`);
        try {
          const label = await aiRelabelNote(n.note ?? '');
          if (!label) {
            failed++;
            continue;
          }

          let subjectId: number | null = null;
          if (label.subject) {
            const subj = await getSubjectByName(label.subject);
            if (subj) subjectId = subj.id;
          }

          await updateLectureAnalysisMetadata(n.id, {
            subjectId,
            summary: label.title || null,
            topics: label.topics?.length ? label.topics : undefined,
          });
          fixed++;
        } catch {
          failed++;
        }
      }
      setRelabelProgress(null);
      void loadNotes();
      void showSuccess(
        'Done',
        `Labeled ${fixed} note${fixed !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}.`,
      );
    },
    [loadNotes],
  );

  const handleRelabel = useCallback(
    async (unlabeledNotes: NoteItem[]) => {
      const count = unlabeledNotes.length;
      const ok = await confirm(
        `AI-label ${count} note${count !== 1 ? 's' : ''}?`,
        '1 quick API call per note.',
      );
      if (!ok) return;
      void runRelabel(unlabeledNotes);
    },
    [runRelabel],
  );

  const handleFixBadTitles = useCallback(
    async (badTitleNotes: NoteItem[]) => {
      const count = badTitleNotes.length;
      const ok = await confirm(
        `Re-label ${count} note${count !== 1 ? 's' : ''}?`,
        'Fixes titles like "This note covers..." with proper noun-phrase headings. 1 API call per note.',
      );
      if (!ok) return;
      void runRelabel(badTitleNotes);
    },
    [runRelabel],
  );

  return { relabelProgress, runRelabel, handleRelabel, handleFixBadTitles };
}
