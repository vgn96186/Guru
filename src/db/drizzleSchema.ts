/**
 * Drizzle ORM schema definitions.
 *
 * Mirrors SQLite schema from src/db/schema.ts + migration_history from
 * migrations.ts for parity testing and repository migration.
 */

import { blob, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const DB_DEFAULT_INICET_DATE = '2026-05-17';
const DB_DEFAULT_NEET_DATE = '2026-08-30';

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  shortCode: text('short_code').notNull(),
  colorHex: text('color_hex').notNull(),
  inicetWeight: integer('inicet_weight').notNull(),
  neetWeight: integer('neet_weight').notNull(),
  displayOrder: integer('display_order').notNull(),
});

export const topics = sqliteTable(
  'topics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id').notNull(),
    parentTopicId: integer('parent_topic_id'),
    name: text('name').notNull(),
    estimatedMinutes: integer('estimated_minutes').default(35),
    inicetPriority: integer('inicet_priority').default(5),
    embedding: blob('embedding'),
  },
  (table) => ({
    subjectNameUnique: uniqueIndex('topics_subject_name_unique').on(table.subjectId, table.name),
  }),
);

export const topicProgress = sqliteTable('topic_progress', {
  topicId: integer('topic_id').primaryKey(),
  status: text('status').notNull().default('unseen'),
  confidence: integer('confidence').notNull().default(0),
  lastStudiedAt: integer('last_studied_at'),
  timesStudied: integer('times_studied').notNull().default(0),
  xpEarned: integer('xp_earned').notNull().default(0),
  nextReviewDate: text('next_review_date'),
  userNotes: text('user_notes').notNull().default(''),
  wrongCount: integer('wrong_count').notNull().default(0),
  isNemesis: integer('is_nemesis').notNull().default(0),
  fsrsDue: text('fsrs_due'),
  fsrsStability: real('fsrs_stability').default(0),
  fsrsDifficulty: real('fsrs_difficulty').default(0),
  fsrsElapsedDays: integer('fsrs_elapsed_days').default(0),
  fsrsScheduledDays: integer('fsrs_scheduled_days').default(0),
  fsrsReps: integer('fsrs_reps').default(0),
  fsrsLapses: integer('fsrs_lapses').default(0),
  fsrsState: integer('fsrs_state').default(0),
  fsrsLastReview: text('fsrs_last_review'),
});

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  plannedTopics: text('planned_topics').notNull().default('[]'),
  completedTopics: text('completed_topics').notNull().default('[]'),
  totalXpEarned: integer('total_xp_earned').notNull().default(0),
  durationMinutes: integer('duration_minutes'),
  cardsCreated: integer('cards_created').default(0),
  nodesCreated: integer('nodes_created').default(0),
  mood: text('mood'),
  mode: text('mode').notNull().default('normal'),
  notes: text('notes'),
});

export const lectureNotes = sqliteTable('lecture_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  subjectId: integer('subject_id'),
  note: text('note').notNull(),
  createdAt: integer('created_at').notNull(),
  transcript: text('transcript'),
  summary: text('summary'),
  topicsJson: text('topics_json'),
  appName: text('app_name'),
  durationMinutes: integer('duration_minutes'),
  confidence: integer('confidence').default(2),
  embedding: blob('embedding'),
  recordingPath: text('recording_path'),
  recordingDurationSeconds: integer('recording_duration_seconds'),
  transcriptionConfidence: real('transcription_confidence'),
  processingMetricsJson: text('processing_metrics_json'),
  retryCount: integer('retry_count').default(0),
  lastError: text('last_error'),
});

export const lectureLearnedTopics = sqliteTable(
  'lecture_learned_topics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lectureNoteId: integer('lecture_note_id').notNull(),
    topicId: integer('topic_id').notNull(),
    confidenceAtTime: integer('confidence_at_time').notNull().default(2),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    lectureTopicUnique: uniqueIndex('llt_lecture_topic_unique').on(
      table.lectureNoteId,
      table.topicId,
    ),
  }),
);

