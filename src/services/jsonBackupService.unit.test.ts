import { exportJsonBackup, importJsonBackup } from './jsonBackupService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { getDb } from '../db/database';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  writeAsStringAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
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

describe('jsonBackupService', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDb = {
      getAllAsync: jest.fn(),
    };
    (getDb as jest.Mock).mockReturnValue(mockDb);

    mockDb.getAllAsync.mockImplementation(async (query: string) => {
      if (query.includes('FROM subjects')) {
        return [{ id: 1, name: 'Anatomy', short_code: 'ANA' }];
      }
      if (query.includes('FROM topics')) {
        return [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];
      }
      if (query.includes('user_profile')) return [{ id: 1, groq_api_key: 'test_key' }];
      if (query.includes('topic_progress')) return [{ id: 100, topic_id: 10, status: 'unseen' }];
      if (query.includes('lecture_notes')) return [{ id: 200, subject_id: 1, text: 'notes' }];
      if (query.includes('sessions'))
        return [{ id: 300, planned_topics: '[10]', completed_topics: '[10]' }];

      // Default empty for other tables
      return [];
    });
  });

  describe('importJsonBackup', () => {
    it('should return cancelled if document picker is cancelled', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({ canceled: true });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Cancelled' });
    });

    it('should return cancelled if document picker has no assets', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({ canceled: false, assets: [] });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Cancelled' });
    });

    it('should return invalid JSON file if parsing fails', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce('invalid json {');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Invalid JSON file' });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Backup] JSON parse failed during import:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should return invalid JSON file if backup is not an object', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce('"string"');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Invalid JSON file' });
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Backup] JSON parse failed during import:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should return missing version if version is not provided', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce(JSON.stringify({ tables: {} }));

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: false, message: 'Invalid backup format — missing version' });
    });

    it('should return newer version error if version > BACKUP_VERSION', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce(
        JSON.stringify({ version: 9999, tables: {} }),
      );

      const result = await importJsonBackup();

      expect(result).toEqual({
        ok: false,
        message: 'Backup was made with a newer version of the app',
      });
    });

    it('should restore backup successfully and execute transaction', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const validBackup = {
        version: 3,
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
      };

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce(JSON.stringify(validBackup));

      mockDb.execAsync = jest.fn();
      mockDb.runAsync = jest.fn();

      // Mock PRAGMA table_info calls
      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('FROM subjects')) return [{ id: 1, name: 'Anatomy', short_code: 'ANA' }];
        if (query.includes('FROM topics'))
          return [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];
        if (query.includes('PRAGMA table_info(user_profile)'))
          return [{ name: 'id' }, { name: 'groq_api_key' }];
        if (query.includes('PRAGMA table_info(topic_progress)'))
          return [{ name: 'id' }, { name: 'topic_id' }, { name: 'status' }];
        return [];
      });

      const result = await importJsonBackup();

      expect(result).toEqual({ ok: true, message: 'Restored backup successfully' });

      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN IMMEDIATE');
      expect(mockDb.execAsync).toHaveBeenCalledWith('COMMIT');

      // Check DELETE statements
      expect(mockDb.runAsync).toHaveBeenCalledWith('DELETE FROM topic_progress');

      // Check UPDATE for user_profile
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE user_profile SET groq_api_key = ? WHERE id = 1',
        ['new_key'],
      );

      // Check INSERT for topic_progress
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'INSERT OR REPLACE INTO topic_progress (id, status, topic_id) VALUES (?, ?, ?)',
        [100, 'seen', 10],
      );
    });

    it('should rollback transaction if restore fails', async () => {
      const DocumentPicker = require('expo-document-picker');
      DocumentPicker.getDocumentAsync.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///mock/file.json' }],
      });

      const validBackup = {
        version: 3,
        tables: {
          topic_progress: [
            {
              id: 100,
              status: 'seen',
              topic_ref: { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
            },
          ],
        },
      };

      const FileSystem = require('expo-file-system/legacy');
      FileSystem.readAsStringAsync.mockResolvedValueOnce(JSON.stringify(validBackup));

      mockDb.execAsync = jest.fn();
      mockDb.runAsync = jest.fn().mockRejectedValue(new Error('DB Error'));

      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('FROM subjects')) return [{ id: 1, name: 'Anatomy', short_code: 'ANA' }];
        if (query.includes('FROM topics'))
          return [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];
        if (query.includes('PRAGMA table_info(topic_progress)'))
          return [{ name: 'id' }, { name: 'topic_id' }, { name: 'status' }];
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
    it('should export and share backup when sharing is available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);

      const result = await exportJsonBackup();

      expect(result).toBe(true);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);

      // Check the JSON contents
      const [filePath, jsonContent] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
      expect(filePath).toContain('file:///mock-cache/guru_backup_');

      const parsed = JSON.parse(jsonContent);
      expect(parsed.version).toBe(4);
      expect(parsed.tables.user_profile.length).toBe(1);
      expect(parsed.tables.topic_progress.length).toBe(1);
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

      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        filePath,
        expect.objectContaining({ mimeType: 'application/json' }),
      );
      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should show an alert with file path when sharing is not available', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const result = await exportJsonBackup();

      expect(result).toBe(true);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).not.toHaveBeenCalled();

      const [filePath] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
      expect(Alert.alert).toHaveBeenCalledWith('Backup saved', expect.stringContaining(filePath));
    });

    it('should return false if sharing fails', async () => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('Sharing cancelled'));

      // Suppress console.error expected during this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await exportJsonBackup();

      expect(result).toBe(false);
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
      expect(Sharing.shareAsync).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle invalid JSON in number array gracefully', async () => {
      // Setup mock to return invalid JSON string for a number array column
      mockDb.getAllAsync.mockImplementation(async (query: string) => {
        if (query.includes('FROM subjects')) return [{ id: 1, name: 'Anatomy', short_code: 'ANA' }];
        if (query.includes('FROM topics'))
          return [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];
        if (query.includes('sessions')) {
          // 'planned_topics' has invalid JSON string
          return [{ id: 300, planned_topics: '{ invalid json }', completed_topics: '[10]' }];
        }
        return [];
      });

      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await exportJsonBackup();

      expect(result).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Backup] Failed to parse number array:',
        expect.any(SyntaxError),
      );

      const [, jsonContent] = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0];
      const parsed = JSON.parse(jsonContent);

      // The invalid JSON should result in an empty array of refs, not crash
      expect(parsed.tables.sessions[0].planned_topic_refs).toEqual([]);
      expect(parsed.tables.sessions[0].completed_topic_refs).toEqual([
        { subjectShortCode: 'ANA', topicName: 'Upper Limb' },
      ]);

      consoleWarnSpy.mockRestore();
    });
  });
});
