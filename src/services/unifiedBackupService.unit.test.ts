import * as FileSystem from 'expo-file-system/legacy';
import {
  exportUnifiedBackup,
  validateBackupFile,
  getBackupInfo,
  getAvailableBackups,
  deleteBackup,
  cleanupOldBackups,
  shouldRunAutoBackup,
  BACKUP_VERSION,
  type BackupManifest,
} from './unifiedBackupService';

// Mock dependencies
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  cacheDirectory: '/mock/cache/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
}));

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn().mockResolvedValue('/mock/cache/backup.guru'),
  unzip: jest.fn().mockResolvedValue('/mock/cache/extracted/'),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('../../modules/app-launcher', () => ({
  copyFileToPublicBackup: jest.fn().mockResolvedValue(true),
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
  resetDbSingleton: jest.fn(),
  walCheckpoint: jest.fn().mockResolvedValue(undefined),
  closeDbGracefully: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn().mockResolvedValue({}),
    updateProfile: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('./backupShare', () => ({
  shareBackupFileOrAlert: jest.fn().mockResolvedValue(true),
}));

jest.mock('./fileUri', () => ({
  stripFileUri: jest.fn((path: string) => path.replace('file://', '')),
}));

// Mock expo-updates
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(),
}));

describe('unifiedBackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exportUnifiedBackup', () => {
    it('should export a backup successfully', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockReadDir = FileSystem.readDirectoryAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;
      const mockCopy = FileSystem.copyAsync as jest.Mock;
      const mockWrite = FileSystem.writeAsStringAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;

      mockGetInfo.mockImplementation((path: string) => {
        if (path.includes('neet_study.db')) return Promise.resolve({ exists: true, size: 1024 });
        return Promise.resolve({ exists: false, size: 0 });
      });
      mockReadDir.mockResolvedValue([]);
      mockMakeDir.mockResolvedValue(undefined);
      mockCopy.mockResolvedValue(undefined);
      mockWrite.mockResolvedValue(undefined);
      mockDelete.mockResolvedValue(undefined);

      const { zip } = require('react-native-zip-archive');
      const { isAvailableAsync, shareAsync } = require('expo-sharing');

      isAvailableAsync.mockResolvedValue(true);
      shareAsync.mockResolvedValue(undefined);

      // Mock the database
      const mockDb = {
        getAllAsync: jest.fn().mockResolvedValue([{ name: 'user_profile' }, { name: 'topics' }]),
        getFirstAsync: jest.fn().mockResolvedValue({ count: 100 }),
      };
      const { getDb } = require('../db/database');
      getDb.mockReturnValue(mockDb);

      const result = await exportUnifiedBackup();

      expect(result).toBe(true);
      expect(mockMakeDir).toHaveBeenCalled();
      expect(mockCopy).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalled();
      expect(zip).toHaveBeenCalled();
      expect(shareAsync).toHaveBeenCalled();
    });

    it('should handle export failure gracefully', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      mockGetInfo.mockResolvedValue({ exists: false });

      const result = await exportUnifiedBackup();

      expect(result).toBe(false);
    });
  });

  describe('validateBackupFile', () => {
    it('should validate a backup file successfully', async () => {
      const mockRead = FileSystem.readAsStringAsync as jest.Mock;
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      const validManifest: BackupManifest = {
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        deviceId: 'test_device',
        deviceName: 'Test Device',
        appVersion: '1.0.0',
        backupType: 'full',
        includedAssets: {
          database: true,
          transcripts: true,
          images: true,
          recordings: false,
        },
        databaseInfo: {
          tables: ['user_profile', 'topics'],
          rowCount: 100,
        },
        assetCounts: {
          transcripts: 5,
          images: 10,
          recordings: 0,
        },
      };

      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: true });
      mockRead.mockResolvedValue(JSON.stringify(validManifest));
      mockDelete.mockResolvedValue(undefined);

      // Mock unzip
      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      // Mock hasSQLiteHeader (private function, test via validateBackupFile)
      (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(
        (_path: string, options?: { encoding?: string }) => {
          if (options?.encoding === 'base64') {
            return Promise.resolve('U1FMaXRlIGZvcm1hdCAz'); // base64 of "SQLite format 3"
          }
          return Promise.resolve(JSON.stringify(validManifest));
        },
      );

      const result = await validateBackupFile('/mock/cache/backup.guru');

      expect(result.valid).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.version).toBe(BACKUP_VERSION);
    });

    it('should reject an invalid backup file', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: false });
      mockDelete.mockResolvedValue(undefined);

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      const result = await validateBackupFile('/mock/cache/invalid.guru');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Backup manifest not found.');
    });

    it('should reject a backup with a newer version', async () => {
      const mockRead = FileSystem.readAsStringAsync as jest.Mock;
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      const futureManifest = {
        version: BACKUP_VERSION + 10,
        exportedAt: new Date().toISOString(),
        deviceId: 'future_device',
      };

      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: true });
      mockRead.mockResolvedValue(JSON.stringify(futureManifest));
      mockDelete.mockResolvedValue(undefined);

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      const result = await validateBackupFile('/mock/cache/future.guru');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Backup was created with a newer version of the app.');
    });
  });

  describe('getBackupInfo', () => {
    it('should return backup info for a valid file', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockRead = FileSystem.readAsStringAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      const manifest: BackupManifest = {
        version: BACKUP_VERSION,
        exportedAt: '2024-01-15T10:30:00.000Z',
        deviceId: 'test_device',
        deviceName: 'Test Device',
        appVersion: '1.0.0',
        backupType: 'full',
        includedAssets: {
          database: false,
          transcripts: true,
          images: true,
          recordings: false,
        },
        databaseInfo: {
          tables: ['user_profile'],
          rowCount: 10,
        },
        assetCounts: {
          transcripts: 2,
          images: 5,
          recordings: 0,
        },
      };

      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: true, size: 50000 });
      mockRead.mockResolvedValue(JSON.stringify(manifest));
      mockDelete.mockResolvedValue(undefined);

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      const result = await getBackupInfo('/mock/cache/backup.guru');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('backup.guru');
      expect(result?.size).toBe(50000);
      expect(result?.manifest.deviceName).toBe('Test Device');
    });

    it('should return null for an invalid file', async () => {
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: false });
      mockDelete.mockResolvedValue(undefined);

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      const result = await getBackupInfo('/mock/cache/invalid.guru');

      expect(result).toBeNull();
    });
  });

  describe('getAvailableBackups', () => {
    it('should return a list of available backups', async () => {
      const mockReadDir = FileSystem.readDirectoryAsync as jest.Mock;
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockRead = FileSystem.readAsStringAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      mockReadDir.mockResolvedValue(['backup1.guru', 'backup2.guru', 'other.txt']);
      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: true, size: 50000 });
      mockDelete.mockResolvedValue(undefined);

      const manifest: BackupManifest = {
        version: BACKUP_VERSION,
        exportedAt: '2024-01-15T10:30:00.000Z',
        deviceId: 'test_device',
        deviceName: 'Test Device',
        appVersion: '1.0.0',
        backupType: 'full',
        includedAssets: {
          database: false,
          transcripts: true,
          images: true,
          recordings: false,
        },
        databaseInfo: {
          tables: ['user_profile'],
          rowCount: 10,
        },
        assetCounts: {
          transcripts: 2,
          images: 5,
          recordings: 0,
        },
      };

      mockRead.mockResolvedValue(JSON.stringify(manifest));

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      const backups = await getAvailableBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].name).toContain('.guru');
    });

    it('should return empty array when no backups exist', async () => {
      const mockReadDir = FileSystem.readDirectoryAsync as jest.Mock;

      mockReadDir.mockResolvedValue(['other.txt', 'image.png']);

      const backups = await getAvailableBackups();

      expect(backups).toHaveLength(0);
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup file', async () => {
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      mockDelete.mockResolvedValue(undefined);

      const result = await deleteBackup('/mock/cache/backup.guru');

      expect(result).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('/mock/cache/backup.guru', { idempotent: true });
    });

    it('should return false on delete failure', async () => {
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      const result = await deleteBackup('/mock/cache/backup.guru');

      expect(result).toBe(false);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should delete old backups beyond keepCount', async () => {
      const mockReadDir = FileSystem.readDirectoryAsync as jest.Mock;
      const mockGetInfo = FileSystem.getInfoAsync as jest.Mock;
      const mockRead = FileSystem.readAsStringAsync as jest.Mock;
      const mockDelete = FileSystem.deleteAsync as jest.Mock;
      const mockMakeDir = FileSystem.makeDirectoryAsync as jest.Mock;

      // Return 10 backup files
      mockReadDir.mockResolvedValue([
        'backup1.guru',
        'backup2.guru',
        'backup3.guru',
        'backup4.guru',
        'backup5.guru',
        'backup6.guru',
        'backup7.guru',
        'backup8.guru',
        'backup9.guru',
        'backup10.guru',
      ]);
      mockMakeDir.mockResolvedValue(undefined);
      mockGetInfo.mockResolvedValue({ exists: true, size: 50000 });
      mockDelete.mockResolvedValue(undefined);

      const manifest: BackupManifest = {
        version: BACKUP_VERSION,
        exportedAt: '2024-01-15T10:30:00.000Z',
        deviceId: 'test_device',
        deviceName: 'Test Device',
        appVersion: '1.0.0',
        backupType: 'full',
        includedAssets: {
          database: false,
          transcripts: true,
          images: true,
          recordings: false,
        },
        databaseInfo: {
          tables: ['user_profile'],
          rowCount: 10,
        },
        assetCounts: {
          transcripts: 2,
          images: 5,
          recordings: 0,
        },
      };

      mockRead.mockResolvedValue(JSON.stringify(manifest));

      const { unzip } = require('react-native-zip-archive');
      unzip.mockResolvedValue('/mock/cache/extracted/');

      mockDelete.mockClear();
      await cleanupOldBackups(5);

      // 10 validations (with cleanup) + 5 actual deletions
      expect(mockDelete).toHaveBeenCalledTimes(15);
    });
  });

  describe('shouldRunAutoBackup', () => {
    it('should return true when auto-backup is due', async () => {
      const { profileRepository } = require('../db/repositories');
      profileRepository.getProfile.mockResolvedValue({
        autoBackupFrequency: 'daily',
        lastAutoBackupAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const result = await shouldRunAutoBackup();

      expect(result).toBe(true);
    });

    it('should return false when auto-backup is off', async () => {
      const { profileRepository } = require('../db/repositories');
      profileRepository.getProfile.mockResolvedValue({
        autoBackupFrequency: 'off',
      });

      const result = await shouldRunAutoBackup();

      expect(result).toBe(false);
    });

    it('should return true when no previous auto-backup exists', async () => {
      const { profileRepository } = require('../db/repositories');
      profileRepository.getProfile.mockResolvedValue({
        autoBackupFrequency: 'daily',
        lastAutoBackupAt: null,
      });

      const result = await shouldRunAutoBackup();

      expect(result).toBe(true);
    });
  });
});
