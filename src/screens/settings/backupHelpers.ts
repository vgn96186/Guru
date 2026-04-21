import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDb, runInTransaction } from '../../db/database';
import { pickDocumentOnce } from '../../services/documentPicker';
import type { AppBackup, BackupRow } from './types';
import { BACKUP_VERSION } from './types';
import { asNullableString, asNumber, asString, yieldToUi } from './utils';

export async function exportBackup(): Promise<boolean> {
  const db = getDb();
  const [profile, topicProgress, dailyLog, lectureNotes, sessions, aiCache, brainDumps] =
    await Promise.all([
      db.getFirstAsync<BackupRow>('SELECT * FROM user_profile WHERE id = 1'),
      db.getAllAsync<BackupRow>('SELECT * FROM topic_progress'),
      db.getAllAsync<BackupRow>('SELECT * FROM daily_log ORDER BY date DESC LIMIT 365'),
      db.getAllAsync<BackupRow>('SELECT * FROM lecture_notes ORDER BY created_at DESC LIMIT 5000'),
      db.getAllAsync<BackupRow>('SELECT * FROM sessions'),
      db.getAllAsync<BackupRow>('SELECT * FROM ai_cache'),
      db.getAllAsync<BackupRow>('SELECT * FROM brain_dumps'),
    ]);

  const backup: AppBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    user_profile: profile,
    topic_progress: topicProgress,
    daily_log: dailyLog,
    lecture_notes: lectureNotes,
    sessions,
    ai_cache: aiCache,
    brain_dumps: brainDumps,
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = `${FileSystem.cacheDirectory}guru_backup_${dateStr}.json`;
  await FileSystem.writeAsStringAsync(filePath, json);

  if (await Sharing.isAvailableAsync()) {
    try {
      await Sharing.shareAsync(filePath, {
        mimeType: 'application/json',
        dialogTitle: 'Save Guru Backup',
      });
      return true;
    } catch {
      // User cancelled sharing.
      return false;
    }
  }

  Alert.alert('Backup saved', `File written to:\n${filePath}`);
  return true;
}

export async function importBackup(): Promise<{ ok: boolean; message: string }> {
  const result = await pickDocumentOnce({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: 'Cancelled' };

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let backup: AppBackup;
  try {
    backup = JSON.parse(content);
  } catch {
    return { ok: false, message: 'Invalid JSON file' };
  }

  if (!backup.version || !backup.topic_progress || !backup.user_profile) {
    return { ok: false, message: 'Invalid backup format — missing required fields' };
  }
  if (backup.version > BACKUP_VERSION) {
    return { ok: false, message: 'Backup was made with a newer version of the app' };
  }

  let restoredTopics = 0;
  let restoredLogs = 0;

  await runInTransaction(async (tx) => {
    const validStatuses = new Set(['unseen', 'seen', 'reviewed', 'mastered']);

    for (const [index, row] of (backup.topic_progress ?? []).entries()) {
      const typedRow = row as Record<string, unknown>;
      if (!typedRow.topic_id || typeof typedRow.status === 'undefined') {
        if (__DEV__) console.warn('Skipping invalid topic_progress row:', typedRow);
        continue;
      }

      const status =
        typeof typedRow.status === 'string' && validStatuses.has(typedRow.status)
          ? typedRow.status
          : 'unseen';
      const confidence =
        typeof typedRow.confidence === 'number' ? Math.min(5, Math.max(0, typedRow.confidence)) : 0;

      await tx.runAsync(
        `INSERT OR REPLACE INTO topic_progress
         (topic_id, status, confidence, last_studied_at, times_studied, xp_earned, next_review_date, user_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          asNumber(typedRow.topic_id),
          status,
          confidence,
          asNullableString(typedRow.last_studied_at),
          asNumber(typedRow.times_studied),
          asNumber(typedRow.xp_earned),
          asNullableString(typedRow.next_review_date),
          asString(typedRow.user_notes),
        ],
      );
      restoredTopics++;

      if ((index + 1) % 50 === 0) await yieldToUi();
    }

    for (const [index, row] of (backup.daily_log ?? []).entries()) {
      const typedRow = row as Record<string, unknown>;
      if (!typedRow.date) {
        if (__DEV__) console.warn('Skipping invalid daily_log row:', typedRow);
        continue;
      }

      await tx.runAsync(
        `INSERT OR REPLACE INTO daily_log (date, checked_in, mood, total_minutes, xp_earned, session_count)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          asString(typedRow.date),
          asNumber(typedRow.checked_in),
          asNullableString(typedRow.mood),
          asNumber(typedRow.total_minutes),
          asNumber(typedRow.xp_earned),
          asNumber(typedRow.session_count),
        ],
      );
      restoredLogs++;

      if ((index + 1) % 50 === 0) await yieldToUi();
    }

    const p = backup.user_profile as Record<string, unknown> | null;
    if (p) {
      await tx.runAsync(
        `UPDATE user_profile SET
         display_name = ?, total_xp = ?, current_level = ?,
         streak_current = ?, streak_best = ?,
         daily_goal_minutes = ?, preferred_session_length = ?
         WHERE id = 1`,
        [
          asString(p.display_name, 'Doctor'),
          asNumber(p.total_xp),
          asNumber(p.current_level, 1),
          asNumber(p.streak_current),
          asNumber(p.streak_best),
          asNumber(p.daily_goal_minutes, 120),
          asNumber(p.preferred_session_length, 45),
        ],
      );
    }
  });

  return { ok: true, message: `Restored ${restoredTopics} topics, ${restoredLogs} log entries` };
}
