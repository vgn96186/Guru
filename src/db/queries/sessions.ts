import { dateStr, getDb, runInTransaction, nowTs, todayStr } from '../database';
import { MS_PER_DAY } from '../../constants/time';
import type { StudySession, Mood, SessionMode } from '../../types';

/** Safe JSON.parse with a typed fallback — prevents one bad row from crashing a query. */
function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

type WeeklyStatsBucket = {
  minutes: number;
  sessions: number;
  topics: number;
};

export async function getTotalStudyMinutes(): Promise<number> {
  const db = getDb();
  const r = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(duration_minutes), 0) as total FROM sessions WHERE ended_at IS NOT NULL',
  );
  return r?.total ?? 0;
}

export async function getCompletedSessionCount(): Promise<number> {
  const db = getDb();
  const r = await db.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM sessions WHERE ended_at IS NOT NULL',
  );
  return r?.cnt ?? 0;
}

export async function createSession(
  plannedTopics: number[],
  mood: Mood | null,
  mode: SessionMode,
): Promise<number> {
  const db = getDb();
  const result = await db.runAsync(
    `INSERT INTO sessions (started_at, planned_topics, mood, mode)
     VALUES (?, ?, ?, ?)`,
    [nowTs(), JSON.stringify(plannedTopics), mood, mode],
  );
  return result.lastInsertRowId;
}

/** True if this session row already has ended_at (avoid double endSession / daily_log inflation). */
export async function isSessionAlreadyFinalized(sessionId: number): Promise<boolean> {
  const db = getDb();
  const r = await db.getFirstAsync<{ ended_at: number | null }>(
    'SELECT ended_at FROM sessions WHERE id = ?',
    [sessionId],
  );
  return r != null && r.ended_at != null;
}

export async function endSession(
  sessionId: number,
  completedTopics: number[],
  xpEarned: number,
  durationMinutes: number,
  notes?: string,
): Promise<void> {
  await runInTransaction(async (tx) => {
    // Guard: skip if already finalized to prevent daily_log double-count on retry
    const row = await tx.getFirstAsync<{ ended_at: number | null }>(
      'SELECT ended_at FROM sessions WHERE id = ?',
      [sessionId],
    );
    if (row?.ended_at != null) return;

    await tx.runAsync(
      `UPDATE sessions
       SET ended_at = ?, completed_topics = ?, total_xp_earned = ?, duration_minutes = ?, notes = ?
       WHERE id = ?`,
      [
        nowTs(),
        JSON.stringify(completedTopics),
        xpEarned,
        durationMinutes,
        notes ?? null,
        sessionId,
      ],
    );
    await tx.runAsync(
      `INSERT INTO daily_log (date, session_count, total_minutes, xp_earned)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         session_count = session_count + 1,
         total_minutes = total_minutes + excluded.total_minutes,
         xp_earned = xp_earned + excluded.xp_earned`,
      [todayStr(), durationMinutes, xpEarned],
    );
  });
}

/**
 * Periodic update for a running session (e.g. during Hostage Mode)
 * to ensure data is not lost if the app is killed.
 */
export async function updateSessionProgress(
  sessionId: number,
  durationMinutes: number,
  xpEarned: number,
  completedTopics: number[] = [],
  notes?: string,
): Promise<void> {
  const today = todayStr();
  await runInTransaction(async (tx) => {
    const prev = await tx.getFirstAsync<{ duration_minutes: number; total_xp_earned: number }>(
      'SELECT COALESCE(duration_minutes, 0) as duration_minutes, COALESCE(total_xp_earned, 0) as total_xp_earned FROM sessions WHERE id = ?',
      [sessionId],
    );
    const deltaMins = durationMinutes - (prev?.duration_minutes ?? 0);
    const deltaXp = xpEarned - (prev?.total_xp_earned ?? 0);

    await tx.runAsync(
      `UPDATE sessions
       SET completed_topics = ?, total_xp_earned = ?, duration_minutes = ?, notes = ?
       WHERE id = ?`,
      [JSON.stringify(completedTopics), xpEarned, durationMinutes, notes ?? null, sessionId],
    );

    if (deltaMins > 0 || deltaXp > 0) {
      await tx.runAsync(
        `INSERT INTO daily_log (date, session_count, total_minutes, xp_earned)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           total_minutes = total_minutes + ?,
           xp_earned = xp_earned + ?`,
        [
          today,
          Math.max(0, deltaMins),
          Math.max(0, deltaXp),
          Math.max(0, deltaMins),
          Math.max(0, deltaXp),
        ],
      );
    }
  });
}

export async function getRecentSessions(limit = 7): Promise<StudySession[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: number;
    started_at: number;
    ended_at: number | null;
    planned_topics: string;
    completed_topics: string;
    total_xp_earned: number;
    duration_minutes: number | null;
    mood: string | null;
    mode: string;
  }>('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?', [limit]);
  return rows.map((r) => ({
    id: r.id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    plannedTopics: safeJsonParse<number[]>(r.planned_topics, []),
    completedTopics: safeJsonParse<number[]>(r.completed_topics, []),
    totalXpEarned: r.total_xp_earned,
    durationMinutes: r.duration_minutes,
    mood: r.mood as Mood | null,
    mode: r.mode as SessionMode,
  }));
}

export async function getRecentlyStudiedTopicNames(sessionCount = 3): Promise<string[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ completed_topics: string }>(
    'SELECT completed_topics FROM sessions WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?',
    [sessionCount],
  );
  const topicIds = rows.flatMap((r) => safeJsonParse<number[]>(r.completed_topics, []));
  if (topicIds.length === 0) return [];
  const placeholders = topicIds.map(() => '?').join(',');
  const nameRows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM topics WHERE id IN (${placeholders})`,
    topicIds,
  );
  return nameRows.map((r) => r.name);
}

export async function getCompletedTopicIdsBetween(
  startTs: number,
  endTs?: number,
): Promise<number[]> {
  const db = getDb();
  const rows =
    endTs == null
      ? await db.getAllAsync<{ completed_topics: string }>(
          'SELECT completed_topics FROM sessions WHERE ended_at IS NOT NULL AND started_at >= ?',
          [startTs],
        )
      : await db.getAllAsync<{ completed_topics: string }>(
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

export async function getPreferredStudyHours(): Promise<number[]> {
  const db = getDb();
  // Get all session start times
  const rows = await db.getAllAsync<{ started_at: number }>(
    'SELECT started_at FROM sessions WHERE duration_minutes >= 10 ORDER BY started_at DESC LIMIT 50',
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
export async function getWeeklyComparison(): Promise<{
  thisWeek: WeeklyStatsBucket;
  lastWeek: WeeklyStatsBucket;
}> {
  const db = getDb();
  const now = Date.now();
  const dayMs = MS_PER_DAY;

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

  const rows = await db.getAllAsync<{
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
    [thisWeekStart, lastWeekStart],
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
export async function calculateCurrentStreak(): Promise<number> {
  const db = getDb();
  const today = todayStr();
  const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));
  const result = await db.getFirstAsync<{ streak: number }>(
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
    [today, today, yesterday, yesterday],
  );

  return result?.streak ?? 0;
}
