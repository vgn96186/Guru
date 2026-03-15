import { exportJsonBackup } from './jsonBackupService';
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
      expect(parsed.version).toBe(3);
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
        expect.objectContaining({ mimeType: 'application/json' })
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
        if (query.includes('FROM topics')) return [{ id: 10, name: 'Upper Limb', subject_id: 1, short_code: 'ANA' }];
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
        expect.any(SyntaxError)
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
