import { getDb, todayStr, dateStr } from '../database';
import type {
  UserProfile,
  DailyLog,
  Mood,
  ContentType,
  StudyResourceMode,
  HarassmentTone,
} from '../../types';
import { LEVELS } from '../../constants/gamification';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../../config/appConfig';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../../services/databaseEvents';

function isValidFutureDate(dateStr: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const exam = new Date(dateStr);
  if (isNaN(exam.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return exam.getTime() >= now.getTime();
}

export async function getUserProfile(): Promise<UserProfile> {
  const db = getDb();
  const r = await db.getFirstAsync<{
    display_name: string;
    total_xp: number;
    current_level: number;
    streak_current: number;
    streak_best: number;
    daily_goal_minutes: number;
    inicet_date: string;
    neet_date: string;
    preferred_session_length: number;
    openrouter_api_key: string;
    openrouter_key: string;
    notifications_enabled: number;
    last_active_date: string | null;
    sync_code: string | null;
    strict_mode_enabled: number;
    streak_shield_available: number;
    body_doubling_enabled: number;
    blocked_content_types: string;
    idle_timeout_minutes: number;
    break_duration_minutes: number;
    notification_hour: number;
    focus_subject_ids: string;
    guru_frequency: UserProfile['guruFrequency'] | null;
    focus_audio_enabled: number;
    visual_timers_enabled: number;
    face_tracking_enabled: number;
    quiz_correct_count: number;
    last_backup_date: string | null;
    use_local_model: number;
    local_model_path: string | null;
    use_local_whisper: number;
    local_whisper_path: string | null;
    quick_start_streak: number;
    groq_api_key: string;
    study_resource_mode: StudyResourceMode | null;
    subject_load_overrides_json: string | null;
    harassment_tone: string | null;
    backup_directory_uri: string | null;
  }>('SELECT * FROM user_profile WHERE id = 1');

  if (!r) {
    return {
      displayName: 'Doctor',
      totalXp: 0,
      currentLevel: 1,
      streakCurrent: 0,
      streakBest: 0,
      dailyGoalMinutes: 120,
      inicetDate: DEFAULT_INICET_DATE,
      neetDate: DEFAULT_NEET_DATE,
      preferredSessionLength: 45,
      openrouterApiKey: '',
      openrouterKey: '',
      groqApiKey: '',
      notificationsEnabled: true,
      lastActiveDate: null,
      syncCode: null,
      strictModeEnabled: false,
      bodyDoublingEnabled: true,
      blockedContentTypes: [],
      idleTimeoutMinutes: 2,
      breakDurationMinutes: 5,
      notificationHour: 7,
      guruFrequency: 'normal',
      focusSubjectIds: [],
      focusAudioEnabled: false,
      visualTimersEnabled: false,
      faceTrackingEnabled: false,
      quizCorrectCount: 0,
      lastBackupDate: null,
      useLocalModel: false,
      localModelPath: null,
      useLocalWhisper: false,
      localWhisperPath: null,
      quickStartStreak: 0,
      studyResourceMode: 'hybrid',
      harassmentTone: 'shame',
      customSubjectLoadMultipliers: {},
      backupDirectoryUri: null,
    };
  }

  return {
    displayName: r.display_name,
    totalXp: r.total_xp,
    currentLevel: r.current_level,
    streakCurrent: r.streak_current,
    streakBest: r.streak_best,
    dailyGoalMinutes: r.daily_goal_minutes,
    inicetDate: isValidFutureDate(r.inicet_date) ? r.inicet_date : DEFAULT_INICET_DATE,
    neetDate: isValidFutureDate(r.neet_date) ? r.neet_date : DEFAULT_NEET_DATE,
    preferredSessionLength: r.preferred_session_length,
    openrouterApiKey: r.openrouter_api_key,
    openrouterKey: r.openrouter_key ?? '',
    groqApiKey: r.groq_api_key ?? '',
    notificationsEnabled: r.notifications_enabled === 1,
    lastActiveDate: r.last_active_date,
    syncCode: r.sync_code,
    strictModeEnabled: r.strict_mode_enabled === 1,
    bodyDoublingEnabled: (r.body_doubling_enabled ?? 1) === 1,
    blockedContentTypes: (() => {
      try {
        return JSON.parse(r.blocked_content_types ?? '[]');
      } catch {
        return [];
      }
    })() as ContentType[],
    idleTimeoutMinutes: r.idle_timeout_minutes ?? 2,
    breakDurationMinutes: r.break_duration_minutes ?? 5,
    notificationHour: r.notification_hour ?? 7,
    guruFrequency: r.guru_frequency ?? 'normal',
    focusSubjectIds: (() => {
      try {
        return JSON.parse(r.focus_subject_ids ?? '[]');
      } catch {
        return [];
      }
    })() as number[],
    focusAudioEnabled: (r.focus_audio_enabled ?? 0) === 1,
    visualTimersEnabled: (r.visual_timers_enabled ?? 0) === 1,
    faceTrackingEnabled: (r.face_tracking_enabled ?? 0) === 1,
    quizCorrectCount: r.quiz_correct_count ?? 0,
    lastBackupDate: r.last_backup_date,
    useLocalModel: (r.use_local_model ?? 0) === 1,
    localModelPath: r.local_model_path ?? null,
    useLocalWhisper: (r.use_local_whisper ?? 0) === 1,
    localWhisperPath: r.local_whisper_path ?? null,
    quickStartStreak: r.quick_start_streak ?? 0,
    studyResourceMode: r.study_resource_mode ?? 'hybrid',
    harassmentTone: (r.harassment_tone as HarassmentTone | null) ?? 'shame',
    customSubjectLoadMultipliers: (() => {
      try {
        const parsed = JSON.parse(r.subject_load_overrides_json ?? '{}');
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
      } catch {
        return {};
      }
    })(),
    backupDirectoryUri: r.backup_directory_uri ?? null,
  };
}

export async function updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
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
    openrouterKey: 'openrouter_key',
    notificationsEnabled: 'notifications_enabled',
    lastActiveDate: 'last_active_date',
    syncCode: 'sync_code',
    strictModeEnabled: 'strict_mode_enabled',
    bodyDoublingEnabled: 'body_doubling_enabled',
    idleTimeoutMinutes: 'idle_timeout_minutes',
    breakDurationMinutes: 'break_duration_minutes',
    notificationHour: 'notification_hour',
    guruFrequency: 'guru_frequency',
    focusAudioEnabled: 'focus_audio_enabled',
    visualTimersEnabled: 'visual_timers_enabled',
    faceTrackingEnabled: 'face_tracking_enabled',
    quizCorrectCount: 'quiz_correct_count',
    lastBackupDate: 'last_backup_date',
    useLocalModel: 'use_local_model',
    localModelPath: 'local_model_path',
    useLocalWhisper: 'use_local_whisper',
    localWhisperPath: 'local_whisper_path',
    quickStartStreak: 'quick_start_streak',
    groqApiKey: 'groq_api_key',
    studyResourceMode: 'study_resource_mode',
    harassmentTone: 'harassment_tone',
    backupDirectoryUri: 'backup_directory_uri',
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
  if ('customSubjectLoadMultipliers' in updates) {
    setClauses.push('subject_load_overrides_json = ?');
    values.push(JSON.stringify(updates.customSubjectLoadMultipliers ?? {}));
  }

  if (setClauses.length === 0) return;
  values.push(1);
  try {
    await db.runAsync(`UPDATE user_profile SET ${setClauses.join(', ')} WHERE id = ?`, values);
    notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
  } catch (err: any) {
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to update profile: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function addXp(
  amount: number,
): Promise<{ newTotal: number; leveledUp: boolean; newLevel: number }> {
  const db = getDb();
  const currentProfile = await db.getFirstAsync<{ total_xp: number; current_level: number }>(
    'SELECT total_xp, current_level FROM user_profile WHERE id = 1',
  );
  const oldTotal = currentProfile?.total_xp ?? 0;
  const oldLevel = currentProfile?.current_level ?? 1;
  const newTotal = oldTotal + amount;

  let newLevel = oldLevel;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newTotal >= LEVELS[i].xpRequired) {
      newLevel = LEVELS[i].level;
      break;
    }
  }

  const leveledUp = newLevel > oldLevel;
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      'UPDATE user_profile SET total_xp = total_xp + ?, current_level = ? WHERE id = 1',
      [amount, newLevel],
    );
    await db.execAsync('COMMIT TRANSACTION');
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
    return { newTotal, leveledUp, newLevel };
  } catch (err: any) {
    await db.execAsync('ROLLBACK TRANSACTION');
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to update XP: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function updateStreak(studiedToday: boolean, useShield = false): Promise<void> {
  const db = getDb();
  const today = todayStr();
  const profile = await getUserProfile();

  if (profile.lastActiveDate === today) return;

  if (useShield && profile.streakCurrent > 0) {
    try {
      await db.runAsync(
        'UPDATE user_profile SET streak_shield_available = 0, last_active_date = ? WHERE id = 1',
        [today],
      );
      notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
      return;
    } catch (err: any) {
      const { showToast } = require('../../components/Toast');
      showToast(`Failed to use shield: ${err.message || 'Unknown error'}`, 'error');
      throw err;
    }
  }

  if (!studiedToday) return;

  const yesterday = dateStr(new Date(Date.now() - 86400000));
  const newStreak = profile.lastActiveDate === yesterday ? profile.streakCurrent + 1 : 1;
  const newBest = Math.max(newStreak, profile.streakBest);
  const shieldAvailable = newStreak === 1 ? 1 : profile.streakCurrent === 0 ? 1 : 0;

  try {
    await db.runAsync(
      'UPDATE user_profile SET streak_current = ?, streak_best = ?, last_active_date = ?, streak_shield_available = ? WHERE id = 1',
      [newStreak, newBest, today, shieldAvailable],
    );
    notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
  } catch (err: any) {
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to update streak: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function useStreakShield(): Promise<boolean> {
  const db = getDb();
  const profile = await getUserProfile();
  const raw = (
    await db.getFirstAsync<{ streak_shield_available: number }>(
      'SELECT streak_shield_available FROM user_profile WHERE id = 1',
    )
  )?.streak_shield_available;
  if (profile.streakCurrent === 0 || raw !== 1) return false;
  await updateStreak(false, true);
  return true;
}

export async function getDailyLog(date?: string): Promise<DailyLog | null> {
  const db = getDb();
  const d = date ?? todayStr();
  const r = await db.getFirstAsync<{
    date: string;
    checked_in: number;
    mood: string | null;
    total_minutes: number;
    xp_earned: number;
    session_count: number;
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

export async function checkinToday(mood: Mood): Promise<void> {
  const db = getDb();
  const today = todayStr();
  try {
    await db.runAsync(
      `INSERT INTO daily_log (date, checked_in, mood) VALUES (?, 1, ?) ON CONFLICT(date) DO UPDATE SET checked_in = 1, mood = excluded.mood`,
      [today, mood],
    );
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
  } catch (err: any) {
    const { showToast } = require('../../components/Toast');
    showToast(`Check-in failed: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function getLast30DaysLog(): Promise<DailyLog[]> {
  return getActivityHistory(30);
}

export async function getActivityHistory(days = 90): Promise<DailyLog[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    date: string;
    checked_in: number;
    mood: string | null;
    total_minutes: number;
    xp_earned: number;
    session_count: number;
  }>(`SELECT * FROM daily_log ORDER BY date DESC LIMIT ?`, [days]);
  return rows.map((r) => ({
    date: r.date,
    checkedIn: r.checked_in === 1,
    mood: r.mood as Mood | null,
    totalMinutes: r.total_minutes,
    xpEarned: r.xp_earned,
    sessionCount: r.session_count,
  }));
}

export async function getActiveStudyDays(days = 30): Promise<number> {
  if (days <= 0) return 0;

  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM daily_log
     WHERE date >= ?
       AND (session_count > 0 OR total_minutes > 0)`,
    [dateStr(start)],
  );

  return row?.count ?? 0;
}

export async function getDailyMinutesSeries(days = 7): Promise<number[]> {
  if (days <= 0) return [];

  const db = getDb();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = await db.getAllAsync<{ total_minutes: number }>(
    `WITH RECURSIVE date_span(day, remaining) AS (
       SELECT ?, ?
       UNION ALL
       SELECT DATE(day, '+1 day'), remaining - 1
       FROM date_span
       WHERE remaining > 1
     )
     SELECT COALESCE(d.total_minutes, 0) AS total_minutes
     FROM date_span
     LEFT JOIN daily_log d ON d.date = date_span.day
     ORDER BY date_span.day ASC`,
    [dateStr(start), days],
  );

  return rows.map((row) => row.total_minutes ?? 0);
}

export async function resetStudyProgress(): Promise<void> {
  const db = getDb();
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      `UPDATE topic_progress SET
         status = 'unseen',
         confidence = 0,
         last_studied_at = NULL,
         times_studied = 0,
         xp_earned = 0,
         next_review_date = NULL,
         fsrs_due = NULL,
         fsrs_stability = 0,
         fsrs_difficulty = 0,
         fsrs_elapsed_days = 0,
         fsrs_scheduled_days = 0,
         fsrs_reps = 0,
         fsrs_lapses = 0,
         fsrs_state = 0,
         fsrs_last_review = NULL,
         wrong_count = 0,
         is_nemesis = 0`,
    );
    await db.runAsync(
      `UPDATE user_profile SET total_xp = 0, current_level = 1, streak_current = 0, streak_best = 0, last_active_date = NULL WHERE id = 1`,
    );
    await db.runAsync(`DELETE FROM daily_log`);
    await db.execAsync('COMMIT TRANSACTION');
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
  } catch (err: any) {
    await db.execAsync('ROLLBACK TRANSACTION');
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to reset progress: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function clearAiCache(): Promise<void> {
  try {
    await getDb().runAsync('DELETE FROM ai_cache');
  } catch (err: any) {
    const { showToast } = require('../../components/Toast');
    showToast(`Failed to clear AI cache: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export function getDaysToExam(examDateStr: string): number {
  if (!examDateStr) return 0;

  let examTime = 0;
  const parts = examDateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      examTime = new Date(y, m, d).getTime();
    }
  }

  if (!examTime) {
    examTime = new Date(examDateStr).getTime();
  }

  if (isNaN(examTime) || examTime === 0) return 0;

  const now = new Date();
  now.setHours(0, 0, 0, 0); // Calculate from local midnight

  // Also adjust examTime to be local midnight if it's not already
  const exam = new Date(examTime);
  exam.setHours(0, 0, 0, 0);

  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / 86400000));
}

/**
 * Confidence decay: reduce confidence for overdue topics.
 * Called on app open. Only decays topics that:
 * - Have an fsrs_due date in the past (overdue)
 * - Have confidence > 0
 *
 * Decay rules:
 * - 1-7 days overdue: confidence drops by 1 (min 0)
 * - 8-30 days overdue: confidence drops by 2 (min 0)
 * - 30+ days overdue: confidence resets to 0, status → 'seen'
 */
export async function applyConfidenceDecay(): Promise<{ decayed: number }> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const overdue = await db.getAllAsync<{
    topic_id: number;
    confidence: number;
    fsrs_due: string;
    status: string;
  }>(
    `SELECT topic_id, confidence, fsrs_due, status FROM topic_progress
     WHERE fsrs_due IS NOT NULL AND DATE(fsrs_due) < DATE(?) AND confidence > 0`,
    [today],
  );

  let decayed = 0;
  for (const row of overdue) {
    const reviewDate = new Date(row.fsrs_due);
    const daysOverdue = Math.floor((Date.now() - reviewDate.getTime()) / 86400000);

    let newConf = row.confidence;
    let newStatus = row.status;

    if (daysOverdue > 30) {
      newConf = 0;
      if (row.status === 'mastered' || row.status === 'reviewed') newStatus = 'seen';
    } else if (daysOverdue > 7) {
      newConf = Math.max(0, row.confidence - 2);
    } else if (daysOverdue >= 1) {
      newConf = Math.max(0, row.confidence - 1);
    }

    if (newConf !== row.confidence || newStatus !== row.status) {
      await db.runAsync(`UPDATE topic_progress SET confidence = ?, status = ? WHERE topic_id = ?`, [
        newConf,
        newStatus,
        row.topic_id,
      ]);
      decayed++;
    }
  }

  if (decayed > 0) notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
  return { decayed };
}

/**
 * Get topics due for review today or overdue, grouped by subject.
 */
export async function getReviewDueTopics(): Promise<
  Array<{
    topicId: number;
    topicName: string;
    subjectName: string;
    confidence: number;
    nextReviewDate: string;
    daysOverdue: number;
  }>
> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync<{
    topic_id: number;
    topic_name: string;
    subject_name: string;
    confidence: number;
    fsrs_due: string;
  }>(
    `SELECT tp.topic_id, t.name as topic_name, s.name as subject_name,
            tp.confidence, tp.fsrs_due
     FROM topic_progress tp
     JOIN topics t ON tp.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     WHERE tp.fsrs_due IS NOT NULL AND DATE(tp.fsrs_due) <= DATE(?)
     ORDER BY tp.fsrs_due ASC
     LIMIT 50`,
    [today],
  );

  return rows.map((r) => ({
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    confidence: r.confidence,
    nextReviewDate: r.fsrs_due.slice(0, 10),
    daysOverdue: Math.max(0, Math.floor((Date.now() - new Date(r.fsrs_due).getTime()) / 86400000)),
  }));
}

/**
 * Get recently studied topics (last 48 hours) to avoid repetitive planning.
 */
export async function getRecentTopics(limit: number = 10): Promise<string[]> {
  const db = getDb();
  const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
  const rows = await db.getAllAsync<{ topic_name: string }>(
    `SELECT DISTINCT t.name as topic_name
     FROM session_metrics sm
     JOIN topics t ON sm.topic_id = t.id
     WHERE sm.created_at > ?
     ORDER BY sm.created_at DESC
     LIMIT ?`,
    [twoDaysAgo, limit],
  );
  return rows.map((r) => r.topic_name);
}
