import { dateStr, getDb, nowTs, todayStr } from '../database';
import type { StudySession, Mood, SessionMode } from '../../types';

type WeeklyStatsBucket = {
  minutes: number;
  sessions: number;
  topics: number;
};

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
export function getWeeklyComparison(): { thisWeek: WeeklyStatsBucket; lastWeek: WeeklyStatsBucket } {
  const db = getDb();
  const now = Date.now();
  const dayMs = 86_400_000;

  const today = new Date(now);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const midnightOffsetMs =
    today.getHours() * 3_600_000 +
    today.getMinutes() * 60_000 +
    today.getSeconds() * 1_000 +
    today.getMilliseconds();
  const thisWeekStart = now - mondayOffset * dayMs - midnightOffsetMs;
  const lastWeekStart = thisWeekStart - 7 * dayMs;

  const rows = db.getAllSync<{
    bucket: 'thisWeek' | 'lastWeek';
    minutes: number;
    sessions: number;
    topics: number;
  }>(
    `SELECT
        CASE
          WHEN started_at >= ? THEN 'thisWeek'
          ELSE 'lastWeek'
        END AS bucket,
        COALESCE(SUM(duration_minutes), 0) AS minutes,
        COUNT(*) AS sessions,
        COALESCE(
          SUM(
            CASE
              WHEN json_valid(completed_topics) THEN json_array_length(completed_topics)
              ELSE 0
            END
          ),
          0
        ) AS topics
      FROM sessions
      WHERE ended_at IS NOT NULL
        AND started_at >= ?
      GROUP BY bucket`,
    [thisWeekStart, lastWeekStart]
  );

  const emptyBucket: WeeklyStatsBucket = { minutes: 0, sessions: 0, topics: 0 };
  const stats = rows.reduce<Record<'thisWeek' | 'lastWeek', WeeklyStatsBucket>>(
    (acc, row) => {
      acc[row.bucket] = {
        minutes: row.minutes ?? 0,
        sessions: row.sessions ?? 0,
        topics: row.topics ?? 0,
      };
      return acc;
    },
    {
      thisWeek: { ...emptyBucket },
      lastWeek: { ...emptyBucket },
    },
  );

  return {
    thisWeek: stats.thisWeek,
    lastWeek: stats.lastWeek,
  };
}

/** Calculate current streak from daily_log */
export function calculateCurrentStreak(): number {
  const db = getDb();
  const today = todayStr();
  const yesterday = dateStr(new Date(Date.now() - 86_400_000));
  const result = db.getFirstSync<{ streak: number }>(
    `WITH RECURSIVE
       anchor(day) AS (
         SELECT CASE
           WHEN EXISTS (
             SELECT 1
             FROM daily_log
             WHERE date = ?
               AND (total_minutes > 0 OR session_count > 0)
           ) THEN ?
           WHEN EXISTS (
             SELECT 1
             FROM daily_log
             WHERE date = ?
               AND (total_minutes > 0 OR session_count > 0)
           ) THEN ?
           ELSE NULL
         END
       ),
       streak(day) AS (
         SELECT day
         FROM anchor
         WHERE day IS NOT NULL
         UNION ALL
         SELECT DATE(day, '-1 day')
         FROM streak
         WHERE EXISTS (
           SELECT 1
           FROM daily_log
           WHERE date = DATE(streak.day, '-1 day')
             AND (total_minutes > 0 OR session_count > 0)
         )
       )
     SELECT COUNT(*) AS streak
     FROM streak`,
    [today, today, yesterday, yesterday]
  );

  return result?.streak ?? 0;
}
