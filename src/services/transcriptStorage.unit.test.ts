import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Instead of mock module which relies on bun we'll use jest which the codebase relies on.

// We will skip running this file with Bun directly and just use jest mocks
jest.mock('expo-file-system/legacy', () => {
  return {
    documentDirectory: 'file:///data/user/0/com.app/files/',
    writeAsStringAsync: jest.fn(async () => {}),
    readAsStringAsync: jest.fn(async () => 'transcript content'),
    makeDirectoryAsync: jest.fn(async () => {}),
    getInfoAsync: jest.fn(async (uri) => {
      // Mock failure for the first read in "falls back to local current directory"
      if (typeof uri === 'string' && uri.includes('/old/install/path/')) {
        return { exists: false };
      }
      return { exists: true };
    }),
    copyAsync: jest.fn(async () => {}),
    StorageAccessFramework: {
      createFileAsync: jest.fn(async () => 'content://mock/uri/file.txt'),
      writeAsStringAsync: jest.fn(async () => {}),
    },
    EncodingType: { UTF8: 'utf8' },
  }
});

jest.mock('react-native', () => {
  return {
    Platform: { OS: 'android' },
  };
});

const profileMock = { backupDirectoryUri: 'content://mock/uri' };

jest.mock('../db/repositories', () => ({
  profileRepository: {
    getProfile: async () => profileMock,
  },
}));

import * as FileSystem from 'expo-file-system/legacy';
import { backupNoteToPublic, saveTranscriptToFile, loadTranscriptFromFile } from './transcriptStorage';

describe('transcriptStorage', () => {
  beforeEach(() => {
    // Reset mocks
    (FileSystem.writeAsStringAsync as jest.Mock).mockClear();
    (FileSystem.readAsStringAsync as jest.Mock).mockClear();
    (FileSystem.makeDirectoryAsync as jest.Mock).mockClear();
    (FileSystem.getInfoAsync as jest.Mock).mockClear();
    (FileSystem.copyAsync as jest.Mock).mockClear();
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockClear();
    (FileSystem.StorageAccessFramework.createFileAsync as any).mockResolvedValue('content://mock/uri/file.txt');
    (FileSystem.StorageAccessFramework.writeAsStringAsync as jest.Mock).mockClear();
  });

  describe('backupNoteToPublic', () => {
    it('should save to cloud (SAF) and local public dir on Android', async () => {
      await backupNoteToPublic(1, 'Anatomy', 'This is a note.');

      // Check SAF Cloud Backup
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^note_anatomy_1_\d+\.txt$/),
        'text/plain'
      );

      // Check write to Local
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);

      // First write to SAF
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
        'content://mock/uri/file.txt',
        'This is a note.',
        { encoding: 'utf8' }
      );

      // Second write to local public
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Notes\/note_anatomy_1_\d+\.txt$/),
        'This is a note.',
        { encoding: 'utf8' }
      );
    });
  });

  describe('saveTranscriptToFile', () => {
    it('should save transcript locally, to SAF cloud, and public local backup', async () => {
      const uri = await saveTranscriptToFile('lecture text');

      // Main app directory
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/transcript_\d+_[a-z0-9]+\.txt$/),
        'lecture text',
        { encoding: 'utf8' }
      );

      // Cloud SAF backup
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^transcript_\d+_[a-z0-9]+\.txt$/),
        'text/plain'
      );
      expect(FileSystem.writeAsStringAsync).not.toHaveBeenCalledWith(
        'content://mock/uri/file.txt',
        'lecture text',
        { encoding: 'utf8' }
      );
      expect(FileSystem.StorageAccessFramework.writeAsStringAsync).toHaveBeenCalledWith(
        'content://mock/uri/file.txt',
        'lecture text',
        { encoding: 'utf8' }
      );

      // Public local backup
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/transcript_\d+_[a-z0-9]+\.txt$/),
        to: expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Transcripts\/transcript_\d+_[a-z0-9]+\.txt$/),
      });

      expect(uri).toMatch(/^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/transcript_\d+_[a-z0-9]+\.txt$/);
    });

    it('returns the text directly if it is not a path', async () => {
       const res = await saveTranscriptToFile('file://my_test_path.txt');
       expect(res).toBe('file://my_test_path.txt');
    });
  });

  describe('loadTranscriptFromFile', () => {
    it('returns the text if it is not a file URI', async () => {
      const result = await loadTranscriptFromFile('just text');
      expect(result).toBe('just text');
    });

    it('loads from URI correctly', async () => {
      // Mock getInfoAsync to succeed
      (FileSystem.getInfoAsync as any).mockImplementationOnce(async () => ({ exists: true }));
      (FileSystem.readAsStringAsync as any).mockImplementationOnce(async () => 'transcript content');
      const result = await loadTranscriptFromFile('file:///data/user/0/com.app/files/transcripts/transcript_123.txt');
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );
      expect(result).toBe('transcript content');
    });

    it('falls back to local current directory if absolute path fails', async () => {
      // It will throw first because exists=false in the mock for this path
      // then the catch block will extract the file name and look in the current TRANSCRIPT_DIR
      // We need to make sure the second readAsStringAsync succeeds.
      (FileSystem.readAsStringAsync as jest.Mock).mockImplementationOnce(() => Promise.resolve('recovered content'));

      const result = await loadTranscriptFromFile('file:///old/install/path/transcripts/transcript_123.txt');

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        1,
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );

      expect(result).toBe('recovered content');
    });
  });
});
