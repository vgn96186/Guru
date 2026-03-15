import { getDb } from '../database';
import type { DailyAgenda } from '../../services/ai';

export const dailyAgendaRepository = {
  getDailyAgenda: async (date: string): Promise<DailyAgenda | null> => {
    const db = getDb();
    const row = await db.getFirstAsync<{ plan_json: string }>(
      'SELECT plan_json FROM daily_agenda WHERE date = ?',
      [date],
    );
    if (!row) return null;
    return JSON.parse(row.plan_json);
  },

  saveDailyAgenda: async (
    date: string,
    plan: DailyAgenda,
    source: string = 'guru',
  ): Promise<void> => {
    const db = getDb();
    const now = Date.now();
    const planJson = JSON.stringify(plan);
    await db.runAsync(
      `INSERT OR REPLACE INTO daily_agenda (date, plan_json, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [date, planJson, source, now, now],
    );
  },

  deleteDailyAgenda: async (date: string): Promise<void> => {
    const db = getDb();
    await db.runAsync('DELETE FROM daily_agenda WHERE date = ?', [date]);
  },

  logPlanEvent: async (date: string, eventType: string, payload: any): Promise<void> => {
    const db = getDb();
    await db.runAsync(
      'INSERT INTO plan_events (date, event_type, payload_json, created_at) VALUES (?, ?, ?, ?)',
      [date, eventType, JSON.stringify(payload), Date.now()],
    );
  },
};
