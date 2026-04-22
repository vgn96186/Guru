import { desc, eq } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { brainDumps } from '../drizzleSchema';

export interface BrainDumpLog {
  id: number;
  note: string;
  createdAt: number;
}

export type BrainDumpRow = typeof brainDumps.$inferSelect;

function mapBrainDumpRow(row: BrainDumpRow): BrainDumpLog {
  return {
    id: row.id,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export const brainDumpsRepositoryDrizzle = {
  async addBrainDump(note: string): Promise<number> {
    if (!note.trim()) return -1;

    const db = getDrizzleDb();
    const createdAt = Date.now();
    const insertedRows = await db
      .insert(brainDumps)
      .values({
        note,
        createdAt,
      })
      .returning({ id: brainDumps.id });

    return insertedRows[0]?.id ?? 0;
  },

  async getBrainDumps(): Promise<BrainDumpLog[]> {
    const db = getDrizzleDb();
    const rows = await db.select().from(brainDumps).orderBy(desc(brainDumps.createdAt));

    return rows.map(mapBrainDumpRow);
  },

  async clearBrainDumps(): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(brainDumps);
  },

  async deleteBrainDump(id: number): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(brainDumps).where(eq(brainDumps.id, id));
  },
};
