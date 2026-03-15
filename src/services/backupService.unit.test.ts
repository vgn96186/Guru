import { exportDatabase, importDatabase } from './backupService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { getDb } from '../db/database';

// Mock expo-updates using virtual mock since it's conditionally required
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn().mockResolvedValue(undefined),
}), { virtual: true });

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
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

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
}));

describe('backupService', () => {
  let mockDb: any;
  const originalDev = __DEV__;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      closeSync: jest.fn(),
      getFirstAsync: jest.fn(),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);

    // Suppress console.error and console.warn during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Set __DEV__ to false to avoid console logs if we miss a mock
    (global as any).__DEV__ = false;
  });

  afterAll(() => {
    (global as any).__DEV__ = originalDev;
  });

  describe('exportDatabase', () => {
    it('should show an error alert if the database file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await exportDatabase();

      expect(FileSystem.getInfoAsync).toHaveBeenCalledWith('file:///mock-docs/SQLite/neet_study.db');
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Database file not found.');
      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    });

    it('should copy database and show error if sharing is not available', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      await exportDatabase();

      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'file:///mock-docs/SQLite/neet_study.db',
        to: expect.stringContaining('file:///mock-cache/neet_study_backup_')
      });
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Sharing is not available on this device');
    });

    it('should export and share backup when sharing is available', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      await exportDatabase();

      expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);

      const toPath = (FileSystem.copyAsync as jest.Mock).mock.calls[0][0].to;
      expect(Sharing.shareAsync).toHaveBeenCalledWith(toPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Export Backup'
      });
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should handle exceptions gracefully', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('Test error'));

      await exportDatabase();

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to export backup.');
    });
  });

  describe('importDatabase', () => {
    it('should return early if document picker is canceled', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });

      await importDatabase();

      expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled();
      expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    });

    it('should alert invalid backup if file is not valid SQLite', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picked-file.db' }]
      });
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      // Mock hasSQLiteHeader to return false (invalid base64 or wrong header)
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(btoa('Invalid Header!1234'));

      await importDatabase();

      expect(FileSystem.readAsStringAsync).toHaveBeenCalled();
      expect(FileSystem.deleteAsync).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith('Invalid backup', 'Selected file is not a valid SQLite database backup.');
    });

    it('should replace database and rollback if validation fails', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picked-file.db' }]
      });

      // Directory exists, DB exists, Rollback exists (for cleanup)
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
        return { exists: true };
      });

      // Mock valid SQLite header
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(btoa('SQLite format 3\x00'));

      // Mock database connection closing
      mockDb.closeSync.mockReturnValue(undefined);

      // Mock validation failure
      mockDb.getFirstAsync.mockRejectedValue(new Error('Corrupt DB'));

      await importDatabase();

      // Should have copied DB to rollback path
      expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
        from: 'file:///mock-docs/SQLite/neet_study.db',
        to: expect.stringContaining('.rollback_')
      }));

      // Should have attempted to replace DB
      expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
        from: expect.stringContaining('neet_study_import_tmp_'),
        to: 'file:///mock-docs/SQLite/neet_study.db'
      }));

      // Validation failed, should have restored rollback
      expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
        from: expect.stringContaining('.rollback_'),
        to: 'file:///mock-docs/SQLite/neet_study.db'
      }));

      // Should have cleaned up rollback
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('.rollback_'), { idempotent: true });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Invalid Backup',
        'The backup file failed schema validation. Your original data has been restored.'
      );
    });

    it('should restore old DB if replacement fails during copy', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picked-file.db' }]
      });

      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
        return { exists: true };
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(btoa('SQLite format 3\x00'));

      // Make the DB replacement copy fail
      (FileSystem.copyAsync as jest.Mock).mockImplementation(async ({ from, to }) => {
        if (from.includes('neet_study_import_tmp_') && to.includes('neet_study.db')) {
          throw new Error('Copy failed');
        }
        return undefined;
      });

      await importDatabase();

      // The catch block re-throws or falls to the outer catch
      // The outer catch block alerts 'Error', 'Failed to import backup.'
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to import backup.');

      // Ensure it tried to restore from rollback
      expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
        from: expect.stringContaining('.rollback_'),
        to: 'file:///mock-docs/SQLite/neet_study.db'
      }));
    });

    it('should successfully restore backup, validate it, clean up, and request restart', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picked-file.db' }]
      });

      // First call DB_DIR (exists), second DB_PATH (exists)
      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
        return { exists: true };
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(btoa('SQLite format 3\x00'));

      // Mock DB validation success
      mockDb.getFirstAsync.mockResolvedValue({ 'COUNT(*)': 10 });

      await importDatabase();

      // Check validation ran
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith('SELECT COUNT(*) FROM subjects');

      // Check rollback cleanup
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(expect.stringContaining('.rollback_'), { idempotent: true });

      // Check success alert
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        'Backup restored successfully! The app will now restart.',
        expect.any(Array)
      );

      // Extract the onPress callback from the alert buttons to trigger it
      const alertCalls = (Alert.alert as jest.Mock).mock.calls;
      const successCall = alertCalls.find(call => call[0] === 'Success');
      const buttons = successCall[2];
      const restartButton = buttons.find((b: any) => b.text === 'Restart');

      // Trigger the restart
      restartButton.onPress();

      // Note: expo-updates is mocked to successfully resolve
      // Let's verify Updates.reloadAsync is called if available, or Alert fallback
      // Since we mocked reloadAsync dynamically, we can't easily check it unless we import the mock
      const updatesMock = require('expo-updates');
      expect(updatesMock.reloadAsync).toHaveBeenCalled();
    });

    it('should create SQLite directory if it does not exist', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picked-file.db' }]
      });

      (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('SQLite') && !path.includes('neet_study.db')) return { exists: false };
        return { exists: true };
      });

      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(btoa('SQLite format 3\x00'));
      mockDb.getFirstAsync.mockResolvedValue({ 'COUNT(*)': 10 });

      await importDatabase();

      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///mock-docs/SQLite', { intermediates: true });
    });
  });
});
