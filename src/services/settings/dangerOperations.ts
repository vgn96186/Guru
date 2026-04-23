import { showDialog } from '../../components/dialogService';
import { showToast } from '../../components/Toast';

export async function handleClearAiCache(clearAiCache: () => void) {
  const result = await showDialog({
    title: 'Clear AI Cache?',
    message: 'All cached content cards will be regenerated fresh on next use.',
    variant: 'warning',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'secondary' },
      {
        id: 'clear-ai-cache',
        label: 'Clear',
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    allowDismiss: true,
  });

  if (result !== 'clear-ai-cache') return;

  clearAiCache();
  showToast({
    title: 'Done',
    message: 'AI cache cleared.',
    variant: 'success',
  });
}

export async function handleResetProgress(
  resetStudyProgress: () => void,
  refreshProfile: () => void,
) {
  const result = await showDialog({
    title: 'Reset all progress?',
    message:
      'This clears all topic progress, XP, streaks, and daily logs. This cannot be undone. Export a backup first.',
    variant: 'destructive',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'secondary' },
      {
        id: 'reset-progress',
        label: 'Reset',
        variant: 'destructive',
        isDestructive: true,
      },
    ],
    allowDismiss: true,
  });

  if (result !== 'reset-progress') return;

  resetStudyProgress();
  refreshProfile();
  showToast({
    title: 'Reset',
    message: 'Progress has been wiped. Start fresh!',
    variant: 'success',
  });
}
