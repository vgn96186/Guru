import {
  confirmDestructive,
  showDialog,
  showError,
  showInfo,
  showSuccess,
  showWarning,
} from '../../components/dialogService';
import { showToast } from '../../components/Toast';

export async function handleExportBackup({
  setBackupBusy,
  exportUnifiedBackup,
  updateUserProfile,
  refreshProfile,
}: {
  setBackupBusy: (busy: boolean) => void;
  exportUnifiedBackup: () => Promise<boolean>;
  updateUserProfile: (data: { lastBackupDate: string }) => void;
  refreshProfile: () => void;
}) {
  setBackupBusy(true);
  try {
    const success = await exportUnifiedBackup();
    if (success) {
      const now = new Date().toISOString();
      updateUserProfile({ lastBackupDate: now });
      refreshProfile();
    }
  } catch (e: unknown) {
    showError(e, 'Unknown error');
  } finally {
    setBackupBusy(false);
  }
}

export async function handleImportBackup({
  setBackupBusy,
  importUnifiedBackup,
  refreshProfile,
}: {
  setBackupBusy: (busy: boolean) => void;
  importUnifiedBackup: () => Promise<{ ok: boolean; message: string }>;
  refreshProfile: () => void;
}) {
  const ok = await confirmDestructive(
    'Restore from backup?',
    'This will overwrite your current data with data from the .guru backup file. You can selectively restore settings, progress, transcripts, and images.',
    { confirmLabel: 'Restore' },
  );
  if (!ok) return;

  setBackupBusy(true);
  try {
    const res = await importUnifiedBackup();
    if (res.ok) {
      showSuccess('Restored!', res.message);
      refreshProfile();
    } else {
      showError(res.message, 'Import failed');
    }
  } catch (e: unknown) {
    showError(e, 'Import failed');
  } finally {
    setBackupBusy(false);
  }
}

export async function handleRunAutoBackupNow({
  setBackupBusy,
  runAutoBackup,
  profileRepository,
  refreshProfile,
}: {
  setBackupBusy: (busy: boolean) => void;
  runAutoBackup: () => Promise<boolean>;
  profileRepository: any;
  refreshProfile: () => void;
}) {
  const result = await showDialog({
    title: 'Run Auto-Backup Now?',
    message: 'This will create an automatic backup regardless of your frequency setting.',
    variant: 'focus',
    actions: [
      { id: 'cancel', label: 'Cancel', variant: 'secondary' },
      { id: 'run-auto-backup', label: 'Run Backup', variant: 'primary' },
    ],
    allowDismiss: true,
  });

  if (result !== 'run-auto-backup') return;

  setBackupBusy(true);
  try {
    const success = await runAutoBackup();
    if (success) {
      const now = new Date().toISOString();
      await profileRepository.updateProfile({ lastAutoBackupAt: now });
      refreshProfile();
      showToast({
        title: 'Auto-backup complete',
        message: 'Automatic backup finished successfully.',
        variant: 'success',
      });
    } else {
      showToast({
        title: 'Failed',
        message: 'Auto-backup failed. Check logs for details.',
        variant: 'error',
      });
    }
  } catch (e: unknown) {
    showToast({
      title: 'Failed',
      message: e instanceof Error ? e.message : 'Unknown error',
      variant: 'error',
    });
  } finally {
    setBackupBusy(false);
  }
}

export async function handleCleanupOldBackups({
  setBackupBusy,
  cleanupOldBackups,
}: {
  setBackupBusy: (busy: boolean) => void;
  cleanupOldBackups: (count: number) => Promise<void>;
}) {
  setBackupBusy(true);
  try {
    await cleanupOldBackups(5);
    showToast({
      title: 'Cleanup complete',
      message: 'Old backups have been cleaned up.',
      variant: 'success',
    });
  } catch (e: unknown) {
    showToast({
      title: 'Cleanup failed',
      message: e instanceof Error ? e.message : 'Unknown error',
      variant: 'error',
    });
  } finally {
    setBackupBusy(false);
  }
}

export async function handleSyncGoogleDrive({
  setBackupBusy,
  runAutoBackup,
  refreshProfile,
}: {
  setBackupBusy: (busy: boolean) => void;
  runAutoBackup: () => Promise<boolean>;
  refreshProfile: () => void;
}) {
  setBackupBusy(true);
  try {
    const success = await runAutoBackup();
    if (success) {
      refreshProfile();
      showSuccess('Synced', 'Backup uploaded to Google Drive.');
    } else {
      showError('Could not create or upload backup.', 'Sync failed');
    }
  } catch (e: unknown) {
    showError(e, 'Sync failed');
  } finally {
    setBackupBusy(false);
  }
}

export async function handleDisconnectGoogleDrive({
  signOutGDrive,
  refreshProfile,
}: {
  signOutGDrive: () => Promise<void>;
  refreshProfile: () => void;
}) {
  const ok = await confirmDestructive(
    'Disconnect Google Drive?',
    'Auto-sync will stop. Your existing backups on Drive will remain.',
    { confirmLabel: 'Disconnect' },
  );
  if (!ok) return;
  try {
    await signOutGDrive();
    refreshProfile();
  } catch (e: unknown) {
    showError(e, 'Failed to disconnect');
  }
}
