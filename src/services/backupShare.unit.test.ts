import * as Sharing from 'expo-sharing';
import { showToast } from '../components/Toast';
import { shareBackupFileOrAlert } from './backupShare';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

describe('backupShare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shares the file when sharing is available', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

    const result = await shareBackupFileOrAlert('/tmp/backup.json', {
      mimeType: 'application/json',
      dialogTitle: 'Save Guru Backup',
    });

    expect(result).toBe(true);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/backup.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it('shows a themed toast with the file path when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    const result = await shareBackupFileOrAlert('/tmp/backup.json', {
      mimeType: 'application/json',
      dialogTitle: 'Save Guru Backup',
    });

    expect(result).toBe(true);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Backup saved',
        message: expect.stringContaining('/tmp/backup.json'),
        variant: 'success',
      }),
    );
  });

  it('uses the custom unavailable message when provided', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

    await shareBackupFileOrAlert('/tmp/backup.db', {
      mimeType: 'application/octet-stream',
      dialogTitle: 'Export Backup',
      unavailableAlert: {
        title: 'Error',
        message: 'Sharing is not available on this device',
      },
    });

    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        message: 'Sharing is not available on this device',
        variant: 'error',
      }),
    );
  });
});
