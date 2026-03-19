import { describe, it, expect, jest, afterEach, beforeEach } from '@jest/globals';
import * as FileSystem from 'expo-file-system/legacy';

const profileMock = { backupDirectoryUri: 'content://mock/uri' };

async function loadService() {
  jest.resetModules();

  const mockFileSystem = {
    documentDirectory: 'file:///data/user/0/com.app/files/',
    writeAsStringAsync: jest.fn(async (_u: string, _c: string, _o?: any) => {}),
    readAsStringAsync: jest.fn(async (_u: string, _o?: any) => 'transcript content'),
    makeDirectoryAsync: jest.fn(async (_u: string, _o?: any) => {}),
    getInfoAsync: jest.fn(async (_u: string) => ({ exists: true })),
    copyAsync: jest.fn(async (_o: { from: string; to: string }) => {}),
    moveAsync: jest.fn(async (_o: { from: string; to: string }) => {}),
    StorageAccessFramework: {
      createFileAsync: jest.fn(
        async (_u: string, _f: string, _m: string) => 'content://mock/uri/file.txt',
      ),
    },
    EncodingType: { UTF8: 'utf8' },
  };

  jest.doMock('expo-file-system/legacy', () => mockFileSystem);

  jest.doMock('react-native', () => ({
    Platform: { OS: 'android' },
  }));

  jest.doMock('../db/repositories', () => ({
    profileRepository: {
      getProfile: jest.fn(async () => profileMock),
    },
  }));

  jest.doMock('../../modules/app-launcher', () => ({
    copyFileToPublicBackup: jest.fn(async () => true),
  }));

  const service = await import('./transcriptStorage');
  return { service, mockFileSystem };
}

