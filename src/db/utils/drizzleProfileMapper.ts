/**
 * Utility functions for mapping between Drizzle user_profile rows and UserProfile interface.
 */

import type { UserProfileRow, NewUserProfileRow } from '../drizzleSchema';
import type {
  UserProfile,
  ChatGptAccountsConfig,
  ContentType,
  ProviderId,
  HarassmentTone,
} from '../../types';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../../config/appConfig';
import { sanitizeProviderOrder } from '../../utils/providerOrder';
import { sanitizeWebSearchOrder } from '../../utils/webSearchOrder';
import type { WebSearchProviderId } from '../../types';

// Enum allow-lists copied from progress.ts
const VALID_ENUMS: Record<string, { values: readonly string[]; fallback: string }> = {
  transcriptionProvider: {
    values: ['auto', 'groq', 'huggingface', 'cloudflare', 'deepgram', 'local'] as const,
    fallback: 'auto',
  },
  autoBackupFrequency: {
    values: ['off', 'daily', '3days', 'weekly', 'monthly'] as const,
    fallback: 'off',
  },
  guruFrequency: { values: ['rare', 'normal', 'frequent', 'off'] as const, fallback: 'normal' },
  studyResourceMode: {
    values: ['standard', 'btr', 'dbmci_live', 'hybrid'] as const,
    fallback: 'hybrid',
  },
  examType: { values: ['INICET', 'NEET'] as const, fallback: 'INICET' },
  harassmentTone: { values: ['shame', 'motivational', 'tough_love'] as const, fallback: 'shame' },
};

// ─── Helper functions copied from progress.ts ─────────────────────────────────

