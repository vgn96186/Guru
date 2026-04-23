import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getDb } from '../db/database';
import { getDrizzleDb } from '../db/drizzle';
import { subjects, topics } from '../db/drizzleSchema';
import { eq } from 'drizzle-orm';
import { getAiCacheDb } from '../db/aiCacheDatabase';
import { pickDocumentOnce } from './documentPicker';
import { shareBackupFileOrAlert } from './backupShare';

const BACKUP_VERSION = 4;
const JSON_BACKUP_TABLES = [
  'user_profile',
  'topic_progress',
  'daily_log',
  'lecture_notes',
  'ai_cache',
  'sessions',
  'external_app_logs',
  'brain_dumps',
  'lecture_learned_topics',
  'generated_study_images',
  'topic_suggestions',
  'chat_history',
  'guru_chat_session_memory',
  'daily_agenda',
  'plan_events',
  'offline_ai_queue',
] as const;

/** Child tables before parents (FK-safe clears during restore). */
const JSON_BACKUP_DELETE_ORDER: BackupTableName[] = [
  'external_app_logs',
  'ai_cache',
  'topic_progress',
  'sessions',
  'lecture_learned_topics',
  'generated_study_images',
  'topic_suggestions',
  'chat_history',
  'guru_chat_session_memory',
  'daily_agenda',
  'plan_events',
  'offline_ai_queue',
  'lecture_notes',
  'daily_log',
  'brain_dumps',
  'user_profile',
];

const JSON_BACKUP_RESTORE_ORDER: BackupTableName[] = [
  'daily_log',
  'lecture_notes',
  'topic_progress',
  'ai_cache',
  'sessions',
  'external_app_logs',
  'lecture_learned_topics',
  'generated_study_images',
  'topic_suggestions',
  'chat_history',
  'guru_chat_session_memory',
  'daily_agenda',
  'plan_events',
  'offline_ai_queue',
  'brain_dumps',
  'user_profile',
];

type BackupTableName = (typeof JSON_BACKUP_TABLES)[number];
type BackupRow = Record<string, unknown>;

function connectionForTable(table: BackupTableName, main: SQLiteDatabase): SQLiteDatabase {
  return table === 'ai_cache' ? getAiCacheDb() : main;
}
type BackupTableData = Record<BackupTableName, BackupRow[]>;
type SubjectBackupRef = { shortCode: string; name: string };
type TopicBackupRef = { subjectShortCode: string; topicName: string };
type _BackupMetadata = {
  subjects: SubjectBackupRef[];
  topics: TopicBackupRef[];
};

function _isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function createTopicRefKey(ref: TopicBackupRef): string {
  return `${ref.subjectShortCode}::${ref.topicName}`.toLowerCase();
}

function parseJsonNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
    );
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is number => typeof entry === 'number' && Number.isFinite(entry),
        )
      : [];
  } catch (err) {
    console.warn('[Backup] Failed to parse number array:', err);
    return [];
  }
}

function toBindValue(val: unknown): string | number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'object') return JSON.stringify(val);
  return val as string | number;
}