export const dailyLog = sqliteTable('daily_log', {
  date: text('date').primaryKey(),
  checkedIn: integer('checked_in').notNull().default(0),
  mood: text('mood'),
  totalMinutes: integer('total_minutes').notNull().default(0),
  xpEarned: integer('xp_earned').notNull().default(0),
  sessionCount: integer('session_count').notNull().default(0),
});

export const aiCache = sqliteTable(
  'ai_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    topicId: integer('topic_id').notNull(),
    contentType: text('content_type').notNull(),
    contentJson: text('content_json').notNull(),
    modelUsed: text('model_used').notNull(),
    createdAt: integer('created_at').notNull(),
    isFlagged: integer('is_flagged').notNull().default(0),
  },
  (table) => ({
    topicContentUnique: uniqueIndex('ai_cache_topic_content_unique').on(
      table.topicId,
      table.contentType,
    ),
  }),
);

export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey().default(1),
  displayName: text('display_name').notNull().default('Doctor'),
  totalXp: integer('total_xp').notNull().default(0),
  currentLevel: integer('current_level').notNull().default(1),
  streakCurrent: integer('streak_current').notNull().default(0),
  streakBest: integer('streak_best').notNull().default(0),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(120),
  inicetDate: text('inicet_date').notNull().default(DB_DEFAULT_INICET_DATE),
  neetDate: text('neet_date').notNull().default(DB_DEFAULT_NEET_DATE),
  preferredSessionLength: integer('preferred_session_length').notNull().default(45),
  openrouterApiKey: text('openrouter_api_key').notNull().default(''),
  openrouterKey: text('openrouter_key').notNull().default(''),
  notificationsEnabled: integer('notifications_enabled').notNull().default(1),
  lastActiveDate: text('last_active_date'),
  syncCode: text('sync_code'),
  strictModeEnabled: integer('strict_mode_enabled').notNull().default(0),
  doomscrollShieldEnabled: integer('doomscroll_shield_enabled').notNull().default(1),
  streakShieldAvailable: integer('streak_shield_available').notNull().default(1),
  bodyDoublingEnabled: integer('body_doubling_enabled').notNull().default(1),
  blockedContentTypes: text('blocked_content_types').notNull().default('[]'),
  idleTimeoutMinutes: integer('idle_timeout_minutes').notNull().default(2),
  breakDurationMinutes: integer('break_duration_minutes').notNull().default(5),
  notificationHour: integer('notification_hour').notNull().default(7),
  guruFrequency: text('guru_frequency').notNull().default('normal'),
  focusSubjectIds: text('focus_subject_ids').notNull().default('[]'),
  focusAudioEnabled: integer('focus_audio_enabled').notNull().default(0),
  visualTimersEnabled: integer('visual_timers_enabled').notNull().default(0),
  faceTrackingEnabled: integer('face_tracking_enabled').notNull().default(0),
  quizCorrectCount: integer('quiz_correct_count').notNull().default(0),
  lastBackupDate: text('last_backup_date'),
  useLocalModel: integer('use_local_model').notNull().default(1),
  localModelPath: text('local_model_path'),
  useLocalWhisper: integer('use_local_whisper').notNull().default(1),
  localWhisperPath: text('local_whisper_path'),
  useNano: integer('use_nano').notNull().default(1),
  quickStartStreak: integer('quick_start_streak').notNull().default(0),
  groqApiKey: text('groq_api_key').notNull().default(''),
  geminiKey: text('gemini_key').notNull().default(''),
  huggingfaceToken: text('huggingface_token').notNull().default(''),
  huggingfaceTranscriptionModel: text('huggingface_transcription_model')
    .notNull()
    .default('openai/whisper-large-v3'),
  transcriptionProvider: text('transcription_provider').notNull().default('auto'),
  studyResourceMode: text('study_resource_mode').notNull().default('hybrid'),
  subjectLoadOverridesJson: text('subject_load_overrides_json').notNull().default('{}'),
  harassmentTone: text('harassment_tone').notNull().default('shame'),
  loadingOrbStyle: text('loading_orb_style').notNull().default('turbulent'),
  backupDirectoryUri: text('backup_directory_uri'),
  pomodoroEnabled: integer('pomodoro_enabled').notNull().default(1),
  pomodoroIntervalMinutes: integer('pomodoro_interval_minutes').notNull().default(20),
  cloudflareAccountId: text('cloudflare_account_id').notNull().default(''),
  cloudflareApiToken: text('cloudflare_api_token').notNull().default(''),
  falApiKey: text('fal_api_key').notNull().default(''),
  braveSearchApiKey: text('brave_search_api_key').notNull().default(''),
  googleCustomSearchApiKey: text('google_custom_search_api_key').notNull().default(''),
  qwenConnected: integer('qwen_connected').notNull().default(0),
  guruChatDefaultModel: text('guru_chat_default_model').notNull().default('auto'),
  guruMemoryNotes: text('guru_memory_notes').notNull().default(''),
  imageGenerationModel: text('image_generation_model').notNull().default('auto'),
  examType: text('exam_type').notNull().default('INICET'),
  preferGeminiStructuredJson: integer('prefer_gemini_structured_json').notNull().default(1),
  githubModelsPat: text('github_models_pat').notNull().default(''),
  kiloApiKey: text('kilo_api_key').notNull().default(''),
  deepseekKey: text('deepseek_key').notNull().default(''),
  agentRouterKey: text('agentrouter_key').notNull().default(''),
  providerOrder: text('provider_order').notNull().default('[]'),
  deepgramApiKey: text('deepgram_api_key').notNull().default(''),
  apiValidationJson: text('api_validation_json').notNull().default('{}'),
  chatgptConnected: integer('chatgpt_connected').notNull().default(0),
  chatgptAccountsJson: text('chatgpt_accounts_json')
    .notNull()
    .default(
      '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}',
    ),
  autoBackupFrequency: text('auto_backup_frequency').notNull().default('off'),
  lastAutoBackupAt: text('last_auto_backup_at'),
  githubCopilotConnected: integer('github_copilot_connected').notNull().default(0),
  githubCopilotPreferredModel: text('github_copilot_preferred_model').notNull().default(''),
  gitlabDuoConnected: integer('gitlab_duo_connected').notNull().default(0),
  gitlabOauthClientId: text('gitlab_oauth_client_id').notNull().default(''),
  gitlabDuoPreferredModel: text('gitlab_duo_preferred_model').notNull().default(''),
  poeConnected: integer('poe_connected').notNull().default(0),
  gdriveWebClientId: text('gdrive_web_client_id').notNull().default(''),
  gdriveConnected: integer('gdrive_connected').notNull().default(0),
  gdriveEmail: text('gdrive_email').notNull().default(''),
  gdriveLastSyncAt: text('gdrive_last_sync_at'),
  lastBackupDeviceId: text('last_backup_device_id').notNull().default(''),
  dbmciClassStartDate: text('dbmci_class_start_date'),
  btrStartDate: text('btr_start_date'),
  homeNoveltyCooldownHours: integer('home_novelty_cooldown_hours').notNull().default(6),
  disabledProviders: text('disabled_providers').notNull().default('[]'),
  jinaApiKey: text('jina_api_key').notNull().default(''),
  vertexAiProject: text('vertex_ai_project').notNull().default(''),
  vertexAiLocation: text('vertex_ai_location').notNull().default(''),
  vertexAiToken: text('vertex_ai_token').notNull().default(''),
  autoRepairLegacyNotesEnabled: integer('auto_repair_legacy_notes_enabled').notNull().default(0),
  scanOrphanedTranscriptsEnabled: integer('scan_orphaned_transcripts_enabled').notNull().default(0),
  samsungBatteryPromptShownAt: integer('samsungBatteryPromptShownAt').default(0),
  orbEffect: text('orb_effect').notNull().default('ripple'),
});

