import { getDb, todayStr, dateStr } from '../database';
import type { UserProfile, DailyLog, Mood, ContentType } from '../../types';
import { LEVELS } from '../../constants/gamification';

export function getUserProfile(): UserProfile {
  const db = getDb();
  const r = db.getFirstSync<{
    display_name: string; total_xp: number; current_level: number;
    streak_current: number; streak_best: number; daily_goal_minutes: number;
    inicet_date: string; neet_date: string; preferred_session_length: number;
    openrouter_api_key: string; openrouter_key: string; notifications_enabled: number; last_active_date: string | null; sync_code: string | null;
    strict_mode_enabled: number; streak_shield_available: number;
    body_doubling_enabled: number; blocked_content_types: string;
    idle_timeout_minutes: number; break_duration_minutes: number;
    notification_hour: number; focus_subject_ids: string;
  }>('SELECT * FROM user_profile WHERE id = 1');

  if (!r) {
    return {
      displayName: 'Doctor', totalXp: 0, currentLevel: 1,
      streakCurrent: 0, streakBest: 0, dailyGoalMinutes: 120,
      inicetDate: '2026-05-01', neetDate: '2026-08-01',
      preferredSessionLength: 45, openrouterApiKey: '', openrouterKey: '',
      notificationsEnabled: true, lastActiveDate: null, syncCode: null,
      strictModeEnabled: false, bodyDoublingEnabled: true,
      blockedContentTypes: [], idleTimeoutMinutes: 2,
      breakDurationMinutes: 5, notificationHour: 7, focusSubjectIds: [],
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
    openrouterKey: r.openrouter_key ?? '',
    notificationsEnabled: r.notifications_enabled === 1,
    lastActiveDate: r.last_active_date,
    syncCode: r.sync_code,
    strictModeEnabled: r.strict_mode_enabled === 1,
    bodyDoublingEnabled: (r.body_doubling_enabled ?? 1) === 1,
    blockedContentTypes: (() => { try { return JSON.parse(r.blocked_content_types ?? '[]'); } catch { return []; } })() as ContentType[],
    idleTimeoutMinutes: r.idle_timeout_minutes ?? 2,
    breakDurationMinutes: r.break_duration_minutes ?? 5,
    notificationHour: r.notification_hour ?? 7,
    focusSubjectIds: (() => { try { return JSON.parse(r.focus_subject_ids ?? '[]'); } catch { return []; } })() as number[],
  };
}

export function updateUserProfile(updates: Partial<UserProfile>): void {
  const db = getDb();
  const map: Record<string, string> = {
    displayName: 'display_name', totalXp: 'total_xp', currentLevel: 'current_level',
    streakCurrent: 'streak_current', streakBest: 'streak_best', dailyGoalMinutes: 'daily_goal_minutes',
    inicetDate: 'inicet_date', neetDate: 'neet_date', preferredSessionLength: 'preferred_session_length',
    openrouterApiKey: 'openrouter_api_key', openrouterKey: 'openrouter_key',
    notificationsEnabled: 'notifications_enabled', lastActiveDate: 'last_active_date', syncCode: 'sync_code', strictModeEnabled: 'strict_mode_enabled',
    bodyDoublingEnabled: 'body_doubling_enabled', idleTimeoutMinutes: 'idle_timeout_minutes',
    breakDurationMinutes: 'break_duration_minutes', notificationHour: 'notification_hour',
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

  // Array fields stored as JSON
  if ('blockedContentTypes' in updates) {
    setClauses.push('blocked_content_types = ?');
    values.push(JSON.stringify(updates.blockedContentTypes ?? []));
  }
  if ('focusSubjectIds' in updates) {
    setClauses.push('focus_subject_ids = ?');
    values.push(JSON.stringify(updates.focusSubjectIds ?? []));
  }

  if (setClauses.length === 0) return;
  values.push(1);
  db.runSync(`UPDATE user_profile SET ${setClauses.join(', ')} WHERE id = ?`, values);
}

export function addXp(amount: number): { newTotal: number; leveledUp: boolean; newLevel: number } {
  const db = getDb();
  const profile = getUserProfile();
  const newTotal = profile.totalXp + amount;

  let newLevel = profile.currentLevel;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newTotal >= LEVELS[i].xpRequired) { newLevel = LEVELS[i].level; break; }
  }

  const leveledUp = newLevel > profile.currentLevel;
  db.runSync('UPDATE user_profile SET total_xp = ?, current_level = ? WHERE id = 1', [newTotal, newLevel]);
  return { newTotal, leveledUp, newLevel };
}