export async function exportJsonBackup(): Promise<boolean> {
  const db = getDb();
  const drizzle = getDrizzleDb();
  const [subjectsRaw, topicsRaw] = await Promise.all([
    drizzle
      .select({ id: subjects.id, name: subjects.name, short_code: subjects.shortCode })
      .from(subjects),
    drizzle
      .select({
        id: topics.id,
        name: topics.name,
        subject_id: topics.subjectId,
        short_code: subjects.shortCode,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id)),
  ]);
  const subjectsList = subjectsRaw;
  const topicsList = topicsRaw as Array<{
    id: number;
    name: string;
    subject_id: number;
    short_code: string;
  }>;
  const subjectRefsById = new Map<number, SubjectBackupRef>(
    subjectsList.map((subject) => [
      subject.id,
      { shortCode: subject.short_code, name: subject.name },
    ]),
  );
  const topicRefsById = new Map<number, TopicBackupRef>(
    topicsList.map((topic) => [
      topic.id,
      { subjectShortCode: topic.short_code, topicName: topic.name },
    ]),
  );

  const serializeBackupRow = (table: BackupTableName, row: BackupRow): BackupRow => {
    const nextRow = { ...row };

    if (table === 'topic_progress' || table === 'ai_cache') {
      const topicId = typeof nextRow.topic_id === 'number' ? nextRow.topic_id : null;
      const topicRef = topicId ? topicRefsById.get(topicId) : null;
      if (topicRef) {
        nextRow.topic_ref = topicRef;
      }
    }

    if (table === 'lecture_notes') {
      const subjectId = typeof nextRow.subject_id === 'number' ? nextRow.subject_id : null;
      const subjectRef = subjectId ? subjectRefsById.get(subjectId) : null;
      if (subjectRef) {
        nextRow.subject_ref = subjectRef;
      }
    }

    if (table === 'sessions') {
      const plannedRefs = parseJsonNumberArray(nextRow.planned_topics)
        .map((topicId) => topicRefsById.get(topicId))
        .filter((ref): ref is TopicBackupRef => !!ref);
      const completedRefs = parseJsonNumberArray(nextRow.completed_topics)
        .map((topicId) => topicRefsById.get(topicId))
        .filter((ref): ref is TopicBackupRef => !!ref);
      nextRow.planned_topic_refs = plannedRefs;
      nextRow.completed_topic_refs = completedRefs;
    }

    if (table === 'generated_study_images' || table === 'lecture_learned_topics') {
      const topicId = typeof nextRow.topic_id === 'number' ? nextRow.topic_id : null;
      const topicRef = topicId ? topicRefsById.get(topicId) : null;
      if (topicRef) {
        nextRow.topic_ref = topicRef;
      }
    }

    if (table === 'topic_suggestions') {
      const subjectId = typeof nextRow.subject_id === 'number' ? nextRow.subject_id : null;
      const subjectRef = subjectId ? subjectRefsById.get(subjectId) : null;
      if (subjectRef) {
        nextRow.subject_ref = subjectRef;
      }
      const approvedId =
        typeof nextRow.approved_topic_id === 'number' ? nextRow.approved_topic_id : null;
      const approvedRef = approvedId ? topicRefsById.get(approvedId) : null;
      if (approvedRef) {
        nextRow.approved_topic_ref = approvedRef;
      }
    }

    return nextRow;
  };

  const tables = {} as BackupTableData;
  for (const table of JSON_BACKUP_TABLES) {
    const conn = connectionForTable(table, db);
    const rows = await conn.getAllAsync<BackupRow>(`SELECT * FROM ${table}`);
    tables[table] = rows.map((row) => serializeBackupRow(table, row));
  }

  const backup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    metadata: {
      subjects: Array.from(subjectRefsById.values()),
      topics: Array.from(topicRefsById.values()),
    },
  };

  const json = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filePath = `${FileSystem.cacheDirectory}guru_backup_${dateStr}.json`;
  await FileSystem.writeAsStringAsync(filePath, json);

  try {
    await shareBackupFileOrAlert(filePath, {
      mimeType: 'application/json',
      dialogTitle: 'Save Guru Backup',
    });
    return true;
  } catch (err) {
    console.error('[Backup] Sharing failed:', err);
    return false;
  }
}