export const guruChatSessionMemory = sqliteTable('guru_chat_session_memory', {
  threadId: integer('thread_id').primaryKey(),
  topicName: text('topic_name').notNull(),
  summaryText: text('summary_text').notNull().default(''),
  stateJson: text('state_json').notNull().default('{}'),
  updatedAt: integer('updated_at').notNull(),
  messagesAtLastSummary: integer('messages_at_last_summary').notNull().default(0),
});

export const guruChatThreads = sqliteTable('guru_chat_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicName: text('topic_name').notNull(),
  syllabusTopicId: integer('syllabus_topic_id'),
  title: text('title').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastMessageAt: integer('last_message_at').notNull(),
  lastMessagePreview: text('last_message_preview').notNull().default(''),
});

export const brainDumps = sqliteTable('brain_dumps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  note: text('note').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const externalAppLogs = sqliteTable('external_app_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  appName: text('app_name').notNull(),
  launchedAt: integer('launched_at').notNull(),
  returnedAt: integer('returned_at'),
  durationMinutes: real('duration_minutes'),
  notes: text('notes'),
  recordingPath: text('recording_path'),
  transcriptionStatus: text('transcription_status').default('pending'),
  transcriptionError: text('transcription_error'),
  lectureNoteId: integer('lecture_note_id'),
  noteEnhancementStatus: text('note_enhancement_status').default('pending'),
  pipelineMetricsJson: text('pipeline_metrics_json'),
});

