import { getDb } from '../database';

export interface BrainDumpLog {
  id: number;
  note: string;
  createdAt: number;
}

export async function addBrainDump(note: string): Promise<number> {
  if (!note.trim()) return -1;
  const db = getDb();
  const now = Date.now();
  const result = await db.runAsync('INSERT INTO brain_dumps (note, created_at) VALUES (?, ?)', [
    note,
    now,
  ]);
  return result.lastInsertRowId;
}

export async function getBrainDumps(): Promise<BrainDumpLog[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    note: string;
    created_at: number;
  }>('SELECT * FROM brain_dumps ORDER BY created_at DESC');

  return rows.map((r) => ({
    id: r.id,
    note: r.note,
    createdAt: r.created_at,
  }));
}

export async function clearBrainDumps(): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM brain_dumps');
}

export async function deleteBrainDump(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync('DELETE FROM brain_dumps WHERE id = ?', [id]);
}
