export interface WeeklySessionRow {
  startedAt: number;
  durationMinutes: number;
  completedTopicsJson: string;
}

export interface WeeklySummary {
  minutes: number;
  sessions: number;
  topics: number;
}

export function getWeekBoundaries(nowTs: number = Date.now()): {
  thisWeekStart: number;
  lastWeekStart: number;
} {
  const dayMs = 86_400_000;
  const today = new Date(nowTs);
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const midnightOffsetMs =
    today.getHours() * 3_600_000 +
    today.getMinutes() * 60_000 +
    today.getSeconds() * 1_000 +
    today.getMilliseconds();
  const thisWeekStart = nowTs - mondayOffset * dayMs - midnightOffsetMs;
  const lastWeekStart = thisWeekStart - 7 * dayMs;
  return { thisWeekStart, lastWeekStart };
}

export function summarizeWeeklyRows(rows: WeeklySessionRow[]): WeeklySummary {
  let minutes = 0;
  let topics = 0;

  for (const row of rows) {
    minutes += row.durationMinutes || 0;
    try {
      topics += JSON.parse(row.completedTopicsJson).length;
    } catch {
      // Ignore malformed historical rows.
    }
  }

  return { minutes, sessions: rows.length, topics };
}

export interface DailyStreakRow {
  date: string;
  totalMinutes: number;
  sessionCount: number;
}

export function calculateCurrentStreakFromDailyLogs(
  rows: DailyStreakRow[],
  now: Date = new Date(),
): number {
  if (rows.length === 0) return 0;

  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const firstActive = rows[0];

  if (firstActive.date !== today && firstActive.date !== yesterday) return 0;

  let streak = 0;
  let expectedDate = new Date(firstActive.date);

  for (const row of rows) {
    const expected = expectedDate.toISOString().slice(0, 10);
    const hasActivity = row.totalMinutes > 0 || row.sessionCount > 0;

    if (row.date === expected && hasActivity) {
      streak += 1;
      expectedDate = new Date(expectedDate.getTime() - 86_400_000);
      continue;
    }

    if (row.date < expected) break;
  }

  return streak;
}
