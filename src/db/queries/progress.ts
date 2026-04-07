import { getDb, runInTransaction, todayStr, dateStr, SQL_AI_CACHE } from '../database';
import { getAiCacheDb } from '../aiCacheDatabase';
import type { SQLiteDatabase } from 'expo-sqlite';
import { MS_PER_DAY, INTERVALS } from '../../constants/time';
import type {
  UserProfile,
  DailyLog,
  Mood,
  ContentType,
  StudyResourceMode,
  HarassmentTone,
  ChatGptAccountsConfig,
} from '../../types';
import { LEVELS } from '../../constants/gamification';
import {
  DEFAULT_INICET_DATE,
  DEFAULT_NEET_DATE,
  DEFAULT_IMAGE_GENERATION_MODEL,
} from '../../config/appConfig';
import { notifyDbUpdate, DB_EVENT_KEYS } from '../../services/databaseEvents';
import { showToast } from '../../components/Toast';
import { sanitizeProviderOrder } from '../../utils/providerOrder';

// ── Enum allow-lists (single source of truth — update here when adding values) ──
const VALID_ENUMS: Record<string, { values: readonly string[]; fallback: string }> = {
  transcriptionProvider: {
    values: ['auto', 'groq', 'huggingface', 'cloudflare', 'deepgram', 'local'],
    fallback: 'auto',
  },
  guruFrequency: { values: ['rare', 'normal', 'frequent', 'off'], fallback: 'normal' },
  studyResourceMode: { values: ['standard', 'btr', 'dbmci_live', 'hybrid'], fallback: 'hybrid' },
  examType: { values: ['INICET', 'NEET'], fallback: 'INICET' },
};

/** Clamp an enum field to its allow-list; returns fallback if value is invalid. */
function sanitizeEnum(field: string, value: unknown): string {
  const spec = VALID_ENUMS[field];
  if (!spec) return String(value ?? '');
  if (typeof value === 'string' && spec.values.includes(value)) return value;
  if (__DEV__)
    console.warn(`[DB] Invalid value "${value}" for ${field}, falling back to "${spec.fallback}"`);
  return spec.fallback;
}

