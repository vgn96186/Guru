'use strict';
/**
 * Drizzle ORM schema definitions.
 *
 * Mirrors SQLite schema from src/db/schema.ts + migration_history from
 * migrations.ts for parity testing and repository migration.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.migrationHistory =
  exports.userContentFlags =
  exports.contentFactChecks =
  exports.mindMapEdges =
  exports.mindMapNodes =
  exports.mindMaps =
  exports.lectureScheduleProgress =
  exports.questionBank =
  exports.topicSuggestions =
  exports.planEvents =
  exports.dailyAgenda =
  exports.offlineAiQueue =
  exports.generatedStudyImages =
  exports.chatHistory =
  exports.externalAppLogs =
  exports.brainDumps =
  exports.guruChatThreads =
  exports.guruChatSessionMemory =
  exports.userProfile =
  exports.aiCache =
  exports.dailyLog =
  exports.lectureLearnedTopics =
  exports.lectureNotes =
  exports.sessions =
  exports.topicProgress =
  exports.topics =
  exports.subjects =
    void 0;
var sqlite_core_1 = require('drizzle-orm/sqlite-core');
var appConfig_1 = require('../config/appConfig');
exports.subjects = (0, sqlite_core_1.sqliteTable)('subjects', {
  id: (0, sqlite_core_1.integer)('id').primaryKey(),
  name: (0, sqlite_core_1.text)('name').notNull(),
  shortCode: (0, sqlite_core_1.text)('short_code').notNull(),
  colorHex: (0, sqlite_core_1.text)('color_hex').notNull(),
  inicetWeight: (0, sqlite_core_1.integer)('inicet_weight').notNull(),
  neetWeight: (0, sqlite_core_1.integer)('neet_weight').notNull(),
  displayOrder: (0, sqlite_core_1.integer)('display_order').notNull(),
});
exports.topics = (0, sqlite_core_1.sqliteTable)(
  'topics',
  {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    subjectId: (0, sqlite_core_1.integer)('subject_id').notNull(),
    parentTopicId: (0, sqlite_core_1.integer)('parent_topic_id'),
    name: (0, sqlite_core_1.text)('name').notNull(),
    estimatedMinutes: (0, sqlite_core_1.integer)('estimated_minutes').default(35),
    inicetPriority: (0, sqlite_core_1.integer)('inicet_priority').default(5),
    embedding: (0, sqlite_core_1.blob)('embedding'),
  },
  function (table) {
    return {
      subjectNameUnique: (0, sqlite_core_1.uniqueIndex)('topics_subject_name_unique').on(
        table.subjectId,
        table.name,
      ),
    };
  },
);
exports.topicProgress = (0, sqlite_core_1.sqliteTable)('topic_progress', {
  topicId: (0, sqlite_core_1.integer)('topic_id').primaryKey(),
  status: (0, sqlite_core_1.text)('status').notNull().default('unseen'),
  confidence: (0, sqlite_core_1.integer)('confidence').notNull().default(0),
  lastStudiedAt: (0, sqlite_core_1.integer)('last_studied_at'),
  timesStudied: (0, sqlite_core_1.integer)('times_studied').notNull().default(0),
  xpEarned: (0, sqlite_core_1.integer)('xp_earned').notNull().default(0),
  nextReviewDate: (0, sqlite_core_1.text)('next_review_date'),
  userNotes: (0, sqlite_core_1.text)('user_notes').notNull().default(''),
  wrongCount: (0, sqlite_core_1.integer)('wrong_count').notNull().default(0),
  isNemesis: (0, sqlite_core_1.integer)('is_nemesis').notNull().default(0),
  fsrsDue: (0, sqlite_core_1.text)('fsrs_due'),
  fsrsStability: (0, sqlite_core_1.real)('fsrs_stability').default(0),
  fsrsDifficulty: (0, sqlite_core_1.real)('fsrs_difficulty').default(0),
  fsrsElapsedDays: (0, sqlite_core_1.integer)('fsrs_elapsed_days').default(0),
  fsrsScheduledDays: (0, sqlite_core_1.integer)('fsrs_scheduled_days').default(0),
  fsrsReps: (0, sqlite_core_1.integer)('fsrs_reps').default(0),
  fsrsLapses: (0, sqlite_core_1.integer)('fsrs_lapses').default(0),
  fsrsState: (0, sqlite_core_1.integer)('fsrs_state').default(0),
  fsrsLastReview: (0, sqlite_core_1.text)('fsrs_last_review'),
});
exports.sessions = (0, sqlite_core_1.sqliteTable)('sessions', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  startedAt: (0, sqlite_core_1.integer)('started_at').notNull(),
  endedAt: (0, sqlite_core_1.integer)('ended_at'),
  plannedTopics: (0, sqlite_core_1.text)('planned_topics').notNull().default('[]'),
  completedTopics: (0, sqlite_core_1.text)('completed_topics').notNull().default('[]'),
  totalXpEarned: (0, sqlite_core_1.integer)('total_xp_earned').notNull().default(0),
  durationMinutes: (0, sqlite_core_1.integer)('duration_minutes'),
  mood: (0, sqlite_core_1.text)('mood'),
  mode: (0, sqlite_core_1.text)('mode').notNull().default('normal'),
  notes: (0, sqlite_core_1.text)('notes'),
});
exports.lectureNotes = (0, sqlite_core_1.sqliteTable)('lecture_notes', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  subjectId: (0, sqlite_core_1.integer)('subject_id'),
  note: (0, sqlite_core_1.text)('note').notNull(),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  transcript: (0, sqlite_core_1.text)('transcript'),
  summary: (0, sqlite_core_1.text)('summary'),
  topicsJson: (0, sqlite_core_1.text)('topics_json'),
  appName: (0, sqlite_core_1.text)('app_name'),
  durationMinutes: (0, sqlite_core_1.integer)('duration_minutes'),
  confidence: (0, sqlite_core_1.integer)('confidence').default(2),
  embedding: (0, sqlite_core_1.blob)('embedding'),
  recordingPath: (0, sqlite_core_1.text)('recording_path'),
  recordingDurationSeconds: (0, sqlite_core_1.integer)('recording_duration_seconds'),
  transcriptionConfidence: (0, sqlite_core_1.real)('transcription_confidence'),
  processingMetricsJson: (0, sqlite_core_1.text)('processing_metrics_json'),
  retryCount: (0, sqlite_core_1.integer)('retry_count').default(0),
  lastError: (0, sqlite_core_1.text)('last_error'),
});
exports.lectureLearnedTopics = (0, sqlite_core_1.sqliteTable)(
  'lecture_learned_topics',
  {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    lectureNoteId: (0, sqlite_core_1.integer)('lecture_note_id').notNull(),
    topicId: (0, sqlite_core_1.integer)('topic_id').notNull(),
    confidenceAtTime: (0, sqlite_core_1.integer)('confidence_at_time').notNull().default(2),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  },
  function (table) {
    return {
      lectureTopicUnique: (0, sqlite_core_1.uniqueIndex)('llt_lecture_topic_unique').on(
        table.lectureNoteId,
        table.topicId,
      ),
    };
  },
);
exports.dailyLog = (0, sqlite_core_1.sqliteTable)('daily_log', {
  date: (0, sqlite_core_1.text)('date').primaryKey(),
  checkedIn: (0, sqlite_core_1.integer)('checked_in').notNull().default(0),
  mood: (0, sqlite_core_1.text)('mood'),
  totalMinutes: (0, sqlite_core_1.integer)('total_minutes').notNull().default(0),
  xpEarned: (0, sqlite_core_1.integer)('xp_earned').notNull().default(0),
  sessionCount: (0, sqlite_core_1.integer)('session_count').notNull().default(0),
});
exports.aiCache = (0, sqlite_core_1.sqliteTable)(
  'ai_cache',
  {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    topicId: (0, sqlite_core_1.integer)('topic_id').notNull(),
    contentType: (0, sqlite_core_1.text)('content_type').notNull(),
    contentJson: (0, sqlite_core_1.text)('content_json').notNull(),
    modelUsed: (0, sqlite_core_1.text)('model_used').notNull(),
    createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
    isFlagged: (0, sqlite_core_1.integer)('is_flagged').notNull().default(0),
  },
  function (table) {
    return {
      topicContentUnique: (0, sqlite_core_1.uniqueIndex)('ai_cache_topic_content_unique').on(
        table.topicId,
        table.contentType,
      ),
    };
  },
);
exports.userProfile = (0, sqlite_core_1.sqliteTable)('user_profile', {
  id: (0, sqlite_core_1.integer)('id').primaryKey().default(1),
  displayName: (0, sqlite_core_1.text)('display_name').notNull().default('Doctor'),
  totalXp: (0, sqlite_core_1.integer)('total_xp').notNull().default(0),
  currentLevel: (0, sqlite_core_1.integer)('current_level').notNull().default(1),
  streakCurrent: (0, sqlite_core_1.integer)('streak_current').notNull().default(0),
  streakBest: (0, sqlite_core_1.integer)('streak_best').notNull().default(0),
  dailyGoalMinutes: (0, sqlite_core_1.integer)('daily_goal_minutes').notNull().default(120),
  inicetDate: (0, sqlite_core_1.text)('inicet_date')
    .notNull()
    .default(appConfig_1.DEFAULT_INICET_DATE),
  neetDate: (0, sqlite_core_1.text)('neet_date').notNull().default(appConfig_1.DEFAULT_NEET_DATE),
  preferredSessionLength: (0, sqlite_core_1.integer)('preferred_session_length')
    .notNull()
    .default(45),
  openrouterApiKey: (0, sqlite_core_1.text)('openrouter_api_key').notNull().default(''),
  openrouterKey: (0, sqlite_core_1.text)('openrouter_key').notNull().default(''),
  notificationsEnabled: (0, sqlite_core_1.integer)('notifications_enabled').notNull().default(1),
  lastActiveDate: (0, sqlite_core_1.text)('last_active_date'),
  syncCode: (0, sqlite_core_1.text)('sync_code'),
  strictModeEnabled: (0, sqlite_core_1.integer)('strict_mode_enabled').notNull().default(0),
  streakShieldAvailable: (0, sqlite_core_1.integer)('streak_shield_available').notNull().default(1),
  bodyDoublingEnabled: (0, sqlite_core_1.integer)('body_doubling_enabled').notNull().default(1),
  blockedContentTypes: (0, sqlite_core_1.text)('blocked_content_types').notNull().default('[]'),
  idleTimeoutMinutes: (0, sqlite_core_1.integer)('idle_timeout_minutes').notNull().default(2),
  breakDurationMinutes: (0, sqlite_core_1.integer)('break_duration_minutes').notNull().default(5),
  notificationHour: (0, sqlite_core_1.integer)('notification_hour').notNull().default(7),
  guruFrequency: (0, sqlite_core_1.text)('guru_frequency').notNull().default('normal'),
  focusSubjectIds: (0, sqlite_core_1.text)('focus_subject_ids').notNull().default('[]'),
  focusAudioEnabled: (0, sqlite_core_1.integer)('focus_audio_enabled').notNull().default(0),
  visualTimersEnabled: (0, sqlite_core_1.integer)('visual_timers_enabled').notNull().default(0),
  faceTrackingEnabled: (0, sqlite_core_1.integer)('face_tracking_enabled').notNull().default(0),
  quizCorrectCount: (0, sqlite_core_1.integer)('quiz_correct_count').notNull().default(0),
  lastBackupDate: (0, sqlite_core_1.text)('last_backup_date'),
  useLocalModel: (0, sqlite_core_1.integer)('use_local_model').notNull().default(1),
  localModelPath: (0, sqlite_core_1.text)('local_model_path'),
  useLocalWhisper: (0, sqlite_core_1.integer)('use_local_whisper').notNull().default(1),
  localWhisperPath: (0, sqlite_core_1.text)('local_whisper_path'),
  useNano: (0, sqlite_core_1.integer)('use_nano').notNull().default(1),
  quickStartStreak: (0, sqlite_core_1.integer)('quick_start_streak').notNull().default(0),
  groqApiKey: (0, sqlite_core_1.text)('groq_api_key').notNull().default(''),
  geminiKey: (0, sqlite_core_1.text)('gemini_key').notNull().default(''),
  huggingfaceToken: (0, sqlite_core_1.text)('huggingface_token').notNull().default(''),
  huggingfaceTranscriptionModel: (0, sqlite_core_1.text)('huggingface_transcription_model')
    .notNull()
    .default('openai/whisper-large-v3'),
  transcriptionProvider: (0, sqlite_core_1.text)('transcription_provider')
    .notNull()
    .default('auto'),
  studyResourceMode: (0, sqlite_core_1.text)('study_resource_mode').notNull().default('hybrid'),
  subjectLoadOverridesJson: (0, sqlite_core_1.text)('subject_load_overrides_json')
    .notNull()
    .default('{}'),
  loadingOrbStyle: (0, sqlite_core_1.text)('loading_orb_style').notNull().default('classic'),
  backupDirectoryUri: (0, sqlite_core_1.text)('backup_directory_uri'),
  pomodoroEnabled: (0, sqlite_core_1.integer)('pomodoro_enabled').notNull().default(1),
  pomodoroIntervalMinutes: (0, sqlite_core_1.integer)('pomodoro_interval_minutes')
    .notNull()
    .default(20),
  cloudflareAccountId: (0, sqlite_core_1.text)('cloudflare_account_id').notNull().default(''),
  cloudflareApiToken: (0, sqlite_core_1.text)('cloudflare_api_token').notNull().default(''),
  falApiKey: (0, sqlite_core_1.text)('fal_api_key').notNull().default(''),
  braveSearchApiKey: (0, sqlite_core_1.text)('brave_search_api_key').notNull().default(''),
  googleCustomSearchApiKey: (0, sqlite_core_1.text)('google_custom_search_api_key')
    .notNull()
    .default(''),
  qwenConnected: (0, sqlite_core_1.integer)('qwen_connected').notNull().default(0),
  guruChatDefaultModel: (0, sqlite_core_1.text)('guru_chat_default_model')
    .notNull()
    .default('auto'),
  guruMemoryNotes: (0, sqlite_core_1.text)('guru_memory_notes').notNull().default(''),
  imageGenerationModel: (0, sqlite_core_1.text)('image_generation_model').notNull().default('auto'),
  examType: (0, sqlite_core_1.text)('exam_type').notNull().default('INICET'),
  preferGeminiStructuredJson: (0, sqlite_core_1.integer)('prefer_gemini_structured_json')
    .notNull()
    .default(1),
  githubModelsPat: (0, sqlite_core_1.text)('github_models_pat').notNull().default(''),
  kiloApiKey: (0, sqlite_core_1.text)('kilo_api_key').notNull().default(''),
  deepseekKey: (0, sqlite_core_1.text)('deepseek_key').notNull().default(''),
  agentRouterKey: (0, sqlite_core_1.text)('agentrouter_key').notNull().default(''),
  providerOrder: (0, sqlite_core_1.text)('provider_order').notNull().default('[]'),
  deepgramApiKey: (0, sqlite_core_1.text)('deepgram_api_key').notNull().default(''),
  apiValidationJson: (0, sqlite_core_1.text)('api_validation_json').notNull().default('{}'),
  chatgptConnected: (0, sqlite_core_1.integer)('chatgpt_connected').notNull().default(0),
  chatgptAccountsJson: (0, sqlite_core_1.text)('chatgpt_accounts_json')
    .notNull()
    .default(
      '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}',
    ),
  autoBackupFrequency: (0, sqlite_core_1.text)('auto_backup_frequency').notNull().default('off'),
  lastAutoBackupAt: (0, sqlite_core_1.text)('last_auto_backup_at'),
  githubCopilotConnected: (0, sqlite_core_1.integer)('github_copilot_connected')
    .notNull()
    .default(0),
  githubCopilotPreferredModel: (0, sqlite_core_1.text)('github_copilot_preferred_model')
    .notNull()
    .default(''),
  gitlabDuoConnected: (0, sqlite_core_1.integer)('gitlab_duo_connected').notNull().default(0),
  gitlabOauthClientId: (0, sqlite_core_1.text)('gitlab_oauth_client_id').notNull().default(''),
  gitlabDuoPreferredModel: (0, sqlite_core_1.text)('gitlab_duo_preferred_model')
    .notNull()
    .default(''),
  poeConnected: (0, sqlite_core_1.integer)('poe_connected').notNull().default(0),
  gdriveWebClientId: (0, sqlite_core_1.text)('gdrive_web_client_id').notNull().default(''),
  gdriveConnected: (0, sqlite_core_1.integer)('gdrive_connected').notNull().default(0),
  gdriveEmail: (0, sqlite_core_1.text)('gdrive_email').notNull().default(''),
  gdriveLastSyncAt: (0, sqlite_core_1.text)('gdrive_last_sync_at'),
  lastBackupDeviceId: (0, sqlite_core_1.text)('last_backup_device_id').notNull().default(''),
  dbmciClassStartDate: (0, sqlite_core_1.text)('dbmci_class_start_date'),
  btrStartDate: (0, sqlite_core_1.text)('btr_start_date'),
  homeNoveltyCooldownHours: (0, sqlite_core_1.integer)('home_novelty_cooldown_hours')
    .notNull()
    .default(6),
  disabledProviders: (0, sqlite_core_1.text)('disabled_providers').notNull().default('[]'),
  jinaApiKey: (0, sqlite_core_1.text)('jina_api_key').notNull().default(''),
  autoRepairLegacyNotesEnabled: (0, sqlite_core_1.integer)('auto_repair_legacy_notes_enabled')
    .notNull()
    .default(0),
  scanOrphanedTranscriptsEnabled: (0, sqlite_core_1.integer)('scan_orphaned_transcripts_enabled')
    .notNull()
    .default(0),
});
exports.guruChatSessionMemory = (0, sqlite_core_1.sqliteTable)('guru_chat_session_memory', {
  threadId: (0, sqlite_core_1.integer)('thread_id').primaryKey(),
  topicName: (0, sqlite_core_1.text)('topic_name').notNull(),
  summaryText: (0, sqlite_core_1.text)('summary_text').notNull().default(''),
  stateJson: (0, sqlite_core_1.text)('state_json').notNull().default('{}'),
  updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
  messagesAtLastSummary: (0, sqlite_core_1.integer)('messages_at_last_summary')
    .notNull()
    .default(0),
});
exports.guruChatThreads = (0, sqlite_core_1.sqliteTable)('guru_chat_threads', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  topicName: (0, sqlite_core_1.text)('topic_name').notNull(),
  syllabusTopicId: (0, sqlite_core_1.integer)('syllabus_topic_id'),
  title: (0, sqlite_core_1.text)('title').notNull().default(''),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
  lastMessageAt: (0, sqlite_core_1.integer)('last_message_at').notNull(),
  lastMessagePreview: (0, sqlite_core_1.text)('last_message_preview').notNull().default(''),
});
exports.brainDumps = (0, sqlite_core_1.sqliteTable)('brain_dumps', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  note: (0, sqlite_core_1.text)('note').notNull(),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.externalAppLogs = (0, sqlite_core_1.sqliteTable)('external_app_logs', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  appName: (0, sqlite_core_1.text)('app_name').notNull(),
  launchedAt: (0, sqlite_core_1.integer)('launched_at').notNull(),
  returnedAt: (0, sqlite_core_1.integer)('returned_at'),
  durationMinutes: (0, sqlite_core_1.real)('duration_minutes'),
  notes: (0, sqlite_core_1.text)('notes'),
  recordingPath: (0, sqlite_core_1.text)('recording_path'),
  transcriptionStatus: (0, sqlite_core_1.text)('transcription_status').default('pending'),
  transcriptionError: (0, sqlite_core_1.text)('transcription_error'),
  lectureNoteId: (0, sqlite_core_1.integer)('lecture_note_id'),
  noteEnhancementStatus: (0, sqlite_core_1.text)('note_enhancement_status').default('pending'),
  pipelineMetricsJson: (0, sqlite_core_1.text)('pipeline_metrics_json'),
});
exports.chatHistory = (0, sqlite_core_1.sqliteTable)('chat_history', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  threadId: (0, sqlite_core_1.integer)('thread_id'),
  topicName: (0, sqlite_core_1.text)('topic_name').notNull(),
  role: (0, sqlite_core_1.text)('role').notNull(),
  message: (0, sqlite_core_1.text)('message').notNull(),
  timestamp: (0, sqlite_core_1.integer)('timestamp').notNull(),
  sourcesJson: (0, sqlite_core_1.text)('sources_json'),
  modelUsed: (0, sqlite_core_1.text)('model_used'),
});
exports.generatedStudyImages = (0, sqlite_core_1.sqliteTable)('generated_study_images', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  contextType: (0, sqlite_core_1.text)('context_type').notNull(),
  contextKey: (0, sqlite_core_1.text)('context_key').notNull(),
  topicId: (0, sqlite_core_1.integer)('topic_id'),
  topicName: (0, sqlite_core_1.text)('topic_name').notNull(),
  lectureNoteId: (0, sqlite_core_1.integer)('lecture_note_id'),
  style: (0, sqlite_core_1.text)('style').notNull(),
  prompt: (0, sqlite_core_1.text)('prompt').notNull(),
  provider: (0, sqlite_core_1.text)('provider').notNull(),
  modelUsed: (0, sqlite_core_1.text)('model_used').notNull(),
  mimeType: (0, sqlite_core_1.text)('mime_type').notNull().default('image/png'),
  localUri: (0, sqlite_core_1.text)('local_uri').notNull(),
  remoteUrl: (0, sqlite_core_1.text)('remote_url'),
  width: (0, sqlite_core_1.integer)('width'),
  height: (0, sqlite_core_1.integer)('height'),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.offlineAiQueue = (0, sqlite_core_1.sqliteTable)('offline_ai_queue', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  requestType: (0, sqlite_core_1.text)('request_type').notNull(),
  payload: (0, sqlite_core_1.text)('payload').notNull(),
  status: (0, sqlite_core_1.text)('status').default('pending'),
  attempts: (0, sqlite_core_1.integer)('attempts').default(0),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  lastAttemptAt: (0, sqlite_core_1.integer)('last_attempt_at'),
  errorMessage: (0, sqlite_core_1.text)('error_message'),
});
exports.dailyAgenda = (0, sqlite_core_1.sqliteTable)('daily_agenda', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  date: (0, sqlite_core_1.text)('date').notNull(),
  planJson: (0, sqlite_core_1.text)('plan_json').notNull(),
  source: (0, sqlite_core_1.text)('source').default('guru'),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
});
exports.planEvents = (0, sqlite_core_1.sqliteTable)('plan_events', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  date: (0, sqlite_core_1.text)('date').notNull(),
  eventType: (0, sqlite_core_1.text)('event_type').notNull(),
  payloadJson: (0, sqlite_core_1.text)('payload_json').notNull(),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.topicSuggestions = (0, sqlite_core_1.sqliteTable)(
  'topic_suggestions',
  {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    subjectId: (0, sqlite_core_1.integer)('subject_id').notNull(),
    name: (0, sqlite_core_1.text)('name').notNull(),
    normalizedName: (0, sqlite_core_1.text)('normalized_name').notNull(),
    sourceSummary: (0, sqlite_core_1.text)('source_summary'),
    mentionCount: (0, sqlite_core_1.integer)('mention_count').notNull().default(1),
    status: (0, sqlite_core_1.text)('status').notNull().default('pending'),
    approvedTopicId: (0, sqlite_core_1.integer)('approved_topic_id'),
    firstDetectedAt: (0, sqlite_core_1.integer)('first_detected_at').notNull(),
    lastDetectedAt: (0, sqlite_core_1.integer)('last_detected_at').notNull(),
  },
  function (table) {
    return {
      subjectNormalizedUnique: (0, sqlite_core_1.uniqueIndex)('topic_suggestions_unique').on(
        table.subjectId,
        table.normalizedName,
      ),
    };
  },
);
exports.questionBank = (0, sqlite_core_1.sqliteTable)('question_bank', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  question: (0, sqlite_core_1.text)('question').notNull(),
  options: (0, sqlite_core_1.text)('options').notNull(),
  correctIndex: (0, sqlite_core_1.integer)('correct_index').notNull(),
  explanation: (0, sqlite_core_1.text)('explanation').notNull(),
  topicId: (0, sqlite_core_1.integer)('topic_id'),
  topicName: (0, sqlite_core_1.text)('topic_name').notNull().default(''),
  subjectName: (0, sqlite_core_1.text)('subject_name').notNull().default(''),
  source: (0, sqlite_core_1.text)('source').notNull().default('content_card'),
  sourceId: (0, sqlite_core_1.text)('source_id'),
  imageUrl: (0, sqlite_core_1.text)('image_url'),
  isBookmarked: (0, sqlite_core_1.integer)('is_bookmarked').notNull().default(0),
  isMastered: (0, sqlite_core_1.integer)('is_mastered').notNull().default(0),
  timesSeen: (0, sqlite_core_1.integer)('times_seen').notNull().default(0),
  timesCorrect: (0, sqlite_core_1.integer)('times_correct').notNull().default(0),
  lastSeenAt: (0, sqlite_core_1.integer)('last_seen_at'),
  nextReviewAt: (0, sqlite_core_1.integer)('next_review_at'),
  difficulty: (0, sqlite_core_1.real)('difficulty').notNull().default(0.5),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.lectureScheduleProgress = (0, sqlite_core_1.sqliteTable)(
  'lecture_schedule_progress',
  {
    id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
    batchId: (0, sqlite_core_1.text)('batch_id').notNull(),
    lectureIndex: (0, sqlite_core_1.integer)('lecture_index').notNull(),
    completedAt: (0, sqlite_core_1.integer)('completed_at').notNull(),
  },
  function (table) {
    return {
      batchLectureUnique: (0, sqlite_core_1.uniqueIndex)(
        'lecture_schedule_batch_lecture_unique',
      ).on(table.batchId, table.lectureIndex),
    };
  },
);
exports.mindMaps = (0, sqlite_core_1.sqliteTable)('mind_maps', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  title: (0, sqlite_core_1.text)('title').notNull(),
  subjectId: (0, sqlite_core_1.integer)('subject_id'),
  topicId: (0, sqlite_core_1.integer)('topic_id'),
  viewportJson: (0, sqlite_core_1.text)('viewport_json')
    .notNull()
    .default('{"x":0,"y":0,"scale":1}'),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
  updatedAt: (0, sqlite_core_1.integer)('updated_at').notNull(),
});
exports.mindMapNodes = (0, sqlite_core_1.sqliteTable)('mind_map_nodes', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  mapId: (0, sqlite_core_1.integer)('map_id').notNull(),
  topicId: (0, sqlite_core_1.integer)('topic_id'),
  label: (0, sqlite_core_1.text)('label').notNull(),
  x: (0, sqlite_core_1.real)('x').notNull().default(0),
  y: (0, sqlite_core_1.real)('y').notNull().default(0),
  color: (0, sqlite_core_1.text)('color'),
  isCenter: (0, sqlite_core_1.integer)('is_center').notNull().default(0),
  aiGenerated: (0, sqlite_core_1.integer)('ai_generated').notNull().default(0),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.mindMapEdges = (0, sqlite_core_1.sqliteTable)('mind_map_edges', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  mapId: (0, sqlite_core_1.integer)('map_id').notNull(),
  sourceNodeId: (0, sqlite_core_1.integer)('source_node_id').notNull(),
  targetNodeId: (0, sqlite_core_1.integer)('target_node_id').notNull(),
  label: (0, sqlite_core_1.text)('label'),
  createdAt: (0, sqlite_core_1.integer)('created_at').notNull(),
});
exports.contentFactChecks = (0, sqlite_core_1.sqliteTable)('content_fact_checks', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  topicId: (0, sqlite_core_1.integer)('topic_id').notNull(),
  contentType: (0, sqlite_core_1.text)('content_type').notNull(),
  checkStatus: (0, sqlite_core_1.text)('check_status').notNull().default('pending'),
  contradictionsJson: (0, sqlite_core_1.text)('contradictions_json'),
  checkedAt: (0, sqlite_core_1.integer)('checked_at').notNull(),
});
exports.userContentFlags = (0, sqlite_core_1.sqliteTable)('user_content_flags', {
  id: (0, sqlite_core_1.integer)('id').primaryKey({ autoIncrement: true }),
  topicId: (0, sqlite_core_1.integer)('topic_id').notNull(),
  contentType: (0, sqlite_core_1.text)('content_type').notNull(),
  userNote: (0, sqlite_core_1.text)('user_note'),
  flagReason: (0, sqlite_core_1.text)('flag_reason').notNull(),
  flaggedAt: (0, sqlite_core_1.integer)('flagged_at').notNull(),
  resolved: (0, sqlite_core_1.integer)('resolved').notNull().default(0),
  resolvedAt: (0, sqlite_core_1.integer)('resolved_at'),
});
exports.migrationHistory = (0, sqlite_core_1.sqliteTable)('migration_history', {
  version: (0, sqlite_core_1.integer)('version').primaryKey(),
  appliedAt: (0, sqlite_core_1.integer)('applied_at').notNull(),
  description: (0, sqlite_core_1.text)('description'),
});
