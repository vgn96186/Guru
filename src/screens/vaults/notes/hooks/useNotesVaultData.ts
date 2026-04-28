import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getLectureHistory } from '../../../../db/queries/aiCache';
import type { NoteItem } from '../types';

export function useNotesVaultData(
  setNotes: (notes: NoteItem[]) => void,
  setDisplayCount: (count: number) => void,
  PAGE_SIZE: number,
) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getLectureHistory(500);
      // Only show entries with a processed AI note
      const withNotes = all.filter((n) => n.note?.trim() && n.note.length > 20);
      setNotes(withNotes);
      setDisplayCount(PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, [setDisplayCount, setNotes, PAGE_SIZE]);

  useFocusEffect(
    useCallback(() => {
      void loadNotes();
    }, [loadNotes]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotes();
    setRefreshing(false);
  }, [loadNotes]);

  return { loading, refreshing, loadNotes, handleRefresh };
}
