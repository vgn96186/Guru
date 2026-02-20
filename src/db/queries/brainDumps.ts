import { getDb } from '../database';

export interface BrainDumpLog {
    id: number;
    note: string;
    createdAt: number;
}

export function addBrainDump(note: string): number {
    if (!note.trim()) return -1;
    const db = getDb();
    const now = Date.now();
    const result = db.runSync(
        'INSERT INTO brain_dumps (note, created_at) VALUES (?, ?)',
        [note, now]
    );
    return result.lastInsertRowId;
}

export function getBrainDumps(): BrainDumpLog[] {
    const db = getDb();
    const rows = db.getAllSync<{
        id: number;
        note: string;
        created_at: number;
    }>('SELECT * FROM brain_dumps ORDER BY created_at DESC');

    return rows.map(r => ({
        id: r.id,
        note: r.note,
        createdAt: r.created_at,
    }));
}

export function clearBrainDumps(): void {
    const db = getDb();
    db.runSync('DELETE FROM brain_dumps');
}