describe('transcriptStorage', () => {
  beforeEach(() => {
    // Reset mocks
    (FileSystem.writeAsStringAsync as jest.Mock).mockClear();
    (FileSystem.readAsStringAsync as jest.Mock).mockClear();
    (FileSystem.makeDirectoryAsync as jest.Mock).mockClear();
    (FileSystem.getInfoAsync as jest.Mock).mockClear();
    (FileSystem.copyAsync as jest.Mock).mockClear();
    if ((FileSystem as any).moveAsync) {
      ((FileSystem as any).moveAsync as jest.Mock).mockClear();
    }
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockClear();

    // Ensure mock return values are reset in case any tests override them
    (FileSystem.getInfoAsync as jest.Mock).mockImplementation(async () => ({ exists: true }));
    (FileSystem.readAsStringAsync as jest.Mock).mockImplementation(
      async () => 'transcript content',
    );
    (FileSystem.StorageAccessFramework.createFileAsync as jest.Mock).mockImplementation(
      async () => 'content://mock/uri/file.txt',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('backupNoteToPublic', () => {
    it('should save to cloud (SAF) and local public dir on Android', async () => {
      const { service, mockFileSystem } = await loadService();
      await service.backupNoteToPublic(
        1,
        { subjectName: 'Anatomy', topics: ['Upper Limb'] },
        'This is a note.',
      );

      // Check SAF Cloud Backup
      expect(mockFileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^anatomy__upper-limb__note__\d+\.txt$/),
        'text/plain',
      );

      // Check write to both SAF and Local
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2);

      // First write to SAF
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        'content://mock/uri/file.txt',
        'This is a note.',
        { encoding: 'utf8' },
      );

      // Second write to local public
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching(
          /^file:\/\/\/data\/user\/0\/com\.app\/files\/backups\/Notes\/anatomy__upper-limb__note__\d+\.txt$/,
        ),
        'This is a note.',
        { encoding: 'utf8' },
      );
    });

    it('should save to public directory even if cloud backup is disabled', async () => {
      const { service, mockFileSystem } = await loadService();
      // Temporarily clear profile mock
      const originalUri = profileMock.backupDirectoryUri;
      (profileMock as any).backupDirectoryUri = null;

      await service.backupNoteToPublic(
        2,
        { subjectName: 'Physiology', topics: ['Cardiac Cycle'] },
        'Another note.',
      );

      // Should not call SAF
      expect(mockFileSystem.StorageAccessFramework.createFileAsync).not.toHaveBeenCalled();

      // But should still write to local public
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringMatching(
          /^file:\/\/\/data\/user\/0\/com\.app\/files\/backups\/Notes\/physiology__cardiac-cycle__note__\d+\.txt$/,
        ),
        'Another note.',
        { encoding: 'utf8' },
      );

      // Restore profile mock
      (profileMock as any).backupDirectoryUri = originalUri;
    });

    it('should handle missing PUBLIC_NOTES_DIR gracefully', async () => {
      const { service, mockFileSystem } = await loadService();
      mockFileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false } as any);

      await service.backupNoteToPublic(
        3,
        { subjectName: 'Pathology', topics: ['Inflammation'] },
        'A third note.',
      );

      // Check SAF Cloud Backup
      expect(mockFileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalled();

      // Should make the directory since it didn't exist
      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/backups/Notes/',
        { intermediates: true },
      );

      // Both writes should happen
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveTranscriptToFile', () => {
    it('should save transcript locally, to SAF cloud, and public local backup', async () => {
      const { service, mockFileSystem } = await loadService();
      const uri = await service.saveTranscriptToFile('lecture text', {
        subjectName: 'Anatomy',
        topics: ['Upper Limb'],
      });

      // Main app directory
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(
          /^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/anatomy__upper-limb__transcript__\d+\.txt$/,
        ),
        'lecture text',
        { encoding: 'utf8' },
      );

      // Cloud SAF backup
      expect(mockFileSystem.StorageAccessFramework.createFileAsync).toHaveBeenCalledWith(
        'content://mock/uri',
        expect.stringMatching(/^anatomy__upper-limb__transcript__\d+\.txt$/),
        'text/plain',
      );
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'content://mock/uri/file.txt',
        'lecture text',
        { encoding: 'utf8' },
      );

      // Public local backup
      // In the module mock we defined copyFileToPublicBackup, let's just get it and check
      const appLauncher = await import('../../modules/app-launcher');
      expect(appLauncher.copyFileToPublicBackup).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\/data\/user\/0\/com\.app\/files\/transcripts\/anatomy__upper-limb__transcript__\d+\.txt$/,
        ),
        expect.stringMatching(/^anatomy__upper-limb__transcript__\d+\.txt$/),
      );

      expect(uri).toMatch(
        /^file:\/\/\/data\/user\/0\/com\.app\/files\/transcripts\/anatomy__upper-limb__transcript__\d+\.txt$/,
      );
    });

    it('returns the text directly if it is not a path', async () => {
      const { service } = await loadService();
      const res = await service.saveTranscriptToFile('file://my_test_path.txt');
      expect(res).toBe('file://my_test_path.txt');
    });
  });

  describe('loadTranscriptFromFile', () => {
    it('returns null if input is falsy', async () => {
      const { service } = await loadService();
      const result = await service.loadTranscriptFromFile(null);
      expect(result).toBeNull();

      const resultEmpty = await service.loadTranscriptFromFile('');
      expect(resultEmpty).toBeNull();
    });

    it('returns the text if it is not a file URI', async () => {
      const { service } = await loadService();
      const result = await service.loadTranscriptFromFile('just text');
      expect(result).toBe('just text');
    });

    it('loads from URI correctly', async () => {
      const { service, mockFileSystem } = await loadService();
      const result = await service.loadTranscriptFromFile(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
      );
      expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' },
      );
      expect(result).toBe('transcript content');
    });

    it('falls back to local current directory if absolute path fails', async () => {
      const { service, mockFileSystem } = await loadService();
      // Mock failure for the first read
      mockFileSystem.readAsStringAsync
        .mockImplementationOnce(() => Promise.reject(new Error('File not found')))
        .mockImplementationOnce(() => Promise.resolve('recovered content'));

      const result = await service.loadTranscriptFromFile(
        'file:///old/install/path/transcripts/transcript_123.txt',
      );

      expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
      expect(mockFileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        1,
        'file:///old/install/path/transcripts/transcript_123.txt',
        { encoding: 'utf8' },
      );
      expect(mockFileSystem.readAsStringAsync).toHaveBeenNthCalledWith(
        2,
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
        { encoding: 'utf8' },
      );

      expect(result).toBe('recovered content');
    });

    it('returns an error message if both primary and fallback paths fail', async () => {
      const { service, mockFileSystem } = await loadService();
      // Mock failure for both reads
      mockFileSystem.readAsStringAsync.mockImplementation(() =>
        Promise.reject(new Error('File not found anywhere')),
      );

      const result = await service.loadTranscriptFromFile(
        'file:///old/install/path/transcripts/transcript_123.txt',
      );

      expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledTimes(2);
      expect(result).toBe('Transcript file could not be loaded.');
    });

    it('returns an error message immediately if original URI is already the current fallback URI and fails', async () => {
      const { service, mockFileSystem } = await loadService();
      // Mock failure for read
      mockFileSystem.readAsStringAsync.mockImplementation(() =>
        Promise.reject(new Error('Current path file not found')),
      );

      // Give it the exact path that the fallback logic would resolve to
      const result = await service.loadTranscriptFromFile(
        'file:///data/user/0/com.app/files/transcripts/transcript_123.txt',
      );

      expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledTimes(1);
      expect(result).toBe('Transcript file could not be loaded.');
    });
  });

  describe('moveFileToRecovery', () => {
    it('copies file to recovery folder and returns new URI', async () => {
      const { service, mockFileSystem } = await loadService();
      const result = await service.moveFileToRecovery('file:///tmp/source.m4a');

      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        'file:///data/user/0/com.app/files/recovery/',
        { intermediates: true },
      );
      expect(mockFileSystem.copyAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/source.m4a',
        to: expect.stringMatching(
          /^file:\/\/\/data\/user\/0\/com\.app\/files\/recovery\/recovery_\d+_[a-zA-Z0-9]{7}\.m4a$/,
        ),
      });
      expect(result).toMatch(
        /^file:\/\/\/data\/user\/0\/com\.app\/files\/recovery\/recovery_\d+_[a-zA-Z0-9]{7}\.m4a$/,
      );
    });

    it('returns original URI when recovery copy fails', async () => {
      const { service, mockFileSystem } = await loadService();
      mockFileSystem.copyAsync.mockRejectedValueOnce(new Error('copy failed'));

      const result = await service.moveFileToRecovery('file:///tmp/source.m4a');
      expect(result).toBe('file:///tmp/source.m4a');
    });
  });

  describe('renameRecordingToLectureIdentity', () => {
    it('renames file URI and returns updated URI', async () => {
      const { service, mockFileSystem } = await loadService();
      const result = await service.renameRecordingToLectureIdentity('file:///tmp/recording.m4a', {
        subjectName: 'Anatomy',
        topics: ['Upper Limb'],
      });

      expect(mockFileSystem.moveAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/recording.m4a',
        to: expect.stringMatching(/^file:\/\/\/tmp\/anatomy__upper-limb__recording__\d+\.m4a$/),
      });
      expect(result).toMatch(/^file:\/\/\/tmp\/anatomy__upper-limb__recording__\d+\.m4a$/);
    });

    it('preserves raw path format when input has no file:// prefix', async () => {
      const { service, mockFileSystem } = await loadService();
      const result = await service.renameRecordingToLectureIdentity('/tmp/recording.m4a', {
        subjectName: 'Pathology',
        topics: ['Inflammation'],
      });

      expect(mockFileSystem.moveAsync).toHaveBeenCalledWith({
        from: 'file:///tmp/recording.m4a',
        to: expect.stringMatching(/^file:\/\/\/tmp\/pathology__inflammation__recording__\d+\.m4a$/),
      });
      expect(result).toMatch(/^\/tmp\/pathology__inflammation__recording__\d+\.m4a$/);
    });
  });

  describe('getTranscriptText', () => {
    it('returns null for blank inputs', async () => {
      const { service } = await loadService();
      await expect(service.getTranscriptText(null)).resolves.toBeNull();
      await expect(service.getTranscriptText('')).resolves.toBeNull();
      await expect(service.getTranscriptText('   ')).resolves.toBeNull();
    });

    it('resolves transcript text for non-blank values', async () => {
      const { service, mockFileSystem } = await loadService();
      mockFileSystem.readAsStringAsync.mockResolvedValueOnce('loaded');

      const result = await service.getTranscriptText('file:///tmp/transcript.txt');
      expect(mockFileSystem.readAsStringAsync).toHaveBeenCalledWith('file:///tmp/transcript.txt', {
        encoding: 'utf8',
      });
      expect(result).toBe('loaded');
    });
  });
});