export const chatHistory = sqliteTable('chat_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id'),
  topicName: text('topic_name').notNull(),
  role: text('role').notNull(),
  message: text('message').notNull(),
  timestamp: integer('timestamp').notNull(),
  sourcesJson: text('sources_json'),
  modelUsed: text('model_used'),
});

export const generatedStudyImages = sqliteTable('generated_study_images', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contextType: text('context_type').notNull(),
  contextKey: text('context_key').notNull(),
  topicId: integer('topic_id'),
  topicName: text('topic_name').notNull(),
  lectureNoteId: integer('lecture_note_id'),
  style: text('style').notNull(),
  prompt: text('prompt').notNull(),
  provider: text('provider').notNull(),
  modelUsed: text('model_used').notNull(),
  mimeType: text('mime_type').notNull().default('image/png'),
  localUri: text('local_uri').notNull(),
  remoteUrl: text('remote_url'),
  width: integer('width'),
  height: integer('height'),
  createdAt: integer('created_at').notNull(),
});

export const offlineAiQueue = sqliteTable('offline_ai_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  requestType: text('request_type').notNull(),
  payload: text('payload').notNull(),
  status: text('status').default('pending'),
  attempts: integer('attempts').default(0),
  createdAt: integer('created_at').notNull(),
  lastAttemptAt: integer('last_attempt_at'),
  errorMessage: text('error_message'),
});

export const dailyAgenda = sqliteTable(
  'daily_agenda',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(),
    planJson: text('plan_json').notNull(),
    source: text('source').default('guru'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    dateUnique: uniqueIndex('daily_agenda_date_unique').on(table.date),
  }),
);

export const planEvents = sqliteTable('plan_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  eventType: text('event_type').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const topicSuggestions = sqliteTable(
  'topic_suggestions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id').notNull(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    sourceSummary: text('source_summary'),
    mentionCount: integer('mention_count').notNull().default(1),
    status: text('status').notNull().default('pending'),
    approvedTopicId: integer('approved_topic_id'),
    firstDetectedAt: integer('first_detected_at').notNull(),
    lastDetectedAt: integer('last_detected_at').notNull(),
  },
  (table) => ({
    subjectNormalizedUnique: uniqueIndex('topic_suggestions_unique').on(
      table.subjectId,
      table.normalizedName,
    ),
  }),
);

