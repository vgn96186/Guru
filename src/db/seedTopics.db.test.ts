/**
 * End-to-end seed integration test.
 *
 * Runs the full `seedSubjects` + `seedTopics` pipeline against an in-memory
 * better-sqlite3 DB and asserts row counts + parent-link fidelity exactly
 * match the fingerprint in `src/constants/syllabus.snapshot.json`.
 *
 * This is the teeth behind the refactor: if Phase 5's batched multi-VALUES
 * INSERTs drop a row, mis-link a parent, or fail the FK constraint, this
 * test fails before any app code runs.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { resetDbSingleton, setDbForTests, seedSubjects, seedTopics } from './database';
import { createTestDatabase } from './testing/createTestDatabase';

const SNAPSHOT = JSON.parse(
  readFileSync(join(__dirname, '..', 'constants', 'syllabus.snapshot.json'), 'utf8'),
) as {
  subjectsCount: number;
  topicsCount: number;
  topicsWithParent: number;
  perSubjectCounts: Record<string, number>;
};

describe('seedSubjects + seedTopics (integration)', () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    resetDbSingleton();
    const sqlite = createTestDatabase();
    const d = () => {};
    dispose = d;
    setDbForTests(sqlite);
  });

  afterEach(() => {
    setDbForTests(null);
    resetDbSingleton();
    dispose?.();
    dispose = null;
  });

  it('inserts all 19 subjects', async () => {
    const db = (await import('./database')).getDb();
    await seedSubjects(db);
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM subjects');
    expect(row?.c).toBe(SNAPSHOT.subjectsCount);
  });

  it('inserts every topic tuple without data loss and wires parent links', async () => {
    const db = (await import('./database')).getDb();
    await seedSubjects(db);
    await seedTopics(db);

    const topicsRow = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM topics');
    expect(topicsRow?.c).toBe(SNAPSHOT.topicsCount);

    const linked = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM topics WHERE parent_topic_id IS NOT NULL',
    );
    expect(linked?.c).toBe(SNAPSHOT.topicsWithParent);

    // Per-subject counts must match.
    const perSubject = await db.getAllAsync<{ subject_id: number; c: number }>(
      'SELECT subject_id, COUNT(*) AS c FROM topics GROUP BY subject_id',
    );
    const bySubject: Record<string, number> = {};
    for (const { subject_id, c } of perSubject) bySubject[String(subject_id)] = c;
    // Snapshot keyed by subject_id (as string).
    expect(bySubject).toEqual(SNAPSHOT.perSubjectCounts);

    // topic_progress has a row for every topic (INSERT OR IGNORE ... SELECT).
    const progressRow = await db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM topic_progress',
    );
    expect(progressRow?.c).toBe(SNAPSHOT.topicsCount);

    // No dangling parent links: every non-null parent_topic_id points to a
    // topic in the same subject.
    const dangling = await db.getFirstAsync<{ c: number }>(`
      SELECT COUNT(*) AS c
      FROM topics c
      LEFT JOIN topics p ON p.id = c.parent_topic_id
      WHERE c.parent_topic_id IS NOT NULL
        AND (p.id IS NULL OR p.subject_id <> c.subject_id)
    `);
    expect(dangling?.c).toBe(0);
  });

  it('is idempotent: running seedTopics twice leaves row counts unchanged', async () => {
    const db = (await import('./database')).getDb();
    await seedSubjects(db);
    await seedTopics(db);
    await seedTopics(db);
    const row = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) AS c FROM topics');
    expect(row?.c).toBe(SNAPSHOT.topicsCount);
  });
});