export async function importJsonBackup(): Promise<{ ok: boolean; message: string }> {
  const result = await pickDocumentOnce({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return { ok: false, message: 'Cancelled' };

  const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
  let backup: Record<string, unknown>;
  try {
    backup = JSON.parse(content);
    if (!backup || typeof backup !== 'object') throw new Error('Not an object');
  } catch (err) {
    console.error('[Backup] JSON parse failed during import:', err);
    return { ok: false, message: 'Invalid JSON file' };
  }

  if (!backup.version) {
    return { ok: false, message: 'Invalid backup format — missing version' };
  }
  if (typeof backup.version === 'number' && backup.version > BACKUP_VERSION) {
    return { ok: false, message: 'Backup was made with a newer version of the app' };
  }

  const db = getDb();
  const drizzle = getDrizzleDb();
  const [subjectsRaw, topicsRaw] = await Promise.all([
    drizzle
      .select({ id: subjects.id, name: subjects.name, short_code: subjects.shortCode })
      .from(subjects),
    drizzle
      .select({
        id: topics.id,
        name: topics.name,
        subject_id: topics.subjectId,
        short_code: subjects.shortCode,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id)),
  ]);
  const subjectsList = subjectsRaw;
  const topicsList = topicsRaw as Array<{
    id: number;
    name: string;
    subject_id: number;
    short_code: string;
  }>;

  const subjectIdsByShortCode = new Map<string, number>(
    subjectsList.map((subject) => [subject.short_code.toLowerCase(), subject.id]),
  );
  const topicIdsByRefKey = new Map<string, number>(
    topicsList.map((topic) => [
      createTopicRefKey({ subjectShortCode: topic.short_code, topicName: topic.name }),
      topic.id,
    ]),
  );

  const tablesFromBackup: Partial<Record<BackupTableName, BackupRow[]>> =
    backup.tables && typeof backup.tables === 'object' ? backup.tables : {};
  const restoredCounts: Partial<Record<BackupTableName, number>> = {};

  const getColumns = async (table: string): Promise<string[]> => {
    try {
      const conn = table === 'ai_cache' ? getAiCacheDb() : db;
      const info = await conn.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      return info.map((c: { name: string }) => c.name);
    } catch (err) {
      console.error(`[Backup] Failed to get columns for ${table}:`, err);
      return [];
    }
  };

  const sanitizeRow = (table: BackupTableName, rawRow: BackupRow): BackupRow | null => {
    const row = { ...rawRow };
    delete row.topic_ref;
    delete row.subject_ref;
    delete row.approved_topic_ref;
    delete row.planned_topic_refs;
    delete row.completed_topic_refs;

    if (table === 'topic_progress' || table === 'ai_cache') {
      const ref = rawRow.topic_ref as Record<string, unknown> | undefined;
      if (ref && typeof ref.subjectShortCode === 'string' && typeof ref.topicName === 'string') {
        const tid = topicIdsByRefKey.get(createTopicRefKey(ref as unknown as TopicBackupRef));
        if (tid) row.topic_id = tid;
        else return null;
      }
    }
    if (table === 'lecture_notes') {
      const ref = rawRow.subject_ref as Record<string, unknown> | undefined;
      if (ref && typeof ref.shortCode === 'string') {
        const sid = subjectIdsByShortCode.get(ref.shortCode.toLowerCase());
        if (sid) row.subject_id = sid;
        else row.subject_id = null;
      }
    }
    if (table === 'sessions') {
      const pRefs = rawRow.planned_topic_refs as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(pRefs)) {
        row.planned_topics = JSON.stringify(
          pRefs
            .map((r) => topicIdsByRefKey.get(createTopicRefKey(r as unknown as TopicBackupRef)))
            .filter((id) => !!id),
        );
      }
      const cRefs = rawRow.completed_topic_refs as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(cRefs)) {
        row.completed_topics = JSON.stringify(
          cRefs
            .map((r) => topicIdsByRefKey.get(createTopicRefKey(r as unknown as TopicBackupRef)))
            .filter((id) => !!id),
        );
      }
    }
    if (table === 'generated_study_images' || table === 'lecture_learned_topics') {
      const ref = rawRow.topic_ref as Record<string, unknown> | undefined;
      if (ref && typeof ref.subjectShortCode === 'string' && typeof ref.topicName === 'string') {
        const tid = topicIdsByRefKey.get(createTopicRefKey(ref as unknown as TopicBackupRef));
        if (tid) row.topic_id = tid;
        else return null;
      }
    }
    if (table === 'topic_suggestions') {
      const sref = rawRow.subject_ref as Record<string, unknown> | undefined;
      if (sref && typeof sref.shortCode === 'string') {
        const sid = subjectIdsByShortCode.get(String(sref.shortCode).toLowerCase());
        if (sid) row.subject_id = sid;
        else return null;
      }
      const aref = rawRow.approved_topic_ref as Record<string, unknown> | undefined;
      if (aref && typeof aref.subjectShortCode === 'string' && typeof aref.topicName === 'string') {
        const tid = topicIdsByRefKey.get(createTopicRefKey(aref as unknown as TopicBackupRef));
        row.approved_topic_id = tid ?? null;
      }
    }
    return row;
  };

  try {
    await db.execAsync('PRAGMA defer_foreign_keys = ON');
    await db.execAsync('BEGIN IMMEDIATE');

    for (const table of JSON_BACKUP_DELETE_ORDER) {
      if (table === 'user_profile') continue;
      if (!(table in tablesFromBackup)) continue;
      await connectionForTable(table, db).runAsync(`DELETE FROM ${table}`);
      restoredCounts[table] = 0;
    }

    if (tablesFromBackup.user_profile?.[0]) {
      const row = tablesFromBackup.user_profile[0];
      const userCols = await getColumns('user_profile');
      const setCols = Object.keys(row).filter((c) => c !== 'id' && userCols.includes(c));
      if (setCols.length > 0) {
        const setSql = setCols.map((c) => `${c} = ?`).join(', ');
        const values = setCols.map((c) => toBindValue(row[c]));
        // For user profile, since fields are dynamic based on backup, continue using raw query, but use Drizzle's sql if we want, but expo-sqlite is fine.
        await db.runAsync(`UPDATE user_profile SET ${setSql} WHERE id = 1`, values);
      }
      restoredCounts.user_profile = 1;
    }

    for (const table of JSON_BACKUP_RESTORE_ORDER) {
      if (table === 'user_profile') continue;
      const rows = tablesFromBackup[table];
      if (!rows || rows.length === 0) continue;
      const tableCols = await getColumns(table);
      const conn = connectionForTable(table, db);

      for (const rawRow of rows) {
        const sanitizedRow = sanitizeRow(table, rawRow);
        if (!sanitizedRow) continue;
        const cols = Object.keys(sanitizedRow).filter((c) => tableCols.includes(c));
        const placeholders = cols.map(() => '?').join(', ');
        const values = cols.map((c) => toBindValue(sanitizedRow[c]));
        await conn.runAsync(
          `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          values,
        );
        restoredCounts[table] = (restoredCounts[table] ?? 0) + 1;
      }
    }
    await db.execAsync('COMMIT');
  } catch (err) {
    console.error('[Backup] Restore transaction failed:', err);
    try {
      await db.execAsync('ROLLBACK');
    } catch (rbErr) {
      console.warn('[Backup] Rollback also failed:', rbErr);
    }
    return { ok: false, message: 'Import failed during restore.' };
  }

  return { ok: true, message: 'Restored backup successfully' };
}
