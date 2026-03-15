import { exportDatabase } from './backupService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-doc/',
  cacheDirectory: 'file:///mock-cache/',
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64'
  }
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

describe('backupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportDatabase', () => {
    it('should show an error alert if the database file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await exportDatabase();

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///mock-doc/SQLite/neet_study.db');
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Database file not found.');
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    });

    it('should copy the database and share it if sharing is available', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      await exportDatabase();

      expect(FileSystem.getInfoAsync).toHaveBeenCalled();

      const copyArgs = (FileSystem.copyAsync as jest.Mock).mock.calls[0][0];
      expect(copyArgs.from).toBe('file:///mock-doc/SQLite/neet_study.db');
      expect(copyArgs.to).toContain('file:///mock-cache/neet_study_backup_');

      expect(Sharing.isAvailableAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        copyArgs.to,
        {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Export Backup'
        }
      );
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should show an error alert if sharing is not available', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      await exportDatabase();

      expect(FileSystem.copyAsync).toHaveBeenCalled();
      expect(Sharing.isAvailableAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Sharing is not available on this device');
    });

    it('should show an error alert if an exception is thrown', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('Test error'));

      // Prevent console.error output during test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Set __DEV__ global variable safely for test
      const oldDev = (global as any).__DEV__;
      (global as any).__DEV__ = true;

      await exportDatabase();

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to export backup.');

      consoleSpy.mockRestore();
      (global as any).__DEV__ = oldDev;
    });
  });
});