export const questionBank = sqliteTable('question_bank', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  question: text('question').notNull(),
  options: text('options').notNull(),
  correctIndex: integer('correct_index').notNull(),
  explanation: text('explanation').notNull(),
  topicId: integer('topic_id'),
  topicName: text('topic_name').notNull().default(''),
  subjectName: text('subject_name').notNull().default(''),
  source: text('source').notNull().default('content_card'),
  sourceId: text('source_id'),
  imageUrl: text('image_url'),
  isBookmarked: integer('is_bookmarked').notNull().default(0),
  isMastered: integer('is_mastered').notNull().default(0),
  timesSeen: integer('times_seen').notNull().default(0),
  timesCorrect: integer('times_correct').notNull().default(0),
  lastSeenAt: integer('last_seen_at'),
  nextReviewAt: integer('next_review_at'),
  difficulty: real('difficulty').notNull().default(0.5),
  createdAt: integer('created_at').notNull(),
});

export const lectureScheduleProgress = sqliteTable(
  'lecture_schedule_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    batchId: text('batch_id').notNull(),
    lectureIndex: integer('lecture_index').notNull(),
    completedAt: integer('completed_at').notNull(),
  },
  (table) => ({
    batchLectureUnique: uniqueIndex('lecture_schedule_batch_lecture_unique').on(
      table.batchId,
      table.lectureIndex,
    ),
  }),
);

export const mindMaps = sqliteTable('mind_maps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  subjectId: integer('subject_id'),
  topicId: integer('topic_id'),
  viewportJson: text('viewport_json').notNull().default('{"x":0,"y":0,"scale":1}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const mindMapNodes = sqliteTable('mind_map_nodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mapId: integer('map_id').notNull(),
  topicId: integer('topic_id'),
  label: text('label').notNull(),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  color: text('color'),
  isCenter: integer('is_center').notNull().default(0),
  aiGenerated: integer('ai_generated').notNull().default(0),
  explanation: text('explanation'),
  createdAt: integer('created_at').notNull(),
});

export const mindMapEdges = sqliteTable('mind_map_edges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mapId: integer('map_id').notNull(),
  sourceNodeId: integer('source_node_id').notNull(),
  targetNodeId: integer('target_node_id').notNull(),
  label: text('label'),
  isCrossLink: integer('is_cross_link').notNull().default(0),
  createdAt: integer('created_at').notNull(),
});

export const contentFactChecks = sqliteTable('content_fact_checks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: integer('topic_id').notNull(),
  contentType: text('content_type').notNull(),
  checkStatus: text('check_status').notNull().default('pending'),
  contradictionsJson: text('contradictions_json'),
  checkedAt: integer('checked_at').notNull(),
});

export const userContentFlags = sqliteTable('user_content_flags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: integer('topic_id').notNull(),
  contentType: text('content_type').notNull(),
  userNote: text('user_note'),
  flagReason: text('flag_reason').notNull(),
  flaggedAt: integer('flagged_at').notNull(),
  resolved: integer('resolved').notNull().default(0),
  resolvedAt: integer('resolved_at'),
});

export const migrationHistory = sqliteTable('migration_history', {
  version: integer('version').primaryKey(),
  appliedAt: integer('applied_at').notNull(),
  description: text('description'),
});

export const semanticLinks = sqliteTable(
  'semantic_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: integer('target_id').notNull(),
    relationship: text('relationship'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    sourceTargetUnique: uniqueIndex('idx_semantic_links_unique').on(
      table.sourceType,
      table.sourceId,
      table.targetType,
      table.targetId,
    ),
  }),
);

export const topicNotes = sqliteTable('topic_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  topicId: integer('topic_id').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const mindMapNodeLinks = sqliteTable('mind_map_node_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nodeId: integer('node_id').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: integer('resource_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export type UserProfileRow = typeof userProfile.$inferSelect;
export type NewUserProfileRow = typeof userProfile.$inferInsert;
