import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import StorageSections from './StorageSections';
import { showDialog } from '../../../components/dialogService';
import { showToast } from '../../../components/Toast';

jest.mock('../../../components/dialogService', () => ({
  showDialog: jest.fn(),
}));

jest.mock('../../../components/Toast', () => ({
  showToast: jest.fn(),
}));

const baseProps = {
  styles: {
    categoryLabel: {},
    dangerBtn: {},
    dangerBtnText: {},
    hint: {},
    backupDate: {},
    backupRow: {},
    backupBtn: {},
    saveBtnDisabled: {},
    backupBtnText: {},
    subSectionDivider: {},
    subSectionLabel: {},
    frequencyRow: {},
    frequencyChip: {},
    frequencyChipActive: {},
    frequencyChipText: {},
    frequencyChipTextActive: {},
    maintenanceBtn: {},
    maintenanceBtnText: {},
  },
  SectionToggle: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <>
      <>{title}</>
      {children}
    </>
  ),
  profile: null,
  backupBusy: false,
  setBackupBusy: jest.fn(),
  refreshProfile: jest.fn(),
  clearAiCache: jest.fn(),
  resetStudyProgress: jest.fn(),
  exportUnifiedBackup: jest.fn(),
  importUnifiedBackup: jest.fn(),
  updateUserProfile: jest.fn(),
  autoBackupFrequency: 'off',
  setAutoBackupFrequency: jest.fn(),
  runAutoBackup: jest.fn(),
  cleanupOldBackups: jest.fn(),
  profileRepository: { updateProfile: jest.fn() },
  gdriveWebClientId: '',
  setGdriveWebClientId: jest.fn(),
  GOOGLE_WEB_CLIENT_ID: '',
  signInToGDrive: jest.fn(),
  signOutGDrive: jest.fn(),
  maintenanceBusy: false,
  runMaintenanceTask: jest.fn(),
  getUserProfile: jest.fn(),
};

describe('StorageSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses themed dialog for clear cache confirmation and toast for success', async () => {
    (showDialog as jest.Mock).mockResolvedValue('clear-ai-cache');
    const props = { ...baseProps, clearAiCache: jest.fn() };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Clear AI Content Cache'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Clear AI Cache?',
        }),
      );
    });

    await waitFor(() => {
      expect(props.clearAiCache).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Done',
          message: 'AI cache cleared.',
          variant: 'success',
        }),
      );
    });
  });

  it('does not clear the cache when the dialog is dismissed', async () => {
    (showDialog as jest.Mock).mockResolvedValue('dismissed');
    const props = { ...baseProps, clearAiCache: jest.fn() };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Clear AI Content Cache'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalled();
    });

    expect(props.clearAiCache).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('uses themed dialog for reset progress confirmation and toast for success', async () => {
    (showDialog as jest.Mock).mockResolvedValue('reset-progress');
    const props = {
      ...baseProps,
      resetStudyProgress: jest.fn(),
      refreshProfile: jest.fn(),
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Reset All Progress'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reset all progress?',
        }),
      );
    });

    await waitFor(() => {
      expect(props.resetStudyProgress).toHaveBeenCalled();
      expect(props.refreshProfile).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Reset',
          message: 'Progress has been wiped. Start fresh!',
          variant: 'success',
        }),
      );
    });
  });

  it('does not reset progress when the reset dialog is dismissed', async () => {
    (showDialog as jest.Mock).mockResolvedValue('dismissed');
    const props = {
      ...baseProps,
      resetStudyProgress: jest.fn(),
      refreshProfile: jest.fn(),
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Reset All Progress'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalled();
    });

    expect(props.resetStudyProgress).not.toHaveBeenCalled();
    expect(props.refreshProfile).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reset',
      }),
    );
  });

  it('uses themed dialog for auto-backup confirmation and toast for success', async () => {
    (showDialog as jest.Mock).mockResolvedValue('run-auto-backup');
    const props = {
      ...baseProps,
      runAutoBackup: jest.fn().mockResolvedValue(true),
      setBackupBusy: jest.fn(),
      refreshProfile: jest.fn(),
      profileRepository: { updateProfile: jest.fn().mockResolvedValue(undefined) },
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Run Auto-Backup Now'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Run Auto-Backup Now?',
        }),
      );
    });

    await waitFor(() => {
      expect(props.runAutoBackup).toHaveBeenCalled();
      expect(props.profileRepository.updateProfile).toHaveBeenCalled();
      expect(props.refreshProfile).toHaveBeenCalled();
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Auto-backup complete',
          variant: 'success',
        }),
      );
    });
  });

  it('does not run auto-backup when the dialog is dismissed', async () => {
    (showDialog as jest.Mock).mockResolvedValue('dismissed');
    const props = {
      ...baseProps,
      runAutoBackup: jest.fn(),
      setBackupBusy: jest.fn(),
      refreshProfile: jest.fn(),
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Run Auto-Backup Now'));

    await waitFor(() => {
      expect(showDialog).toHaveBeenCalled();
    });

    expect(props.runAutoBackup).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Auto-backup complete',
      }),
    );
  });

  it('uses themed toast for cleanup success', async () => {
    const props = {
      ...baseProps,
      cleanupOldBackups: jest.fn().mockResolvedValue(undefined),
      setBackupBusy: jest.fn(),
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Clean Up Old Backups'));

    await waitFor(() => {
      expect(props.cleanupOldBackups).toHaveBeenCalledWith(5);
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cleanup complete',
          message: 'Old backups have been cleaned up.',
          variant: 'success',
        }),
      );
    });
  });

  it('uses themed toast for cleanup failure', async () => {
    const props = {
      ...baseProps,
      cleanupOldBackups: jest.fn().mockRejectedValue(new Error('Disk busy')),
      setBackupBusy: jest.fn(),
    };
    const { getByText } = render(<StorageSections {...props} />);

    fireEvent.press(getByText('Clean Up Old Backups'));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Cleanup failed',
          message: 'Disk busy',
          variant: 'error',
        }),
      );
    });
  });
});