export function updateStreak(studiedToday: boolean, useShield = false): void {
  const db = getDb();
  const today = todayStr();
  const profile = getUserProfile();

  if (profile.lastActiveDate === today) return;

  if (useShield && profile.streakCurrent > 0) {
    db.runSync('UPDATE user_profile SET streak_shield_available = 0, last_active_date = ? WHERE id = 1', [today]);
    return;
  }

  if (!studiedToday) return;

  const yesterday = dateStr(new Date(Date.now() - 86400000));
  const newStreak = profile.lastActiveDate === yesterday ? profile.streakCurrent + 1 : 1;
  const newBest = Math.max(newStreak, profile.streakBest);
  const shieldAvailable = newStreak === 1 ? 1 : (profile.streakCurrent === 0 ? 1 : 0);

  db.runSync('UPDATE user_profile SET streak_current = ?, streak_best = ?, last_active_date = ?, streak_shield_available = ? WHERE id = 1', [newStreak, newBest, today, shieldAvailable]);
}

export function useStreakShield(): boolean {
  const db = getDb();
  const profile = getUserProfile();
  const raw = (getDb().getFirstSync<{ streak_shield_available: number }>('SELECT streak_shield_available FROM user_profile WHERE id = 1'))?.streak_shield_available;
  if (profile.streakCurrent === 0 || raw !== 1) return false;
  updateStreak(false, true);
  return true;
}

export function getDailyLog(date?: string): DailyLog | null {
  const db = getDb();
  const d = date ?? todayStr();
  const r = db.getFirstSync<{ date: string; checked_in: number; mood: string | null; total_minutes: number; xp_earned: number; session_count: number }>('SELECT * FROM daily_log WHERE date = ?', [d]);
  if (!r) return null;
  return { date: r.date, checkedIn: r.checked_in === 1, mood: r.mood as Mood | null, totalMinutes: r.total_minutes, xpEarned: r.xp_earned, sessionCount: r.session_count };
}

export function checkinToday(mood: Mood): void {
  const db = getDb();
  const today = todayStr();
  db.runSync(`INSERT INTO daily_log (date, checked_in, mood) VALUES (?, 1, ?) ON CONFLICT(date) DO UPDATE SET checked_in = 1, mood = excluded.mood`, [today, mood]);
}

export function getLast30DaysLog(): DailyLog[] { return getActivityHistory(30); }

export function getActivityHistory(days = 90): DailyLog[] {
  const db = getDb();
  const rows = db.getAllSync<{ date: string; checked_in: number; mood: string | null; total_minutes: number; xp_earned: number; session_count: number }>(`SELECT * FROM daily_log ORDER BY date DESC LIMIT ?`, [days]);
  return rows.map(r => ({ date: r.date, checkedIn: r.checked_in === 1, mood: r.mood as Mood | null, totalMinutes: r.total_minutes, xpEarned: r.xp_earned, sessionCount: r.session_count }));
}

export function resetStudyProgress(): void {
  const db = getDb();
  db.runSync(`UPDATE topic_progress SET status = 'unseen', confidence = 0, last_studied_at = NULL, times_studied = 0, xp_earned = 0, next_review_date = NULL`);
  db.runSync(`UPDATE user_profile SET total_xp = 0, current_level = 1, streak_current = 0, streak_best = 0, last_active_date = NULL WHERE id = 1`);
  db.runSync(`DELETE FROM daily_log`);
}

export function clearAiCache(): void {
  getDb().runSync('DELETE FROM ai_cache');
}

export function getDaysToExam(dateStr: string): number {
  const exam = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((exam - now) / 86400000));
}
