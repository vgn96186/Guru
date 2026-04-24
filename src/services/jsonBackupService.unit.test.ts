import { exportJsonBackup, importJsonBackup } from './jsonBackupService';
import * as FileSystem from 'expo-file-system/legacy';
import { getDb } from '../db/database';
import { getAiCacheDb } from '../db/aiCacheDatabase';
import { getDrizzleDb } from '../db/drizzle';
import { pickDocumentOnce } from './documentPicker';
import { shareBackupFileOrAlert } from './backupShare';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));

jest.mock('../db/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../db/aiCacheDatabase', () => ({
  getAiCacheDb: jest.fn(),
}));

jest.mock('../db/drizzle', () => ({
  getDrizzleDb: jest.fn(),
}));

jest.mock('./documentPicker', () => ({
  pickDocumentOnce: jest.fn(),
}));

jest.mock('./backupShare', () => ({
  shareBackupFileOrAlert: jest.fn(),
}));

function createMockDrizzleDb() {
  const subjectsRows = [{ id: 1, name: 'Anatomy', short_code: 'ANA' }];
  const topicsRows = [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];

  return {
    select: jest
      .fn()
      .mockReturnValueOnce({
        from: jest.fn().mockResolvedValue(subjectsRows),
      })
      .mockReturnValueOnce({
        from: jest.fn(() => ({
          innerJoin: jest.fn().mockResolvedValue(topicsRows),
        })),
      }),
  };
}

describe('jsonBackupService', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      getAllAsync: jest.fn(),
      execAsync: jest.fn(),
      runAsync: jest.fn(),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);
    (getAiCacheDb as jest.Mock).mockReturnValue(mockDb);
    (getDrizzleDb as jest.Mock).mockReturnValue(createMockDrizzleDb());

    mockDb.getAllAsync.mockImplementation(async (query: string) => {
      if (query.includes('user_profile')) return [{ id: 1, groq_api_key: 'test_key' }];
      if (query.includes('topic_progress')) return [{ id: 100, topic_id: 10, status: 'unseen' }];
      if (query.includes('lecture_notes')) return [{ id: 200, subject_id: 1, text: 'notes' }];
      if (query.includes('sessions')) {
        return [{ id: 300, planned_topics: '[10]', completed_topics: '[10]' }];
      }
      return [];
    });
  });

  describe('importJsonBackup', () => {
    it('returns cancelled if the picker is cancelled', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({ canceled: true });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Cancelled' });
    });

    it('returns cancelled if the picker has no assets', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [] });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Cancelled' });
    });

    it('returns invalid JSON file if parsing fails', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce('invalid json {');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Invalid JSON file' });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Backup] JSON parse failed during import:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('returns missing version if version is not provided', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({ tables: {} }),
      );

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Invalid backup format — missing version' });
    });

    it('restores backup successfully and executes a transaction', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          version: 4,
          tables: {
            user_profile: [{ id: 1, groq_api_key: 'new_key' }],
            topic_progress: [
              {
                id: 100,
                status: 'seen',
                topic_ref: { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
              },
            ],
          },
        }),
      );

      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('PRAGMA table_info(user_profile)')) {
          return [{ name: 'id' }, { name: 'groq_api_key' }];
        }
        if (query.includes('PRAGMA table_info(topic_progress)')) {
          return [{ name: 'id' }, { name: 'topic_id' }, { name: 'status' }];
        }
        return [];
      });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: true, message: 'Restored backup successfully' });
      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE');
      expect(mockDb.execAsync).toHaveBeenCalledWith('COMMIT');
      expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM topic_progress');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE user_profile SET groq_api_key = ? WHERE id = 1',
        ['new_key'],
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO topic_progress (id, status, topic_id) VALUES (?, ?, ?)',
        [100, 'seen', 10],
      );
    });

    it('rolls back the transaction if restore fails', async () => {
      (pickDocumentOnce as jest.Mock).mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });
      (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          version: 4,
          tables: {
            topic_progress: [
              {
                id: 100,
                status: 'seen',
                topic_ref: { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
              },
            ],
          },
        }),
      );
      mockDb.runAsync.mockRejectedValue(new Error('DB Error'));
      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('PRAGMA table_info(topic_progress)')) {
          return [{ name: 'id' }, { name: 'topic_id' }, { name: 'status' }];
        }
        return [];
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Import failed during restore.' });
      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE');
      expect(mockDb.execAsync).toHaveBeenCalledWith('ROLLBACK');

      consoleSpy.mockRestore();
    });
  });

  describe('exportJsonBackup', () => {
    it('exports backup JSON and delegates file sharing to the helper', async () => {
      (shareBackupFileOrAlert as jest.Mock).mockResolvedValue(undefined);

      const result = await exportJsonBackup();

      expect(result).toBe(true);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);

      const [filePath, jsonContent] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
      expect(filePath).toContain('file:///mock-cache/guru_backup_');

      const parsed = JSON.parse(jsonContent);
      expect(parsed.version).toBe(4);
      expect(parsed.tables.user_profile.length).toBe(1);
      expect(parsed.tables.topic_progress[0].topic_ref).toEqual({
        subjectShortCode: 'ANA',
        topicName: 'Upper Limb',
      });
      expect(parsed.tables.lecture_notes[0].subject_ref).toEqual({
        shortCode: 'ANA',
        name: 'Anatomy',
      });
      expect(parsed.tables.sessions[0].planned_topic_refs).toEqual([
        { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
      ]);
      expect(shareBackupFileOrAlert).toHaveBeenCalledWith(
        filePath,
        expect.objectContaining({
          mimeType: 'application/json',
          dialogTitle: 'Save Guru Backup',
        }),
      );
    });

    it('returns false if sharing fails', async () => {
      (shareBackupFileOrAlert as jest.Mock).mockRejectedValue(new Error('Sharing cancelled'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await exportJsonBackup();

      expect(result).toBe(false);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(shareBackupFileOrAlert).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles invalid JSON in number array gracefully', async () => {
      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('sessions')) {
          return [{ id: 300, planned_topics: '{ invalid json }', completed_topics: '[10]' }];
        }
        return [];
      });
      (shareBackupFileOrAlert as jest.Mock).mockResolvedValue(undefined);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await exportJsonBackup();

      expect(result).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Backup] Failed to parse number array:',
        expect.any(SyntaxError),
      );

      const [, jsonContent] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(jsonContent);
      expect(parsed.tables.sessions[0].planned_topic_refs).toEqual([]);
      expect(parsed.tables.sessions[0].completed_topic_refs).toEqual([
        { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
      ]);

      consoleWarnSpy.mockRestore();
    });
  });
});
