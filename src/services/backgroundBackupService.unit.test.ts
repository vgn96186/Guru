import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { profileRepository } from '../db/repositories';
import { copyFileToPublicBackup } from '../../modules/app-launcher';
import { runAutoPublicBackup } from './backgroundBackupService';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test/',
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  EncodingType: {
    Base64: 'base64',
  },
  StorageAccessFramework: {
    createFileAsync: jest.fn(),
  },
}));

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('../../modules/app-launcher', () => ({
  copyFileToPublicBackup: jest.fn(),
}));

describe('backgroundBackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      backupDirectoryUri: null,
    });
    (copyFileToPublicBackup as jest.Mock).mockResolvedValue(true);
    Platform.OS = 'ios';
  });

  it('runs successfully on iOS (only secondary backup)', async () => {
    Platform.OS = 'ios';
    await runAutoPublicBackup();

    expect(copyFileToPublicBackup).toHaveBeenCalledWith(
      '/test/SQLite/neet_study.db',
      'guru_latest.db',
    );
    expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
  });

  it('runs SAF backup on Android if backupDirectoryUri is present', async () => {
    Platform.OS = 'android';
    const mockUri = 'content://test/backup';
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      backupDirectoryUri: mockUri,
    });
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockResolvedValue(
      'content://test/new-file',
    );
    (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('base64data');

    await runAutoPublicBackup();

    expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
      mockUri,
      expect.stringContaining('guru_auto_db_'),
      'application/octet-stream',
    );
    expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///test/SQLite/neet_study.db', {
      encoding: 'base64',
    });
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'content://test/new-file',
      'base64data',
      { encoding: 'base64' },
    );
    expect(copyFileToPublicBackup).toHaveBeenCalled();
  });

  it('skips SAF backup if backupDirectoryUri is missing on Android', async () => {
    Platform.OS = 'android';
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      backupDirectoryUri: null,
    });

    await runAutoPublicBackup();

    expect(FileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();
    expect(copyFileToPublicBackup).toHaveBeenCalled();
  });

  it('continues to secondary backup if SAF backup fails', async () => {
    Platform.OS = 'android';
    (profileRepository.getProfile as jest.Mock).mockResolvedValue({
      backupDirectoryUri: 'content://test/backup',
    });
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockRejectedValue(
      new Error('SAF failed'),
    );

    await runAutoPublicBackup();

    expect(copyFileToPublicBackup).toHaveBeenCalled();
  });

  it('handles errors gracefully in runAutoPublicBackup', async () => {
    (profileRepository.getProfile as jest.Mock).mockRejectedValue(new Error('DB failed'));

    // Should not throw
    await expect(runAutoPublicBackup()).resolves.not.toThrow();
  });
});
