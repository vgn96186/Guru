import { getDb, nowTs, todayStr } from '../database';
import type { StudySession, Mood, SessionMode } from '../../types';

export function getTotalStudyMinutes(): number {
  const db = getDb();
  const r = db.getFirstSync<{ total: number }>(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE ended_at IS NOT NULL',
  );
  return r?.total ?? 0;
}

export function getCompletedSessionCount(): number {
  const db = getDb();
  const r = db.getFirstSync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sessions WHERE ended_at IS NOT NULL',
  );
  return r?.cnt ?? 0;
}

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

export function getCompletedTopicIdsBetween(startTs: number, endTs?: number): number[] {
  const db = getDb();
  const rows = endTs == null
    ? db.getAllSync<{ completed_topics: string }>(
        'SELECT completed_topics FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ?',
        [startTs],
      )
    : db.getAllSync<{ completed_topics: string }>(
        'SELECT completed_topics FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?',
        [startTs, endTs],
      );

  return rows.flatMap((row) => {
    try {
      return JSON.parse(row.completed_topics) as number[];
    } catch {
      return [];
    }
  });
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

  // Find top 3 hours, ensuring no duplicates
  const sorted = Object.entries(hourCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([h]) => parseInt(h, 10));
    
  // If we have enough history, return top 3 unique hours
  if (sorted.length >= 3) return sorted.slice(0, 3);
  
  // Otherwise mix with defaults, ensuring uniqueness
  const defaults = [9, 19, 21];
  const uniqueHours: number[] = [];
  
  for (const hour of [...sorted, ...defaults]) {
    if (!uniqueHours.includes(hour)) {
      uniqueHours.push(hour);
    }
    if (uniqueHours.length >= 3) break;
  }
  
  return uniqueHours.sort((a, b) => a - b);
}

/** Get weekly stats: this week vs last week */
export function getWeeklyComparison(): { thisWeek: { minutes: number; sessions: number; topics: number }; lastWeek: { minutes: number; sessions: number; topics: number } } {
  const db = getDb();
  const now = Date.now();
  const dayMs = 86400000;
  
  // Get start of this week (Monday)
  const today = new Date(now);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = now - mondayOffset * dayMs - (today.getHours() * 3600000 + today.getMinutes() * 60000 + today.getSeconds() * 1000);
  const lastWeekStart = thisWeekStart - 7 * dayMs;
  
  const thisWeekRows = db.getAllSync<{ duration_minutes: number; completed_topics: string }>(
    `SELECT duration_minutes, completed_topics FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ?`,
    [thisWeekStart]
  );
  
  const lastWeekRows = db.getAllSync<{ duration_minutes: number; completed_topics: string }>(
    `SELECT duration_minutes, completed_topics FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND started_at < ?`,
    [lastWeekStart, thisWeekStart]
  );
  
  const calcStats = (rows: { duration_minutes: number; completed_topics: string }[]) => {
    let minutes = 0;
    let topics = 0;
    for (const r of rows) {
      minutes += r.duration_minutes ?? 0;
      try { topics += JSON.parse(r.completed_topics).length; } catch { }
    }
    return { minutes, sessions: rows.length, topics };
  };
  
  return {
    thisWeek: calcStats(thisWeekRows),
    lastWeek: calcStats(lastWeekRows),
  };
}

/** Calculate current streak from daily_log */
export function calculateCurrentStreak(): number {
  const db = getDb();
  const rows = db.getAllSync<{ date: string; total_minutes: number; session_count: number }>(
    `SELECT date, total_minutes, session_count FROM daily_log ORDER BY date DESC LIMIT 90`
  );
  
  if (rows.length === 0) return 0;
  
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  // Check if today or yesterday has activity (streak can start from either)
  const firstActive = rows[0];
  if (firstActive.date !== today && firstActive.date !== yesterday) return 0;
  
  let expectedDate = new Date(firstActive.date);
  
  for (const log of rows) {
    const logDate = log.date;
    const expected = expectedDate.toISOString().slice(0, 10);
    
    if (logDate === expected && (log.total_minutes > 0 || log.session_count > 0)) {
      streak++;
      expectedDate = new Date(expectedDate.getTime() - 86400000);
    } else if (logDate < expected) {
      // Gap found
      break;
    }
  }
  
  return streak;
}
