import Database from 'better-sqlite3';
import { drizzle as drizzleBetterSqlite } from 'drizzle-orm/better-sqlite3';

const mockGetInfoAsync = jest.fn(async () => ({ exists: false }));
const mockMakeDirectoryAsync = jest.fn(async () => {});
const mockCopyAsync = jest.fn(async () => {});
let mockDrizzleDb: unknown;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock-docs/',
  getInfoAsync: mockGetInfoAsync,
  makeDirectoryAsync: mockMakeDirectoryAsync,
  copyAsync: mockCopyAsync,
}));

jest.mock('./drizzle', () => ({
  getDrizzleDb: () => mockDrizzleDb,
  resetDrizzleDb: jest.fn(),
}));

import { resetDbSingleton, setDbForTests } from './database';
import migrations from './drizzle-migrations/migrations';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import * as drizzleSchema from './drizzleSchema';
import { wrapBetterSqliteToAsync } from './testing/betterSqliteAdapter';

import { addBrainDump, clearBrainDumps, getBrainDumps } from './queries/brainDumps';
import {
  createMindMap,
  addNode,
  findTopicsByLabel,
  listMindMaps,
  loadFullMindMap,
} from './queries/mindMaps';
import {
  getCompletedLectures,
  markLectureCompleted,
  unmarkLectureCompleted,
} from './queries/lectureSchedule';

import { brainDumpsRepositoryDrizzle } from './repositories/brainDumpsRepository.drizzle';
import { mindMapsRepositoryDrizzle } from './repositories/mindMapsRepository.drizzle';
import { lectureScheduleRepositoryDrizzle } from './repositories/lectureScheduleRepository.drizzle';

describe('Drizzle query parity (in-memory SQLite)', () => {
  let rawDb: Database.Database | null = null;
  let dispose: (() => void) | null = null;

  beforeEach(async () => {
    resetDbSingleton();
    rawDb = new Database(':memory:');
    rawDb.pragma('journal_mode = DELETE');
    rawDb.pragma('foreign_keys = ON');

    rawDb.exec(`
      CREATE TABLE IF NOT EXISTS migration_history (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        description TEXT
      )
    `);

    const sqlite = wrapBetterSqliteToAsync(rawDb);
    mockDrizzleDb = drizzleBetterSqlite(rawDb, { schema: drizzleSchema });
    dispose = () => {
      rawDb?.close();
      rawDb = null;
    };
    setDbForTests(sqlite);
    await migrate(mockDrizzleDb as any, migrations);
    rawDb.prepare(`INSERT OR IGNORE INTO user_profile (id) VALUES (1)`).run();
  });

  afterEach(() => {
    setDbForTests(null);
    resetDbSingleton();
    dispose?.();
    dispose = null;
    mockDrizzleDb = null;
    jest.restoreAllMocks();
  });

  async function seedSubjectAndTopics(): Promise<void> {
    const db = (await import('./database')).getDb();

    await db.runAsync(
      `INSERT INTO subjects
        (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [1, 'Medicine', 'MED', '#0055FF', 10, 10, 1],
    );

    await db.runAsync(
      `INSERT INTO topics
        (id, subject_id, parent_topic_id, name, estimated_minutes, inicet_priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [101, 1, null, 'Renal medicine', 30, 8],
    );

    await db.runAsync(
      `INSERT INTO topics
        (id, subject_id, parent_topic_id, name, estimated_minutes, inicet_priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [102, 1, 101, 'Nephrotic syndrome', 25, 9],
    );

    await db.runAsync(
      `INSERT INTO topics
        (id, subject_id, parent_topic_id, name, estimated_minutes, inicet_priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [103, 1, 101, 'Acute kidney injury', 20, 7],
    );
  }

  it('matches legacy brain dump reads after writes', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1718000000000);

    await addBrainDump('Review nephrotic syndrome');
    await addBrainDump('Revise AKI staging');

    const legacy = await getBrainDumps();
    const drizzle = await brainDumpsRepositoryDrizzle.getBrainDumps();

    expect(drizzle).toEqual(legacy);

    await clearBrainDumps();
    await expect(brainDumpsRepositoryDrizzle.getBrainDumps()).resolves.toEqual([]);
  });

  it('matches legacy lecture schedule reads after completion and undo', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1718001000000);

    await markLectureCompleted('btr', 2);
    await markLectureCompleted('btr', 5);
    await lectureScheduleRepositoryDrizzle.markLectureCompleted('btr', 7);

    expect(await lectureScheduleRepositoryDrizzle.getCompletedLectures('btr')).toEqual(
      await getCompletedLectures('btr'),
    );

    await unmarkLectureCompleted('btr', 5);

    expect(await lectureScheduleRepositoryDrizzle.getCompletedLectures('btr')).toEqual(
      await getCompletedLectures('btr'),
    );

    await lectureScheduleRepositoryDrizzle.unmarkLectureCompleted('btr', 7);

    expect(await lectureScheduleRepositoryDrizzle.getCompletedLectures('btr')).toEqual(
      await getCompletedLectures('btr'),
    );
  });

  it('matches legacy mind-map list/load/search outputs on the same dataset', async () => {
    await seedSubjectAndTopics();
    jest.spyOn(Date, 'now').mockReturnValue(1718003000000);

    const mapId = await createMindMap('Renal connections', 1, 101);
    const centerNodeId = await addNode(mapId, 'Renal medicine', 10, 20, {
      topicId: 101,
      isCenter: true,
      color: '#0055FF',
    });
    const childNodeId = await addNode(mapId, 'Nephrotic syndrome', 30, 40, {
      topicId: 102,
      aiGenerated: true,
    });
    void centerNodeId;
    void childNodeId;

    expect(await mindMapsRepositoryDrizzle.listMindMaps()).toEqual(await listMindMaps());
    expect(await mindMapsRepositoryDrizzle.loadFullMindMap(mapId)).toEqual(
      await loadFullMindMap(mapId),
    );
    expect(await mindMapsRepositoryDrizzle.findTopicsByLabel('renal')).toEqual(
      await findTopicsByLabel('renal'),
    );
  });
});
