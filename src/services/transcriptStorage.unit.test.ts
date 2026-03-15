import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Instead of mock module which relies on bun we'll use jest which the codebase relies on.

// We will skip running this file with Bun directly and just use jest mocks
jest.mock('expo-file-system/legacy', () => {
  return {
    documentDirectory: 'file:///data/user/0/com.app/files/',
    writeAsStringAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    readAsStringAsync: jest.fn<() => Promise<string>>().mockResolvedValue('transcript content'),
    makeDirectoryAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getInfoAsync: jest.fn<() => Promise<{ exists: boolean }>>().mockResolvedValue({ exists: true }),
    copyAsync: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    StorageAccessFramework: {
      createFileAsync: jest.fn<() => Promise<string>>().mockResolvedValue('content://mock/uri/file.txt'),
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

      // Check write to both SAF and Local
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2);

      // First write to local public
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Notes\/note_anatomy_1_\d+\.txt$/),
        'This is a note.',
        { encoding: 'utf8' }
      );

      // Second write to SAF
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'content://mock/uri/file.txt',
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

      // Public local backup
      expect(FileSystem.copyAsync).toHaveBeenCalledWith({
        from: expect.stringMatching(/^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/transcript_\d+_[a-z0-9]+\.txt$/),
        to: expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Transcripts\/transcript_\d+_[a-z0-9]+\.txt$/),
      });

      // Cloud SAF backup
      expect(FileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^transcript_\d+_[a-z0-9]+\.txt$/),
        'text/plain'
      );
      expect(FileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'content://mock/uri/file.txt',
        'lecture text',
        { encoding: 'utf8' }
      );

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
      const result = await loadTranscriptFromFile('file:///data/user/0/com.app/files/transcripts/transcript_123.txt');
      expect(FileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );
      expect(result).toBe('transcript content');
    });

    it('falls back to local current directory if absolute path fails', async () => {
      // Mock failure for the first read
      (FileSystem.readAsStringAsync as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('File not found')))
                                           .mockImplementationOnce(() => Promise.resolve('recovered content'));

      const result = await loadTranscriptFromFile('file:///old/install/path/transcripts/transcript_123.txt');

      expect(FileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        1,
        'file:///old/install/path/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );
      expect(FileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );

      expect(result).toBe('recovered content');
    });
  });
});
