import { getDb, todayStr, dateStr } from '../database';
import type { UserProfile, DailyLog, Mood } from '../../types';
import { LEVELS } from '../../constants/gamification';

// ── User Profile ─────────────────────────────────────────────────

export function getUserProfile(): UserProfile {
  const db = getDb();
  const r = db.getFirstSync<{
    display_name: string; total_xp: number; current_level: number;
    streak_current: number; streak_best: number; daily_goal_minutes: number;
    inicet_date: string; neet_date: string; preferred_session_length: number;
    openrouter_api_key: string; openai_key: string; transcription_engine: string;
    notifications_enabled: number; last_active_date: string | null;
    strict_mode_enabled: number;
    focus_audio_enabled: number;
    visual_timers_enabled: number;
  }>('SELECT * FROM user_profile WHERE id = 1');

  if (!r) {
    return {
      displayName: 'Doctor', totalXp: 0, currentLevel: 1,
      streakCurrent: 0, streakBest: 0, dailyGoalMinutes: 120,
      inicetDate: '2026-05-01', neetDate: '2026-08-01',
      preferredSessionLength: 45, openrouterApiKey: '', openaiKey: '', transcriptionEngine: 'gemini',
      notificationsEnabled: true, lastActiveDate: null,
      strictModeEnabled: false,
      focusAudioEnabled: false,
      visualTimersEnabled: false,
    };
  }

  return {
    displayName: r.display_name,
    totalXp: r.total_xp,
    currentLevel: r.current_level,
    streakCurrent: r.streak_current,
    streakBest: r.streak_best,
    dailyGoalMinutes: r.daily_goal_minutes,
    inicetDate: r.inicet_date,
    neetDate: r.neet_date,
    preferredSessionLength: r.preferred_session_length,
    openrouterApiKey: r.openrouter_api_key,
    openaiKey: r.openai_key ?? '',
    transcriptionEngine: (r.transcription_engine ?? 'gemini') as 'gemini' | 'openai',
    notificationsEnabled: r.notifications_enabled === 1,
    lastActiveDate: r.last_active_date,
    strictModeEnabled: r.strict_mode_enabled === 1,
    focusAudioEnabled: r.focus_audio_enabled === 1,
    visualTimersEnabled: r.visual_timers_enabled === 1,
  };
}

export function updateUserProfile(updates: Partial<UserProfile>): void {
  const db = getDb();
  const map: Record<string, string> = {
    displayName: 'display_name',
    totalXp: 'total_xp',
    currentLevel: 'current_level',
    streakCurrent: 'streak_current',
    streakBest: 'streak_best',
    dailyGoalMinutes: 'daily_goal_minutes',
    inicetDate: 'inicet_date',
    neetDate: 'neet_date',
    preferredSessionLength: 'preferred_session_length',
    openrouterApiKey: 'openrouter_api_key',
    openaiKey: 'openai_key',
    transcriptionEngine: 'transcription_engine',
    notificationsEnabled: 'notifications_enabled',
    lastActiveDate: 'last_active_date',
    strictModeEnabled: 'strict_mode_enabled',
    focusAudioEnabled: 'focus_audio_enabled',
    visualTimersEnabled: 'visual_timers_enabled',
  };

  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, col] of Object.entries(map)) {
    if (key in updates) {
      setClauses.push(`${col} = ?`);
      const val = (updates as Record<string, unknown>)[key];
      values.push(typeof val === 'boolean' ? (val ? 1 : 0) : (val as string | number | null));
    }
  }

  if (setClauses.length === 0) return;
  values.push(1); // WHERE id = 1
  db.runSync(`UPDATE user_profile SET ${setClauses.join(', ')} WHERE id = ?`, values);
}

export function addXp(amount: number): { newTotal: number; leveledUp: boolean; newLevel: number } {
  const db = getDb();
  const profile = getUserProfile();
  const newTotal = profile.totalXp + amount;

  let newLevel = profile.currentLevel;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newTotal >= LEVELS[i].xpRequired) {
      newLevel = LEVELS[i].level;
      break;
    }
  }

  const leveledUp = newLevel > profile.currentLevel;
  db.runSync(
    'UPDATE user_profile SET total_xp = ?, current_level = ? WHERE id = 1',
    [newTotal, newLevel],
  );
  return { newTotal, leveledUp, newLevel };
}

export function updateStreak(studiedToday: boolean): void {
  const db = getDb();
  const today = todayStr();
  const profile = getUserProfile();

  if (profile.lastActiveDate === today) return; // already hit streak today
  if (!studiedToday) return; // don't increment, but don't reset either (handled on open)

  const yesterday = dateStr(new Date(Date.now() - 86400000));
  const newStreak = profile.lastActiveDate === yesterday ? profile.streakCurrent + 1 : 1;

  const newBest = Math.max(newStreak, profile.streakBest);
  db.runSync(
    'UPDATE user_profile SET streak_current = ?, streak_best = ?, last_active_date = ? WHERE id = 1',
    [newStreak, newBest, today],
  );
}

// ── Daily Log ─────────────────────────────────────────────────────

export function getDailyLog(date?: string): DailyLog | null {
  const db = getDb();
  const d = date ?? todayStr();
  const r = db.getFirstSync<{
    date: string; checked_in: number; mood: string | null;
    total_minutes: number; xp_earned: number; session_count: number;
  }>('SELECT * FROM daily_log WHERE date = ?', [d]);
  if (!r) return null;
  return {
    date: r.date,
    checkedIn: r.checked_in === 1,
    mood: r.mood as Mood | null,
    totalMinutes: r.total_minutes,
    xpEarned: r.xp_earned,
    sessionCount: r.session_count,
  };
}

export function checkinToday(mood: Mood): void {
  const db = getDb();
  const today = todayStr();
  db.runSync(
    `INSERT INTO daily_log (date, checked_in, mood)
     VALUES (?, 1, ?)
     ON CONFLICT(date) DO UPDATE SET checked_in = 1, mood = excluded.mood`,
    [today, mood],
  );
}

export function getLast30DaysLog(): DailyLog[] {
  return getActivityHistory(30);
}

export function getActivityHistory(days = 90): DailyLog[] {
  const db = getDb();
  const rows = db.getAllSync<{
    date: string; checked_in: number; mood: string | null;
    total_minutes: number; xp_earned: number; session_count: number;
  }>(
    `SELECT * FROM daily_log ORDER BY date DESC LIMIT ?`,
    [days]
  );
  return rows.map(r => ({
    date: r.date,
    checkedIn: r.checked_in === 1,
    mood: r.mood as Mood | null,
    totalMinutes: r.total_minutes,
    xpEarned: r.xp_earned,
    sessionCount: r.session_count,
  }));
}

export function getDaysToExam(dateStr: string): number {
  const exam = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((exam - now) / 86400000));
}