function isValidFutureDate(dateStr: string | null): boolean {
  if (!dateStr) return false;
  try {
    const exam = new Date(dateStr);
    const now = new Date();
    // Allow dates up to 2 years in the future
    const maxFuture = new Date();
    maxFuture.setFullYear(maxFuture.getFullYear() + 2);
    return (
      exam instanceof Date &&
      !isNaN(exam.getTime()) &&
      exam.getTime() >= now.getTime() &&
      exam.getTime() <= maxFuture.getTime()
    );
  } catch {
    return false;
  }
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

/** Clamp an enum field to its allow-list; returns fallback if value is invalid. */
function sanitizeEnum(field: string, value: unknown): string {
  const spec = VALID_ENUMS[field];
  if (!spec) return String(value ?? '');
  if (typeof value === 'string' && (spec.values as readonly string[]).includes(value)) return value;
  if (__DEV__)
    console.warn(`[DB] Invalid value "${value}" for ${field}, falling back to "${spec.fallback}"`);
  return spec.fallback;
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

  const record = value as Record<string, unknown>;
  const readSlot = (slot: 'primary' | 'secondary') => {
    const slotVal = record[slot];
    if (!slotVal || typeof slotVal !== 'object' || Array.isArray(slotVal)) {
      return fallback[slot];
    }
    const slotRecord = slotVal as Record<string, unknown>;
    return {
      enabled:
        typeof slotRecord.enabled === 'boolean' ? slotRecord.enabled : fallback[slot].enabled,
      connected:
        typeof slotRecord.connected === 'boolean' ? slotRecord.connected : fallback[slot].connected,
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

// ─── Mapper functions ─────────────────────────────────────────────────────────

/**
 * Maps a Drizzle user_profile row to a UserProfile object.
 * This replicates the logic from getUserProfile in progress.ts.
 */
export function mapUserProfileRow(row: UserProfileRow | undefined): UserProfile {
  if (!row) {
    return createDefaultUserProfile();
  }

  const legacyChatGptConnected = (row.chatgptConnected ?? 0) === 1;
  const chatgptAccounts = (() => {
    try {
      return sanitizeChatGptAccountsConfig(
        JSON.parse(row.chatgptAccountsJson ?? ''),
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
    displayName: row.displayName,
    totalXp: row.totalXp,
    currentLevel: row.currentLevel,
    streakCurrent: row.streakCurrent,
    streakBest: row.streakBest,
    dailyGoalMinutes: row.dailyGoalMinutes,
    examType: (row.examType === 'NEET' ? 'NEET' : 'INICET') as 'INICET' | 'NEET',
    inicetDate: (() => {
      const v = sanitizeExamDateOrDefault(row.inicetDate, DEFAULT_INICET_DATE);
      if (v !== row.inicetDate && __DEV__)
        console.warn(`[Profile] inicet_date sanitized: DB="${row.inicetDate}" → "${v}"`);
      return v;
    })(),
    neetDate: (() => {
      const v = sanitizeExamDateOrDefault(row.neetDate, DEFAULT_NEET_DATE);
      if (v !== row.neetDate && __DEV__)
        console.warn(`[Profile] neet_date sanitized: DB="${row.neetDate}" → "${v}"`);
      return v;
    })(),
    preferredSessionLength: row.preferredSessionLength,
    openrouterApiKey: row.openrouterApiKey,
    openrouterKey: row.openrouterKey ?? '',
    groqApiKey: row.groqApiKey ?? '',
    geminiKey: row.geminiKey ?? '',
    huggingFaceToken: row.huggingfaceToken ?? '',
    huggingFaceTranscriptionModel: row.huggingfaceTranscriptionModel ?? 'openai/whisper-large-v3',
    transcriptionProvider: (() => {
      const tp = row.transcriptionProvider;
      if (
        tp === 'auto' ||
        tp === 'groq' ||
        tp === 'huggingface' ||
        tp === 'cloudflare' ||
        tp === 'deepgram' ||
        tp === 'local'
      ) {
        return tp;
      }
      return 'auto';
    })() as UserProfile['transcriptionProvider'],
    notificationsEnabled: row.notificationsEnabled === 1,
    lastActiveDate: row.lastActiveDate,
    syncCode: row.syncCode,
    strictModeEnabled: row.strictModeEnabled === 1,
    doomscrollShieldEnabled: row.doomscrollShieldEnabled === 1,
    bodyDoublingEnabled: (row.bodyDoublingEnabled ?? 1) === 1,
    blockedContentTypes: (() => {
      try {
        return JSON.parse(row.blockedContentTypes ?? '[]');
      } catch {
        return [];
      }
    })() as ContentType[],
    idleTimeoutMinutes: row.idleTimeoutMinutes ?? 2,
    breakDurationMinutes: row.breakDurationMinutes ?? 5,
    notificationHour: row.notificationHour ?? 7,
    guruFrequency: (row.guruFrequency as UserProfile['guruFrequency']) ?? 'normal',
    focusSubjectIds: (() => {
      try {
        return JSON.parse(row.focusSubjectIds ?? '[]');
      } catch {
        return [];
      }
    })() as number[],
    focusAudioEnabled: row.focusAudioEnabled === 1,
    visualTimersEnabled: row.visualTimersEnabled === 1,
    faceTrackingEnabled: row.faceTrackingEnabled === 1,
    quizCorrectCount: row.quizCorrectCount ?? 0,
    lastBackupDate: row.lastBackupDate,
    autoBackupFrequency: (row.autoBackupFrequency as UserProfile['autoBackupFrequency']) ?? 'off',
    lastAutoBackupAt: row.lastAutoBackupAt,
    useLocalModel: row.useLocalModel === 1,
    localModelPath: row.localModelPath,
    useLocalWhisper: row.useLocalWhisper === 1,
    localWhisperPath: row.localWhisperPath,
    useNano: row.useNano === 1,
    quickStartStreak: row.quickStartStreak ?? 0,
    studyResourceMode: (row.studyResourceMode as UserProfile['studyResourceMode']) ?? 'hybrid',
    harassmentTone: (row.harassmentTone as HarassmentTone) ?? 'shame',
    customSubjectLoadMultipliers: (() => {
      try {
        return JSON.parse(row.subjectLoadOverridesJson ?? '{}');
      } catch {
        return {};
      }
    })() as Record<string, number>,
    backupDirectoryUri: row.backupDirectoryUri,
    loadingOrbStyle: (row.loadingOrbStyle as 'classic' | 'turbulent') ?? 'turbulent',
    pomodoroEnabled: row.pomodoroEnabled === 1,
    pomodoroIntervalMinutes: row.pomodoroIntervalMinutes ?? 20,
    cloudflareAccountId: row.cloudflareAccountId ?? '',
    cloudflareApiToken: row.cloudflareApiToken ?? '',
    falApiKey: row.falApiKey ?? '',
    braveSearchApiKey: row.braveSearchApiKey ?? '',
    googleCustomSearchApiKey: row.googleCustomSearchApiKey ?? '',
    guruChatDefaultModel: row.guruChatDefaultModel ?? 'auto',
    imageGenerationModel: row.imageGenerationModel ?? 'auto',
    imageGenerationOrder: (() => {
      try {
        return JSON.parse(row.imageGenerationOrder ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
    transcriptionOrder: (() => {
      try {
        return JSON.parse(row.transcriptionOrder ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
    actionHubTools: (() => {
      try {
        return JSON.parse(row.actionHubTools ?? '[]') as string[];
      } catch {
        return [];
      }
    })(),
    guruMemoryNotes: row.guruMemoryNotes ?? '',
    preferGeminiStructuredJson: row.preferGeminiStructuredJson === 1,
    githubModelsPat: row.githubModelsPat ?? '',
    kiloApiKey: row.kiloApiKey ?? '',
    deepseekKey: row.deepseekKey ?? '',
    agentRouterKey: row.agentRouterKey ?? '',
    providerOrder: sanitizeProviderOrder(
      (() => {
        try {
          return JSON.parse(row.providerOrder ?? '[]');
        } catch {
          return [];
        }
      })() as ProviderId[],
    ),
    apiValidation: (() => {
      try {
        return JSON.parse(row.apiValidationJson ?? '{}');
      } catch {
        return {};
      }
    })() as UserProfile['apiValidation'],
    chatgptAccounts,
    chatgptConnected,
    githubCopilotConnected: row.githubCopilotConnected === 1,
    githubCopilotPreferredModel: row.githubCopilotPreferredModel ?? '',
    gitlabDuoConnected: row.gitlabDuoConnected === 1,
    gitlabOauthClientId: row.gitlabOauthClientId ?? '',
    gitlabDuoPreferredModel: row.gitlabDuoPreferredModel ?? '',
    poeConnected: row.poeConnected === 1,
    gdriveWebClientId: row.gdriveWebClientId ?? '',
    gdriveConnected: row.gdriveConnected === 1,
    gdriveEmail: row.gdriveEmail ?? '',
    gdriveLastSyncAt: row.gdriveLastSyncAt,
    lastBackupDeviceId: row.lastBackupDeviceId ?? '',
    dbmciClassStartDate: row.dbmciClassStartDate,
    btrStartDate: row.btrStartDate,
    homeNoveltyCooldownHours: row.homeNoveltyCooldownHours ?? 6,
    autoRepairLegacyNotesEnabled: row.autoRepairLegacyNotesEnabled === 1,
    scanOrphanedTranscriptsEnabled: row.scanOrphanedTranscriptsEnabled === 1,
    deepgramApiKey: row.deepgramApiKey ?? '',
    jinaApiKey: row.jinaApiKey ?? '',
    vertexAiProject: row.vertexAiProject ?? '',
    vertexAiLocation: row.vertexAiLocation ?? '',
    vertexAiToken: row.vertexAiToken ?? '',
    qwenConnected: row.qwenConnected === 1,
    disabledProviders: (() => {
      try {
        return JSON.parse(row.disabledProviders ?? '[]');
      } catch {
        return [];
      }
    })() as ProviderId[],
    webSearchOrder: (() => {
      try {
        return sanitizeWebSearchOrder(JSON.parse(row.webSearchOrder ?? 'null'));
      } catch {
        return undefined;
      }
    })(),
    disabledWebSearchProviders: (() => {
      try {
        return JSON.parse(row.disabledWebSearchProviders ?? '[]') as WebSearchProviderId[];
      } catch {
        return [];
      }
    })(),
    samsungBatteryPromptShownAt: row.samsungBatteryPromptShownAt ?? undefined,
    orbEffect: row.orbEffect ?? 'ripple',
    embeddingProvider: row.embeddingProvider ?? 'gemini',
    embeddingModel: row.embeddingModel ?? 'models/text-embedding-004',
  };
}

/**
 * Maps a partial UserProfile update to a Drizzle update object.
 * Handles JSON serialization, boolean to integer conversion, and enum sanitization.
 */
export function mapToDrizzleUpdate(updates: Partial<UserProfile>): Partial<NewUserProfileRow> {
  const drizzleUpdate: Partial<NewUserProfileRow> = {};

  // Direct field mappings (camelCase to snake_case is handled by Drizzle column names)
  const directMappings: Record<string, keyof NewUserProfileRow> = {
    displayName: 'displayName',
    totalXp: 'totalXp',
    currentLevel: 'currentLevel',
    streakCurrent: 'streakCurrent',
    streakBest: 'streakBest',
    dailyGoalMinutes: 'dailyGoalMinutes',
    inicetDate: 'inicetDate',
    neetDate: 'neetDate',
    preferredSessionLength: 'preferredSessionLength',
    openrouterApiKey: 'openrouterApiKey',
    openrouterKey: 'openrouterKey',
    lastActiveDate: 'lastActiveDate',
    syncCode: 'syncCode',
    groqApiKey: 'groqApiKey',
    geminiKey: 'geminiKey',
    huggingfaceToken: 'huggingfaceToken',
    huggingfaceTranscriptionModel: 'huggingfaceTranscriptionModel',
    loadingOrbStyle: 'loadingOrbStyle',
    orbEffect: 'orbEffect',
    harassmentTone: 'harassmentTone',
    lastBackupDate: 'lastBackupDate',
    localModelPath: 'localModelPath',
    localWhisperPath: 'localWhisperPath',
    backupDirectoryUri: 'backupDirectoryUri',
    cloudflareAccountId: 'cloudflareAccountId',
    cloudflareApiToken: 'cloudflareApiToken',
    falApiKey: 'falApiKey',
    braveSearchApiKey: 'braveSearchApiKey',
    googleCustomSearchApiKey: 'googleCustomSearchApiKey',
    guruChatDefaultModel: 'guruChatDefaultModel',
    imageGenerationModel: 'imageGenerationModel',
    guruMemoryNotes: 'guruMemoryNotes',
    githubModelsPat: 'githubModelsPat',
    kiloApiKey: 'kiloApiKey',
    deepseekKey: 'deepseekKey',
    agentRouterKey: 'agentRouterKey',
    deepgramApiKey: 'deepgramApiKey',
    jinaApiKey: 'jinaApiKey',
    vertexAiProject: 'vertexAiProject',
    vertexAiLocation: 'vertexAiLocation',
    vertexAiToken: 'vertexAiToken',
    gdriveWebClientId: 'gdriveWebClientId',
    gdriveEmail: 'gdriveEmail',
    gdriveLastSyncAt: 'gdriveLastSyncAt',
    lastBackupDeviceId: 'lastBackupDeviceId',
    dbmciClassStartDate: 'dbmciClassStartDate',
    btrStartDate: 'btrStartDate',
    samsungBatteryPromptShownAt: 'samsungBatteryPromptShownAt',
    embeddingProvider: 'embeddingProvider',
    embeddingModel: 'embeddingModel',
  };

  // Boolean fields that need conversion to 0/1
  const booleanFields: Record<string, keyof NewUserProfileRow> = {
    notificationsEnabled: 'notificationsEnabled',
    strictModeEnabled: 'strictModeEnabled',
    doomscrollShieldEnabled: 'doomscrollShieldEnabled',
    bodyDoublingEnabled: 'bodyDoublingEnabled',
    focusAudioEnabled: 'focusAudioEnabled',
    visualTimersEnabled: 'visualTimersEnabled',
    faceTrackingEnabled: 'faceTrackingEnabled',
    useLocalModel: 'useLocalModel',
    useLocalWhisper: 'useLocalWhisper',
    useNano: 'useNano',
    pomodoroEnabled: 'pomodoroEnabled',
    preferGeminiStructuredJson: 'preferGeminiStructuredJson',
    chatgptConnected: 'chatgptConnected',
    githubCopilotConnected: 'githubCopilotConnected',
    gitlabDuoConnected: 'gitlabDuoConnected',
    poeConnected: 'poeConnected',
    qwenConnected: 'qwenConnected',
    gdriveConnected: 'gdriveConnected',
    autoRepairLegacyNotesEnabled: 'autoRepairLegacyNotesEnabled',
    scanOrphanedTranscriptsEnabled: 'scanOrphanedTranscriptsEnabled',
  };

  // Numeric fields
  const numericFields: Record<string, keyof NewUserProfileRow> = {
    idleTimeoutMinutes: 'idleTimeoutMinutes',
    breakDurationMinutes: 'breakDurationMinutes',
    notificationHour: 'notificationHour',
    quizCorrectCount: 'quizCorrectCount',
    quickStartStreak: 'quickStartStreak',
    pomodoroIntervalMinutes: 'pomodoroIntervalMinutes',
    homeNoveltyCooldownHours: 'homeNoveltyCooldownHours',
  };

  // Process direct mappings
  for (const [userProfileKey, drizzleKey] of Object.entries(directMappings)) {
    if (userProfileKey in updates) {
      const value = (updates as Record<string, unknown>)[userProfileKey];
      if (userProfileKey === 'inicetDate' || userProfileKey === 'neetDate') {
        (drizzleUpdate as Record<string, unknown>)[drizzleKey] = sanitizeExamDateOrDefault(
          value,
          userProfileKey === 'inicetDate' ? DEFAULT_INICET_DATE : DEFAULT_NEET_DATE,
        );
      } else {
        (drizzleUpdate as Record<string, unknown>)[drizzleKey] = value;
      }
    }
  }

  // Process boolean fields
  for (const [userProfileKey, drizzleKey] of Object.entries(booleanFields)) {
    if (userProfileKey in updates) {
      const value = (updates as Record<string, unknown>)[userProfileKey];
      (drizzleUpdate as Record<string, unknown>)[drizzleKey] =
        value === true || value === 1 ? 1 : 0;
    }
  }

  // Process numeric fields
  for (const [userProfileKey, drizzleKey] of Object.entries(numericFields)) {
    if (userProfileKey in updates) {
      const value = (updates as Record<string, unknown>)[userProfileKey];
      (drizzleUpdate as Record<string, unknown>)[drizzleKey] =
        typeof value === 'number' ? value : 0;
    }
  }

  // Process enum fields
  if ('examType' in updates) {
    drizzleUpdate.examType = sanitizeEnum('examType', updates.examType) as 'INICET' | 'NEET';
  }
  if ('transcriptionProvider' in updates) {
    drizzleUpdate.transcriptionProvider = sanitizeEnum(
      'transcriptionProvider',
      updates.transcriptionProvider,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    ) as any;
  }
  if ('autoBackupFrequency' in updates) {
    drizzleUpdate.autoBackupFrequency = sanitizeEnum(
      'autoBackupFrequency',
      updates.autoBackupFrequency,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    ) as any;
  }
  if ('guruFrequency' in updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    drizzleUpdate.guruFrequency = sanitizeEnum('guruFrequency', updates.guruFrequency) as any;
  }
  if ('studyResourceMode' in updates) {
    drizzleUpdate.studyResourceMode = sanitizeEnum(
      'studyResourceMode',
      updates.studyResourceMode,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    ) as any;
  }
  if ('harassmentTone' in updates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
    drizzleUpdate.harassmentTone = sanitizeEnum('harassmentTone', updates.harassmentTone) as any;
  }
  // Process JSON fields
  if ('blockedContentTypes' in updates) {
    drizzleUpdate.blockedContentTypes = JSON.stringify(updates.blockedContentTypes ?? []);
  }
  if ('focusSubjectIds' in updates) {
    drizzleUpdate.focusSubjectIds = JSON.stringify(updates.focusSubjectIds ?? []);
  }
  if ('customSubjectLoadMultipliers' in updates) {
    drizzleUpdate.subjectLoadOverridesJson = JSON.stringify(
      updates.customSubjectLoadMultipliers ?? {},
    );
  }
  if ('providerOrder' in updates) {
    drizzleUpdate.providerOrder = JSON.stringify(updates.providerOrder ?? []);
  }
  if ('imageGenerationOrder' in updates) {
    drizzleUpdate.imageGenerationOrder = JSON.stringify(updates.imageGenerationOrder ?? []);
  }
  if ('transcriptionOrder' in updates) {
    drizzleUpdate.transcriptionOrder = JSON.stringify(updates.transcriptionOrder ?? []);
  }
  if ('actionHubTools' in updates) {
    drizzleUpdate.actionHubTools = JSON.stringify(updates.actionHubTools ?? []);
  }
  if ('disabledProviders' in updates) {
    drizzleUpdate.disabledProviders = JSON.stringify(updates.disabledProviders ?? []);
  }
  if ('webSearchOrder' in updates) {
    drizzleUpdate.webSearchOrder = JSON.stringify(updates.webSearchOrder ?? null);
  }
  if ('disabledWebSearchProviders' in updates) {
    drizzleUpdate.disabledWebSearchProviders = JSON.stringify(
      updates.disabledWebSearchProviders ?? [],
    );
  }
  if ('apiValidation' in updates) {
    drizzleUpdate.apiValidationJson = JSON.stringify(updates.apiValidation ?? {});
  }
  if ('chatgptAccounts' in updates) {
    drizzleUpdate.chatgptAccountsJson = JSON.stringify(
      sanitizeChatGptAccountsConfig(updates.chatgptAccounts, false),
    );
  }
  if ('githubCopilotPreferredModel' in updates) {
    drizzleUpdate.githubCopilotPreferredModel = updates.githubCopilotPreferredModel ?? '';
  }
  if ('gitlabOauthClientId' in updates) {
    drizzleUpdate.gitlabOauthClientId = updates.gitlabOauthClientId ?? '';
  }
  if ('gitlabDuoPreferredModel' in updates) {
    drizzleUpdate.gitlabDuoPreferredModel = updates.gitlabDuoPreferredModel ?? '';
  }
  if ('lastAutoBackupAt' in updates) {
    drizzleUpdate.lastAutoBackupAt = updates.lastAutoBackupAt ?? null;
  }

  return drizzleUpdate;
}

/**
 * Creates a default UserProfile object (used when no row exists in DB).
 */
export function createDefaultUserProfile(): UserProfile {
  return {
    displayName: 'Doctor',
    totalXp: 0,
    currentLevel: 1,
    streakCurrent: 0,
    streakBest: 0,
    dailyGoalMinutes: 120,
    examType: 'INICET',
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
    doomscrollShieldEnabled: true,
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
    autoBackupFrequency: 'off',
    lastAutoBackupAt: null,
    useLocalModel: false,
    localModelPath: null,
    useLocalWhisper: false,
    localWhisperPath: null,
    useNano: true,
    quickStartStreak: 0,
    studyResourceMode: 'hybrid',
    loadingOrbStyle: 'turbulent',
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
    imageGenerationModel: 'auto',
    imageGenerationOrder: [],
    transcriptionOrder: [],
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
    autoRepairLegacyNotesEnabled: false,
    scanOrphanedTranscriptsEnabled: false,
    deepgramApiKey: '',
    jinaApiKey: '',
    vertexAiProject: '',
    vertexAiLocation: '',
    vertexAiToken: '',
    qwenConnected: false,
    disabledProviders: [],
    webSearchOrder: undefined,
    disabledWebSearchProviders: [],
    samsungBatteryPromptShownAt: undefined,
    orbEffect: 'ripple',
    embeddingProvider: 'gemini',
    embeddingModel: 'models/text-embedding-004',
  };
}
