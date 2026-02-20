export function getTotalStudyMinutes(): number {
  const db = getDb();
  const r = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE ended_at IS NOT NULL',
  );
  return r?.total ?? 0;
}
import { getDb, nowTs, todayStr } from '../database';
import type { StudySession, Mood, SessionMode } from '../../types';

export function createSession(
  plannedTopics: number[],
  mood: Mood | null,
  mode: SessionMode,
): number {
  const db = getDb();
  const result = db.runSync(
    `INSERT INTO sessions (started_at, planned_topics, mood, mode)
     VALUES (?, ?, ?, ?)`,
    [nowTs(), JSON.stringify(plannedTopics), mood, mode],
  );
  return result.lastInsertRowId;
}

export function endSession(
  sessionId: number,
  completedTopics: number[],
  xpEarned: number,
  durationMinutes: number,
  notes?: string,
): void {
  const db = getDb();
  db.runSync(
    `UPDATE sessions
     SET ended_at = ?, completed_topics = ?, total_xp_earned = ?, duration_minutes = ?, notes = ?
     WHERE id = ?`,
    [nowTs(), JSON.stringify(completedTopics), xpEarned, durationMinutes, notes ?? null, sessionId],
  );

  // Update daily log
  db.runSync(
    `INSERT INTO daily_log (date, session_count, total_minutes, xp_earned)
     VALUES (?, 1, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       session_count = session_count + 1,
       total_minutes = total_minutes + excluded.total_minutes,
       xp_earned = xp_earned + excluded.xp_earned`,
    [todayStr(), durationMinutes, xpEarned],
  );
}

export function getRecentSessions(limit = 7): StudySession[] {
  const db = getDb();
  const rows = db.getAllSync<{
    id: number; started_at: number; ended_at: number | null;
    planned_topics: string; completed_topics: string;
    total_xp_earned: number; duration_minutes: number | null;
    mood: string | null; mode: string;
  }>(
    'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?',
    [limit],
  );
  return rows.map(r => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    plannedTopics: JSON.parse(r.planned_topics),
    completedTopics: JSON.parse(r.completed_topics),
    totalXpEarned: r.total_xp_earned,
    durationMinutes: r.duration_minutes,
    mood: r.mood as Mood | null,
    mode: r.mode as SessionMode,
  }));
}

export function getRecentlyStudiedTopicNames(sessionCount = 3): string[] {
  const db = getDb();
  const rows = db.getAllSync<{ completed_topics: string }>(
    'SELECT completed_topics FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?',
    [sessionCount],
  );
  const topicIds = rows.flatMap(r => JSON.parse(r.completed_topics) as number[]);
  if (topicIds.length === 0) return [];
  const placeholders = topicIds.map(() => '?').join(',');
  const nameRows = db.getAllSync<{ name: string }>(
    `SELECT name FROM topics WHERE id IN (${placeholders})`,
    topicIds,
  );
  return nameRows.map(r => r.name);
}

export function getPreferredStudyHours(): number[] {
  const db = getDb();
  // Get all session start times
  const rows = db.getAllSync<{ started_at: number }>(
    'SELECT started_at FROM sessions WHERE duration_minutes >= 10 ORDER BY started_at DESC LIMIT 50'
  );
  
  if (rows.length === 0) return [9, 14, 19]; // Default: 9am, 2pm, 7pm

  const hourCounts: Record<number, number> = {};
  for (const r of rows) {
    const hour = new Date(r.started_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  }

  // Find top 3 hours
  const sorted = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([h]) => parseInt(h, 10));
    
  // If we have enough history, return top 3. Otherwise mix with defaults.
  if (sorted.length >= 3) return sorted.slice(0, 3);
  
  const defaults = [9, 19, 21];
  return Array.from(new Set([...sorted, ...defaults])).slice(0, 3).sort((a, b) => a - b);
}
