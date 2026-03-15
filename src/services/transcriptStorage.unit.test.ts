import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Instead of mock module which relies on bun we'll use jest which the codebase relies on.

jest.mock('expo-file-system/legacy', () => {
  return {
    __esModule: true,
    documentDirectory: 'file:///data/user/0/com.app/files/',
    writeAsStringAsync: jest.fn(),
    readAsStringAsync: jest.fn(),
    makeDirectoryAsync: jest.fn(),
    getInfoAsync: jest.fn(),
    copyAsync: jest.fn(),
    StorageAccessFramework: {
      createFileAsync: jest.fn(),
    },
    EncodingType: { UTF8: 'utf8' },
  };
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

import * as FileSystemLegacy from 'expo-file-system/legacy';
import { backupNoteToPublic, saveTranscriptToFile, loadTranscriptFromFile } from './transcriptStorage';

describe('transcriptStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    (FileSystemLegacy.writeAsStringAsync as any).mockResolvedValue(undefined);
    (FileSystemLegacy.readAsStringAsync as any).mockResolvedValue('transcript content');
    (FileSystemLegacy.makeDirectoryAsync as any).mockResolvedValue(undefined);
    (FileSystemLegacy.getInfoAsync as any).mockResolvedValue({ exists: true });
    (FileSystemLegacy.copyAsync as any).mockResolvedValue(undefined);
    (FileSystemLegacy.StorageAccessFramework.createFileAsync as any).mockResolvedValue('content://mock/uri/file.txt');
  });

  describe('backupNoteToPublic', () => {
    it('should save to cloud (SAF) and local public dir on Android', async () => {
      await backupNoteToPublic(1, 'Anatomy', 'This is a note.');

      // Check SAF Cloud Backup
      expect(FileSystemLegacy.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^note_anatomy_1_\d+\.txt$/),
        'text/plain'
      );

      // Check write to both SAF and Local
      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(2);

      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledWith(
        'content://mock/uri/file.txt',
        'This is a note.',
        { encoding: 'utf8' }
      );

      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Notes\/note_anatomy_1_\d+\.txt$/),
        'This is a note.',
        { encoding: 'utf8' }
      );
    });

    it('should save to public directory even if cloud backup is disabled', async () => {
      // Temporarily clear profile mock
      (profileMock as any).backupDirectoryUri = null;

      await backupNoteToPublic(2, 'Physiology', 'Another note.');

      // Should not call SAF
      expect(FileSystemLegacy.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();

      // But should still write to local public
      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringMatching(/^file:\/\/\/sdcard\/Documents\/Guru\/Notes\/note_physiology_2_\d+\.txt$/),
        'Another note.',
        { encoding: 'utf8' }
      );

      // Restore profile mock
      (profileMock as any).backupDirectoryUri = 'content://mock/uri';
    });

    it('should handle missing PUBLIC_NOTES_DIR gracefully', async () => {
      (FileSystemLegacy.getInfoAsync as any).mockResolvedValueOnce({ exists: false });

      await backupNoteToPublic(3, 'Pathology', 'A third note.');

      // Check SAF Cloud Backup
      expect(FileSystemLegacy.StorageAccessFramework.createFileAsync).toHaveBeenCalled();

      // Should make the directory since it didn't exist
      expect(FileSystemLegacy.makeDirectoryAsync).toHaveBeenCalledWith(
        'file:///sdcard/Documents/Guru/Notes/',
        { intermediates: true }
      );

      // Both writes should happen
      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveTranscriptToFile', () => {
    it('should save transcript locally, to SAF cloud, and public local backup', async () => {
      const uri = await saveTranscriptToFile('lecture text');

      // Cloud SAF backup
      expect(FileSystemLegacy.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^transcript_\d+_[a-z0-9]+\.txt$/),
        'text/plain'
      );

      // Cloud SAF backup (it's called in `saveTranscriptToFile` only once on SAF and then `writeAsStringAsync` for local copy)
      expect(FileSystemLegacy.writeAsStringAsync).toHaveBeenCalledWith(
        'content://mock/uri/file.txt',
        'lecture text',
        { encoding: 'utf8' }
      );

      // Public local backup
      expect(FileSystemLegacy.copyAsync).toHaveBeenCalledWith({
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
      const result = await loadTranscriptFromFile('file:///data/user/0/com.app/files/transcripts/transcript_123.txt');
      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );
      expect(result).toBe('transcript content');
    });

    it('falls back to local current directory if absolute path fails', async () => {
      // Mock failure for the first read
      (FileSystemLegacy.readAsStringAsync as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('File not found')))
                                           .mockImplementationOnce(() => Promise.resolve('recovered content'));

      const result = await loadTranscriptFromFile('file:///old/install/path/transcripts/transcript_123.txt');

      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenCalledTimes(2);
      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenNthCalledWith(
        1,
        'file:///old/install/path/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );
      expect(FileSystemLegacy.readAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' }
      );

      expect(result).toBe('recovered content');
    });
  });
});
