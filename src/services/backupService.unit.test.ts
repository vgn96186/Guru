import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Alert } from 'react-native';
import { exportDatabase, importDatabase } from './backupService';

// Mock FileSystem
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  cacheDirectory: 'file:///mock-cache/',
  getInfoAsync: jest.fn(),
  copyAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

// Mock Sharing
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

// Mock DocumentPicker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

// Mock database singleton
jest.mock('../db/database', () => ({
  getDb: jest.fn(),
  resetDbSingleton: jest.fn(),
}));

// Mock global atob for header check
global.atob = jest.fn((base64) => Buffer.from(base64, 'base64').toString('binary'));

describe('backupService.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportDatabase', () => {
    it('alerts error if database file is not found', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
      const alertSpy = jest.spyOn(Alert, 'alert');

      await exportDatabase();

      expect(alertSpy).toHaveBeenCalledWith('Error', 'Database file not found.');
    });

    it('copies and shares database file if it exists', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);

      await exportDatabase();

      expect(FileSystem.copyAsync).toHaveBeenCalled();
      expect(Sharing.shareAsync).toHaveBeenCalled();
    });
  });

  describe('importDatabase', () => {
    it('returns early if picker is canceled', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true });

      await importDatabase();

      expect(FileSystem.copyAsync).not.toHaveBeenCalled();
    });

    it('alerts if selected file is not a valid SQLite database', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked.db' }],
      });
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      // Return invalid header
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('bm90IGEgc3FsaXRlIGZpbGU='); // "not a sqlite file" in b64

      const alertSpy = jest.spyOn(Alert, 'alert');

      await importDatabase();

      expect(alertSpy).toHaveBeenCalledWith(
        'Invalid backup',
        expect.stringContaining('not a valid SQLite database'),
      );
    });
  });
});
