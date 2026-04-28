import { createTestDatabase } from './testing/createTestDatabase';
import { ensureSearchOptimizations } from './database';

describe('ensureSearchOptimizations', () => {
  it('creates vss tables and triggers (or fallbacks) idempotently', async () => {
    const db = createTestDatabase();

    await ensureSearchOptimizations(db);
    await ensureSearchOptimizations(db);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('vss_topics', 'vss_lecture_notes')",
    );
    const tableNames = new Set(tables.map((t) => t.name));
    expect(tableNames.has('vss_topics')).toBe(true);
    expect(tableNames.has('vss_lecture_notes')).toBe(true);

    const triggers = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('lecture_notes_ai_insert','lecture_notes_ai_update','lecture_notes_ai_delete','topics_ai_insert','topics_ai_update','topics_ai_delete')",
    );
    const triggerNames = new Set(triggers.map((t) => t.name));
    expect(triggerNames.has('lecture_notes_ai_insert')).toBe(true);
    expect(triggerNames.has('lecture_notes_ai_update')).toBe(true);
    expect(triggerNames.has('lecture_notes_ai_delete')).toBe(true);
    expect(triggerNames.has('topics_ai_insert')).toBe(true);
    expect(triggerNames.has('topics_ai_update')).toBe(true);
    expect(triggerNames.has('topics_ai_delete')).toBe(true);

    const indexes = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_topics_subject_priority'",
    );
    expect(indexes.length).toBeGreaterThanOrEqual(1);
  });

  it('runs the vec0 setup path when vec0 is available', async () => {
    const execAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest.fn().mockResolvedValue([]);
    const db = { execAsync, getAllAsync } as any;

    await ensureSearchOptimizations(db);

    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE VIRTUAL TABLE IF NOT EXISTS vss_lecture_notes USING vec0'),
    );
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE VIRTUAL TABLE IF NOT EXISTS vss_topics USING vec0'),
    );
  });

  it('falls back to plain tables when vec0 is unavailable', async () => {
    const execAsync = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('no such module: vec0'))
      .mockResolvedValue(undefined);
    const getAllAsync = jest.fn().mockResolvedValue([]);
    const db = { execAsync, getAllAsync } as any;

    await ensureSearchOptimizations(db);

    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS vss_lecture_notes'),
    );
    expect(execAsync).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS vss_topics'),
    );
  });

  it('bails out on unexpected vec0 creation errors', async () => {
    const execAsync = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('SQLITE_CORRUPT: database disk image is malformed'));
    const getAllAsync = jest.fn().mockResolvedValue([]);
    const db = { execAsync, getAllAsync } as any;

    await ensureSearchOptimizations(db);

    expect(execAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS vss_lecture_notes'),
    );
  });
});
