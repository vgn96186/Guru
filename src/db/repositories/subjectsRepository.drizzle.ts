/**
 * Drizzle-backed subjects repository.
 *
 * Mirrors subject read operations from db/queries/topics.ts.
 */

import { asc, eq, sql } from 'drizzle-orm';
import type { Subject } from '../../types';
import { getDrizzleDb } from '../drizzle';
import { subjects } from '../drizzleSchema';

function mapSubjectRow(row: typeof subjects.$inferSelect): Subject {
  return {
    id: row.id,
    name: row.name,
    shortCode: row.shortCode,
    colorHex: row.colorHex,
    inicetWeight: row.inicetWeight,
    neetWeight: row.neetWeight,
    displayOrder: row.displayOrder,
  };
}

export const subjectsRepositoryDrizzle = {
  /** Fetch all subjects sorted by display order. */
  async getAllSubjects(): Promise<Subject[]> {
    const db = getDrizzleDb();
    const rows = await db.select().from(subjects).orderBy(asc(subjects.displayOrder));
    return rows.map(mapSubjectRow);
  },

  /** Fetch a subject by case-insensitive exact name match. */
  async getSubjectByName(name: string): Promise<Subject | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(subjects)
      .where(sql`LOWER(${subjects.name}) = LOWER(${name})`)
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return mapSubjectRow(rows[0]);
  },

  /** Fetch a subject by primary key id. */
  async getSubjectById(id: number): Promise<Subject | null> {
    const db = getDrizzleDb();
    const rows = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);

    if (rows.length === 0) {
      return null;
    }

    return mapSubjectRow(rows[0]);
  },
};
