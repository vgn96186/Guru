/**
 * Schema parity test — verifies that the Drizzle ORM schema definitions in
 * drizzleSchema.ts match the actual SQLite tables created by the legacy
 * CREATE TABLE + MIGRATIONS path. Fails CI if any column is missing or
 * extra between the two definitions.
 *
 * Uses better-sqlite3 directly (no expo-sqlite mock) to create a real
 * in-memory DB with the full schema, then introspects via PRAGMA table_info.
 */

import * as schema from '../drizzleSchema';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ensureCriticalColumns } from '../database';
import { wrapBetterSqliteToAsync } from './betterSqliteAdapter';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/**
 * Map of Drizzle table export name → SQLite table name.
 */
const DRIZZLE_TABLE_MAP: Record<string, string> = {
  subjects: 'subjects',
  topics: 'topics',
  topicProgress: 'topic_progress',
  sessions: 'sessions',
  dailyLog: 'daily_log',
  dailyAgenda: 'daily_agenda',
  planEvents: 'plan_events',
  externalAppLogs: 'external_app_logs',
  lectureNotes: 'lecture_notes',
  lectureLearnedTopics: 'lecture_learned_topics',
  lectureScheduleProgress: 'lecture_schedule_progress',
  topicSuggestions: 'topic_suggestions',
  aiCache: 'ai_cache',
  generatedStudyImages: 'generated_study_images',
  contentFactChecks: 'content_fact_checks',
  userContentFlags: 'user_content_flags',
  offlineAiQueue: 'offline_ai_queue',
  guruChatThreads: 'guru_chat_threads',
  guruChatSessionMemory: 'guru_chat_session_memory',
  chatHistory: 'chat_history',
  brainDumps: 'brain_dumps',
  questionBank: 'question_bank',
  mindMaps: 'mind_maps',
  mindMapNodes: 'mind_map_nodes',
  mindMapEdges: 'mind_map_edges',
  mindMapNodeLinks: 'mind_map_node_links',
  migrationHistory: 'migration_history',
  semanticLinks: 'semantic_links',
  topicNotes: 'topic_notes',
  userProfile: 'user_profile',
};

function createFreshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  const baselineSql = readFileSync(
    join(__dirname, '..', 'drizzle-migrations', '0000_baseline_v164.sql'),
    'utf8',
  );
  for (const statement of baselineSql.split('--> statement-breakpoint')) {
    const sql = statement.trim();
    if (sql) db.exec(sql);
  }

  return db;
}

/**
 * Extract the DB column names from a Drizzle table object by inspecting
 * its enumerable keys that look like Drizzle column definitions.
 */
function getDrizzleColumnNames(tableExportName: string): Set<string> {
  const tableObj = (schema as Record<string, unknown>)[tableExportName];
  if (!tableObj || typeof tableObj !== 'object') return new Set();

  const colNames = new Set<string>();
  for (const key of Object.keys(tableObj)) {
    const val = (tableObj as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && val !== null) {
      const inner = val as Record<string, unknown>;
      // Drizzle column objects have a 'name' property (the DB column name)
      // and a 'columnType' property
      if (typeof inner.name === 'string' && typeof inner.columnType === 'string') {
        colNames.add(inner.name);
      }
    }
  }
  return colNames;
}

describe('Drizzle schema parity', () => {
  let db: Database.Database;

  beforeAll(() => {
    db = createFreshDb();
  });

  beforeAll(async () => {
    await ensureCriticalColumns(wrapBetterSqliteToAsync(db));
  });

  afterAll(() => {
    db.close();
  });

  test('every Drizzle table export maps to a real DB table', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));

    for (const [, dbTableName] of Object.entries(DRIZZLE_TABLE_MAP)) {
      expect(tableNames.has(dbTableName)).toBe(true);
    }
  });

  test('every DB table has a Drizzle definition', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const drizzleDbNames = new Set(Object.values(DRIZZLE_TABLE_MAP));

    for (const t of tables) {
      expect(drizzleDbNames.has(t.name)).toBe(true);
    }
  });

  test('every Drizzle column exists in the DB', () => {
    const mismatches: string[] = [];
    for (const [exportName, dbTableName] of Object.entries(DRIZZLE_TABLE_MAP)) {
      const columns = db.prepare(`PRAGMA table_info("${dbTableName}")`).all() as ColumnInfo[];
      const dbColNames = new Set(columns.map((c) => c.name));
      const drizzleColNames = getDrizzleColumnNames(exportName);

      for (const colName of drizzleColNames) {
        if (!dbColNames.has(colName)) {
          mismatches.push(`${dbTableName}.${colName} (from Drizzle ${exportName})`);
        }
      }
    }
    if (mismatches.length > 0) {
      throw new Error(`Drizzle columns missing from DB:\n${mismatches.join('\n')}`);
    }
  });

  test('no extra DB columns missing from Drizzle schema', () => {
    const missingColumns: string[] = [];
    for (const [exportName, dbTableName] of Object.entries(DRIZZLE_TABLE_MAP)) {
      const columns = db.prepare(`PRAGMA table_info("${dbTableName}")`).all() as ColumnInfo[];
      const drizzleColNames = getDrizzleColumnNames(exportName);

      for (const col of columns) {
        if (!drizzleColNames.has(col.name)) {
          missingColumns.push(`${dbTableName}.${col.name} (missing in Drizzle ${exportName})`);
        }
      }
    }
    if (missingColumns.length > 0) {
      throw new Error(`DB columns missing from Drizzle schema:\n${missingColumns.join('\n')}`);
    }
  });
});
