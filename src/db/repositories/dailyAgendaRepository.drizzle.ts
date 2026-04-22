import { desc, eq } from 'drizzle-orm';
import type { DailyAgenda } from '../../services/ai';
import { getDrizzleDb } from '../drizzle';
import { dailyAgenda, planEvents } from '../drizzleSchema';

type DailyAgendaRow = typeof dailyAgenda.$inferSelect;

function parseDailyAgenda(row: DailyAgendaRow): DailyAgenda {
  return JSON.parse(row.planJson) as DailyAgenda;
}

export const dailyAgendaRepositoryDrizzle = {
  async getDailyAgenda(date: string): Promise<DailyAgenda | null> {
    const db = getDrizzleDb();
    const rows = await db
      .select()
      .from(dailyAgenda)
      .where(eq(dailyAgenda.date, date))
      .orderBy(desc(dailyAgenda.id))
      .limit(1);

    if (rows.length === 0) return null;
    return parseDailyAgenda(rows[0]);
  },

  async saveDailyAgenda(date: string, plan: DailyAgenda, source = 'guru'): Promise<void> {
    const db = getDrizzleDb();
    const now = Date.now();

    await db.delete(dailyAgenda).where(eq(dailyAgenda.date, date));
    await db.insert(dailyAgenda).values({
      date,
      planJson: JSON.stringify(plan),
      source,
      createdAt: now,
      updatedAt: now,
    });
  },

  async deleteDailyAgenda(date: string): Promise<void> {
    const db = getDrizzleDb();
    await db.delete(dailyAgenda).where(eq(dailyAgenda.date, date));
  },

  async logPlanEvent(date: string, eventType: string, payload: unknown): Promise<void> {
    const db = getDrizzleDb();
    await db.insert(planEvents).values({
      date,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: Date.now(),
    });
  },
};