function isValidFutureDate(dateStr: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const exam = new Date(dateStr);
  if (isNaN(exam.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  exam.setHours(0, 0, 0, 0);
  return exam.getTime() >= now.getTime();
}

function sanitizeExamDateOrDefault(dateStr: unknown, fallback: string): string {
  return typeof dateStr === 'string' && isValidFutureDate(dateStr) ? dateStr : fallback;
}

function defaultChatGptAccountsConfig(): ChatGptAccountsConfig {
  return {
    primary: { enabled: true, connected: false },
    secondary: { enabled: false, connected: false },
  };
}

function sanitizeChatGptAccountsConfig(
  value: unknown,
  legacyConnected = false,
): ChatGptAccountsConfig {
  const fallback = defaultChatGptAccountsConfig();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (legacyConnected) fallback.primary.connected = true;
    return fallback;
  }

  const root = value as Record<string, unknown>;
  const readSlot = (slot: 'primary' | 'secondary') => {
    const raw = root[slot];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fallback[slot];
    }
    const record = raw as Record<string, unknown>;
    return {
      enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback[slot].enabled,
      connected:
        typeof record.connected === 'boolean' ? record.connected : fallback[slot].connected,
    };
  };

  const next: ChatGptAccountsConfig = {
    primary: readSlot('primary'),
    secondary: readSlot('secondary'),
  };
  if (legacyConnected && !next.primary.connected && !next.secondary.connected) {
    next.primary.connected = true;
  }
  return next;
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
    exam_type: string | null;
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
    gemini_key: string;
    huggingface_token: string;
    huggingface_transcription_model: string;
    transcription_provider: UserProfile['transcriptionProvider'] | null;
    study_resource_mode: StudyResourceMode | null;
    subject_load_overrides_json: string | null;
    harassment_tone: string | null;
    backup_directory_uri: string | null;
    pomodoro_enabled: number;
    pomodoro_interval_minutes: number;
    cloudflare_account_id: string;
    cloudflare_api_token: string;
    guru_chat_default_model: string;
    guru_memory_notes: string;
    image_generation_model: string;
    prefer_gemini_structured_json: number | null;
    github_models_pat: string;
    kilo_api_key: string;
    deepseek_key: string;
    agentrouter_key: string;
    provider_order: string;
    api_validation_json: string;
    chatgpt_connected: number;
    chatgpt_accounts_json: string;
    fal_api_key: string;
    brave_search_api_key: string;
    google_custom_search_api_key: string;
    qwen_connected: number;
    deepgram_api_key: string;
    github_copilot_connected?: number;
    github_copilot_preferred_model?: string;
    gitlab_duo_connected?: number;
    gitlab_oauth_client_id?: string;
    gitlab_duo_preferred_model?: string;
    poe_connected?: number;
    gdrive_web_client_id?: string;
    gdrive_connected?: number;
    gdrive_email?: string;
    gdrive_last_sync_at?: string | null;
    last_backup_device_id?: string;
    dbmci_class_start_date?: string | null;
    btr_start_date?: string | null;
    home_novelty_cooldown_hours?: number | null;
    disabled_providers?: string;
  }>('SELECT * FROM user_profile WHERE id = 1');

  if (!r) {
    return {
      displayName: 'Doctor',
      totalXp: 0,
      currentLevel: 1,
      streakCurrent: 0,
      streakBest: 0,
      dailyGoalMinutes: 120,
      examType: 'INICET' as const,
      inicetDate: DEFAULT_INICET_DATE,
      neetDate: DEFAULT_NEET_DATE,
      preferredSessionLength: 45,
      openrouterApiKey: '',
      openrouterKey: '',
      groqApiKey: '',
      geminiKey: '',
      huggingFaceToken: '',
      huggingFaceTranscriptionModel: 'openai/whisper-large-v3',
      transcriptionProvider: 'auto',
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
      pomodoroEnabled: true,
      pomodoroIntervalMinutes: 20,
      cloudflareAccountId: '',
      cloudflareApiToken: '',
      falApiKey: '',
      braveSearchApiKey: '',
      googleCustomSearchApiKey: '',
      guruChatDefaultModel: 'auto',
      imageGenerationModel: DEFAULT_IMAGE_GENERATION_MODEL,
      guruMemoryNotes: '',
      preferGeminiStructuredJson: true,
      githubModelsPat: '',
      kiloApiKey: '',
      deepseekKey: '',
      agentRouterKey: '',
      providerOrder: sanitizeProviderOrder([]),
      apiValidation: {},
      chatgptAccounts: defaultChatGptAccountsConfig(),
      chatgptConnected: false,
      githubCopilotConnected: false,
      githubCopilotPreferredModel: '',
      gitlabDuoConnected: false,
      gitlabOauthClientId: '',
      gitlabDuoPreferredModel: '',
      poeConnected: false,
      gdriveWebClientId: '',
      gdriveConnected: false,
      gdriveEmail: '',
      gdriveLastSyncAt: null,
      lastBackupDeviceId: '',
      dbmciClassStartDate: null,
      btrStartDate: null,
      homeNoveltyCooldownHours: 6,
    };
  }

  const legacyChatGptConnected = (r.chatgpt_connected ?? 0) === 1;
  const chatgptAccounts = (() => {
    try {
      return sanitizeChatGptAccountsConfig(
        JSON.parse(r.chatgpt_accounts_json ?? ''),
        legacyChatGptConnected,
      );
    } catch {
      return sanitizeChatGptAccountsConfig(null, legacyChatGptConnected);
    }
  })();
  const chatgptConnected =
    chatgptAccounts.primary.enabled && chatgptAccounts.primary.connected
      ? true
      : chatgptAccounts.secondary.enabled && chatgptAccounts.secondary.connected;

  return {
    displayName: r.display_name,
    totalXp: r.total_xp,
    currentLevel: r.current_level,
    streakCurrent: r.streak_current,
    streakBest: r.streak_best,
    dailyGoalMinutes: r.daily_goal_minutes,
    examType: (r.exam_type === 'NEET' ? 'NEET' : 'INICET') as 'INICET' | 'NEET',
    inicetDate: (() => {
      const v = sanitizeExamDateOrDefault(r.inicet_date, DEFAULT_INICET_DATE);
      if (v !== r.inicet_date && __DEV__)
        console.warn(`[Profile] inicet_date sanitized: DB="${r.inicet_date}" → "${v}"`);
      return v;
    })(),
    neetDate: (() => {
      const v = sanitizeExamDateOrDefault(r.neet_date, DEFAULT_NEET_DATE);
      if (v !== r.neet_date && __DEV__)
        console.warn(`[Profile] neet_date sanitized: DB="${r.neet_date}" → "${v}"`);
      return v;
    })(),
    preferredSessionLength: r.preferred_session_length,
    openrouterApiKey: r.openrouter_api_key,
    openrouterKey: r.openrouter_key ?? '',
    groqApiKey: r.groq_api_key ?? '',
    geminiKey: r.gemini_key ?? '',
    huggingFaceToken: r.huggingface_token ?? '',
    huggingFaceTranscriptionModel: r.huggingface_transcription_model ?? 'openai/whisper-large-v3',
    transcriptionProvider: (() => {
      const tp = r.transcription_provider;
      if (
        tp === 'auto' ||
        tp === 'groq' ||
        tp === 'huggingface' ||
        tp === 'cloudflare' ||
        tp === 'local'
      ) {
        return tp;
      }
      return 'auto';
    })(),
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
    pomodoroEnabled: (r.pomodoro_enabled ?? 1) === 1,
    pomodoroIntervalMinutes: r.pomodoro_interval_minutes ?? 20,
    cloudflareAccountId: r.cloudflare_account_id ?? '',
    cloudflareApiToken: r.cloudflare_api_token ?? '',
    falApiKey: r.fal_api_key ?? '',
    braveSearchApiKey: r.brave_search_api_key ?? '',
    googleCustomSearchApiKey: r.google_custom_search_api_key ?? '',
    guruChatDefaultModel: r.guru_chat_default_model ?? 'auto',
    imageGenerationModel: r.image_generation_model ?? DEFAULT_IMAGE_GENERATION_MODEL,
    guruMemoryNotes: r.guru_memory_notes ?? '',
    preferGeminiStructuredJson: (r.prefer_gemini_structured_json ?? 1) === 1,
    githubModelsPat: r.github_models_pat ?? '',
    kiloApiKey: r.kilo_api_key ?? '',
    deepseekKey: r.deepseek_key ?? '',
    agentRouterKey: r.agentrouter_key ?? '',
    deepgramApiKey: r.deepgram_api_key ?? '',
    providerOrder: sanitizeProviderOrder(
      (() => {
        try {
          return JSON.parse(r.provider_order ?? '[]');
        } catch {
          return [];
        }
      })(),
    ),
    apiValidation: (() => {
      try {
        const parsed = JSON.parse(r.api_validation_json ?? '{}');
        return parsed && typeof parsed === 'object'
          ? (parsed as NonNullable<UserProfile['apiValidation']>)
          : {};
      } catch {
        return {};
      }
    })(),
    chatgptAccounts,
    chatgptConnected,
    githubCopilotConnected: (r.github_copilot_connected ?? 0) === 1,
    githubCopilotPreferredModel: (r.github_copilot_preferred_model ?? '').trim(),
    gitlabDuoConnected: (r.gitlab_duo_connected ?? 0) === 1,
    gitlabOauthClientId: (r.gitlab_oauth_client_id ?? '').trim(),
    gitlabDuoPreferredModel: (r.gitlab_duo_preferred_model ?? '').trim(),
    poeConnected: (r.poe_connected ?? 0) === 1,
    qwenConnected: (r.qwen_connected ?? 0) === 1,
    gdriveWebClientId: (r.gdrive_web_client_id ?? '').trim(),
    gdriveConnected: (r.gdrive_connected ?? 0) === 1,
    gdriveEmail: (r.gdrive_email ?? '').trim(),
    gdriveLastSyncAt: r.gdrive_last_sync_at ?? null,
    lastBackupDeviceId: (r.last_backup_device_id ?? '').trim(),
    dbmciClassStartDate: r.dbmci_class_start_date ?? null,
    btrStartDate: r.btr_start_date ?? null,
    homeNoveltyCooldownHours: Math.min(24, Math.max(1, r.home_novelty_cooldown_hours ?? 6)),
    disabledProviders: (() => {
      try {
        const parsed = JSON.parse(r.disabled_providers ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
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
    examType: 'exam_type',
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
    geminiKey: 'gemini_key',
    huggingFaceToken: 'huggingface_token',
    huggingFaceTranscriptionModel: 'huggingface_transcription_model',
    transcriptionProvider: 'transcription_provider',
    studyResourceMode: 'study_resource_mode',
    harassmentTone: 'harassment_tone',
    backupDirectoryUri: 'backup_directory_uri',
    pomodoroEnabled: 'pomodoro_enabled',
    pomodoroIntervalMinutes: 'pomodoro_interval_minutes',
    cloudflareAccountId: 'cloudflare_account_id',
    cloudflareApiToken: 'cloudflare_api_token',
    falApiKey: 'fal_api_key',
    braveSearchApiKey: 'brave_search_api_key',
    googleCustomSearchApiKey: 'google_custom_search_api_key',
    guruChatDefaultModel: 'guru_chat_default_model',
    imageGenerationModel: 'image_generation_model',
    guruMemoryNotes: 'guru_memory_notes',
    preferGeminiStructuredJson: 'prefer_gemini_structured_json',
    githubModelsPat: 'github_models_pat',
    kiloApiKey: 'kilo_api_key',
    deepseekKey: 'deepseek_key',
    agentRouterKey: 'agentrouter_key',
    deepgramApiKey: 'deepgram_api_key',
    apiValidation: 'api_validation_json',
    chatgptConnected: 'chatgpt_connected',
    chatgptAccounts: 'chatgpt_accounts_json',
    githubCopilotConnected: 'github_copilot_connected',
    githubCopilotPreferredModel: 'github_copilot_preferred_model',
    gitlabDuoConnected: 'gitlab_duo_connected',
    gitlabOauthClientId: 'gitlab_oauth_client_id',
    gitlabDuoPreferredModel: 'gitlab_duo_preferred_model',
    poeConnected: 'poe_connected',
    qwenConnected: 'qwen_connected',
    gdriveWebClientId: 'gdrive_web_client_id',
    gdriveConnected: 'gdrive_connected',
    gdriveEmail: 'gdrive_email',
    gdriveLastSyncAt: 'gdrive_last_sync_at',
    lastBackupDeviceId: 'last_backup_device_id',
    dbmciClassStartDate: 'dbmci_class_start_date',
    btrStartDate: 'btr_start_date',
    homeNoveltyCooldownHours: 'home_novelty_cooldown_hours',
  };

  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, col] of Object.entries(map)) {
    if (key in updates) {
      setClauses.push(`${col} = ?`);
      let val = (updates as Record<string, unknown>)[key];
      // Sanitize enum fields so invalid values never reach the DB
      if (key in VALID_ENUMS) {
        val = sanitizeEnum(key, val);
      } else if (key === 'inicetDate') {
        val = sanitizeExamDateOrDefault(val, DEFAULT_INICET_DATE);
      } else if (key === 'neetDate') {
        val = sanitizeExamDateOrDefault(val, DEFAULT_NEET_DATE);
      }
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
  if ('providerOrder' in updates) {
    setClauses.push('provider_order = ?');
    values.push(JSON.stringify(updates.providerOrder ?? []));
  }
  if ('disabledProviders' in updates) {
    setClauses.push('disabled_providers = ?');
    values.push(JSON.stringify(updates.disabledProviders ?? []));
  }
  if ('apiValidation' in updates) {
    setClauses.push('api_validation_json = ?');
    values.push(JSON.stringify(updates.apiValidation ?? {}));
  }
  if ('chatgptAccounts' in updates) {
    setClauses.push('chatgpt_accounts_json = ?');
    values.push(JSON.stringify(sanitizeChatGptAccountsConfig(updates.chatgptAccounts, false)));
  }

  if (setClauses.length === 0) return;
  values.push(1);
  try {
    await db.runAsync(`UPDATE user_profile SET ${setClauses.join(', ')} WHERE id = ?`, values);
    notifyDbUpdate(DB_EVENT_KEYS.PROFILE_UPDATED);
  } catch (err: any) {
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
  const oldLevel = currentProfile?.current_level ?? 1;

  try {
    const result = await runInTransaction(async (tx) => {
      await tx.runAsync('UPDATE user_profile SET total_xp = total_xp + ? WHERE id = 1', [amount]);
      const row = await tx.getFirstAsync<{ total_xp: number }>(
        'SELECT total_xp FROM user_profile WHERE id = 1',
      );
      const newTotal = row?.total_xp ?? 0;
      let newLevel = 1;
      for (let i = LEVELS.length - 1; i >= 0; i--) {
        if (newTotal >= LEVELS[i].xpRequired) {
          newLevel = LEVELS[i].level;
          break;
        }
      }
      await tx.runAsync('UPDATE user_profile SET current_level = ? WHERE id = 1', [newLevel]);
      return { newTotal, newLevel };
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
    return {
      newTotal: result.newTotal,
      leveledUp: result.newLevel > oldLevel,
      newLevel: result.newLevel,
    };
  } catch (err: any) {
    showToast(`Failed to update XP: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function addXpInTx(
  tx: SQLiteDatabase,
  amount: number,
): Promise<{ newTotal: number; leveledUp: boolean; newLevel: number }> {
  if (amount <= 0) {
    const row = await tx.getFirstAsync<{ total_xp: number; current_level: number }>(
      'SELECT total_xp, current_level FROM user_profile WHERE id = 1',
    );
    return {
      newTotal: row?.total_xp ?? 0,
      leveledUp: false,
      newLevel: row?.current_level ?? 1,
    };
  }

  const currentProfile = await tx.getFirstAsync<{ total_xp: number; current_level: number }>(
    'SELECT total_xp, current_level FROM user_profile WHERE id = 1',
  );
  const oldLevel = currentProfile?.current_level ?? 1;

  await tx.runAsync('UPDATE user_profile SET total_xp = total_xp + ? WHERE id = 1', [amount]);
  const row = await tx.getFirstAsync<{ total_xp: number }>(
    'SELECT total_xp FROM user_profile WHERE id = 1',
  );
  const newTotal = row?.total_xp ?? 0;
  let newLevel = 1;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (newTotal >= LEVELS[i].xpRequired) {
      newLevel = LEVELS[i].level;
      break;
    }
  }
  await tx.runAsync('UPDATE user_profile SET current_level = ? WHERE id = 1', [newLevel]);

  return {
    newTotal,
    leveledUp: newLevel > oldLevel,
    newLevel,
  };
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
      showToast(`Failed to use shield: ${err.message || 'Unknown error'}`, 'error');
      throw err;
    }
  }

  if (!studiedToday) return;

  const yesterday = dateStr(new Date(Date.now() - MS_PER_DAY));
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
  try {
    await runInTransaction(async (tx) => {
      await tx.runAsync(
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
      await tx.runAsync(
        `UPDATE user_profile SET total_xp = 0, current_level = 1, streak_current = 0, streak_best = 0, last_active_date = NULL WHERE id = 1`,
      );
      await tx.runAsync(`DELETE FROM daily_log`);
    });
    notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
  } catch (err: any) {
    showToast(`Failed to reset progress: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export async function clearAiCache(): Promise<void> {
  try {
    await getAiCacheDb().runAsync(`DELETE FROM ${SQL_AI_CACHE}`);
  } catch (err: any) {
    showToast(`Failed to clear AI cache: ${err.message || 'Unknown error'}`, 'error');
    throw err;
  }
}

export function getDaysToExam(examDateStr: string): number {
  if (!examDateStr) {
    if (__DEV__) console.warn('[getDaysToExam] Empty exam date string');
    return 0;
  }

  let examTime = 0;
  const parts = examDateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d) && y >= 2024) {
      examTime = new Date(y, m, d).getTime();
    }
  }

  if (!examTime) {
    examTime = new Date(examDateStr).getTime();
  }

  if (isNaN(examTime) || examTime === 0) {
    if (__DEV__) console.warn(`[getDaysToExam] Unparseable exam date: "${examDateStr}"`);
    return 0;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const exam = new Date(examTime);
  exam.setHours(0, 0, 0, 0);

  return Math.max(0, Math.ceil((exam.getTime() - now.getTime()) / MS_PER_DAY));
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

  if (overdue.length === 0) return { decayed: 0 };

  // Compute new values in JS, then apply atomically in one transaction
  const updates: Array<{ topicId: number; newConf: number; newStatus: string }> = [];

  for (const row of overdue) {
    const reviewDate = new Date(row.fsrs_due);
    const daysOverdue = Math.floor((Date.now() - reviewDate.getTime()) / MS_PER_DAY);

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
      updates.push({ topicId: row.topic_id, newConf, newStatus });
    }
  }

  if (updates.length === 0) return { decayed: 0 };

  // Atomic batch: all-or-nothing so a crash can't leave partial decay
  await runInTransaction(async (tx) => {
    for (const u of updates) {
      await tx.runAsync(`UPDATE topic_progress SET confidence = ?, status = ? WHERE topic_id = ?`, [
        u.newConf,
        u.newStatus,
        u.topicId,
      ]);
    }
  });

  notifyDbUpdate(DB_EVENT_KEYS.PROGRESS_UPDATED);
  return { decayed: updates.length };
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
    daysOverdue: Math.max(
      0,
      Math.floor((Date.now() - new Date(r.fsrs_due).getTime()) / MS_PER_DAY),
    ),
  }));
}

/**
 * Get recently studied topics (last 48 hours) to avoid repetitive planning.
 */
export async function getRecentTopics(limit: number = 10): Promise<string[]> {
  const db = getDb();
  const twoDaysAgo = Date.now() - INTERVALS.TWO_DAYS;
  const rows = await db.getAllAsync<{ topic_name: string }>(
    `SELECT DISTINCT t.name as topic_name
     FROM topic_progress tp
     JOIN topics t ON tp.topic_id = t.id
     WHERE tp.last_studied_at > ?
     ORDER BY tp.last_studied_at DESC
     LIMIT ?`,
    [twoDaysAgo, limit],
  );
  return rows.map((r) => r.topic_name);
}
