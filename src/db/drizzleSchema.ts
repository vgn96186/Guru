/**
 * Drizzle ORM schema definitions.
 *
 * Mirrors the existing SQLite schema (src/db/schema.ts raw SQL) but as
 * typed Drizzle table objects. Schema management (migrations) stays with
 * the legacy migrations array in database.ts — Drizzle is used purely as
 * a query builder and ORM layer on top of the existing database.
 *
 * Tables are added here incrementally as they are migrated to Drizzle.
 */

import { sqliteTable, integer, text, real, blob } from 'drizzle-orm/sqlite-core';
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

// ─── user_profile ────────────────────────────────────────────────────────────

export const userProfile = sqliteTable('user_profile', {
  id: integer('id').primaryKey().default(1),
  displayName: text('display_name').notNull().default('Doctor'),
  totalXp: integer('total_xp').notNull().default(0),
  currentLevel: integer('current_level').notNull().default(1),
  streakCurrent: integer('streak_current').notNull().default(0),
  streakBest: integer('streak_best').notNull().default(0),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(120),
  inicetDate: text('inicet_date').notNull().default(DEFAULT_INICET_DATE),
  neetDate: text('neet_date').notNull().default(DEFAULT_NEET_DATE),
  preferredSessionLength: integer('preferred_session_length').notNull().default(45),
  openrouterApiKey: text('openrouter_api_key').notNull().default(''),
  openrouterKey: text('openrouter_key').notNull().default(''),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).notNull().default(true),
  lastActiveDate: text('last_active_date'),
  syncCode: text('sync_code'),
  strictModeEnabled: integer('strict_mode_enabled', { mode: 'boolean' }).notNull().default(false),
  streakShieldAvailable: integer('streak_shield_available', { mode: 'boolean' }).notNull().default(true),
  bodyDoublingEnabled: integer('body_doubling_enabled', { mode: 'boolean' }).notNull().default(true),
  // JSON-encoded arrays/objects — parsed in repository layer
  blockedContentTypes: text('blocked_content_types').notNull().default('[]'),
  idleTimeoutMinutes: integer('idle_timeout_minutes').notNull().default(2),
  breakDurationMinutes: integer('break_duration_minutes').notNull().default(5),
  notificationHour: integer('notification_hour').notNull().default(7),
  guruFrequency: text('guru_frequency').notNull().default('normal'),
  focusSubjectIds: text('focus_subject_ids').notNull().default('[]'),
  focusAudioEnabled: integer('focus_audio_enabled', { mode: 'boolean' }).notNull().default(false),
  visualTimersEnabled: integer('visual_timers_enabled', { mode: 'boolean' }).notNull().default(false),
  faceTrackingEnabled: integer('face_tracking_enabled', { mode: 'boolean' }).notNull().default(false),
  quizCorrectCount: integer('quiz_correct_count').notNull().default(0),
  lastBackupDate: text('last_backup_date'),
  useLocalModel: integer('use_local_model', { mode: 'boolean' }).notNull().default(true),
  localModelPath: text('local_model_path'),
  useLocalWhisper: integer('use_local_whisper', { mode: 'boolean' }).notNull().default(true),
  localWhisperPath: text('local_whisper_path'),
  quickStartStreak: integer('quick_start_streak').notNull().default(0),
  groqApiKey: text('groq_api_key').notNull().default(''),
  geminiKey: text('gemini_key').notNull().default(''),
  huggingfaceToken: text('huggingface_token').notNull().default(''),
  huggingfaceTranscriptionModel: text('huggingface_transcription_model').notNull().default('openai/whisper-large-v3'),
  transcriptionProvider: text('transcription_provider').notNull().default('auto'),
  studyResourceMode: text('study_resource_mode').notNull().default('hybrid'),
  subjectLoadOverridesJson: text('subject_load_overrides_json').notNull().default('{}'),
  harassmentTone: text('harassment_tone').notNull().default('shame'),
  backupDirectoryUri: text('backup_directory_uri'),
  pomodoroEnabled: integer('pomodoro_enabled', { mode: 'boolean' }).notNull().default(true),
  pomodoroIntervalMinutes: integer('pomodoro_interval_minutes').notNull().default(20),
  cloudflareAccountId: text('cloudflare_account_id').notNull().default(''),
  cloudflareApiToken: text('cloudflare_api_token').notNull().default(''),
  falApiKey: text('fal_api_key').notNull().default(''),
  braveSearchApiKey: text('brave_search_api_key').notNull().default(''),
  googleCustomSearchApiKey: text('google_custom_search_api_key').notNull().default(''),
  qwenConnected: integer('qwen_connected', { mode: 'boolean' }).notNull().default(false),
  guruChatDefaultModel: text('guru_chat_default_model').notNull().default('auto'),
  guruMemoryNotes: text('guru_memory_notes').notNull().default(''),
  imageGenerationModel: text('image_generation_model').notNull().default('auto'),
  examType: text('exam_type').notNull().default('INICET'),
  preferGeminiStructuredJson: integer('prefer_gemini_structured_json', { mode: 'boolean' }).notNull().default(true),
  githubModelsPat: text('github_models_pat').notNull().default(''),
  kiloApiKey: text('kilo_api_key').notNull().default(''),
  deepseekKey: text('deepseek_key').notNull().default(''),
  agentRouterKey: text('agentrouter_key').notNull().default(''),
  providerOrder: text('provider_order').notNull().default('[]'),
  deepgramApiKey: text('deepgram_api_key').notNull().default(''),
  apiValidationJson: text('api_validation_json').notNull().default('{}'),
  chatgptConnected: integer('chatgpt_connected', { mode: 'boolean' }).notNull().default(false),
  chatgptAccountsJson: text('chatgpt_accounts_json').notNull().default('{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}'),
  autoBackupFrequency: text('auto_backup_frequency').notNull().default('off'),
  lastAutoBackupAt: text('last_auto_backup_at'),
  githubCopilotConnected: integer('github_copilot_connected', { mode: 'boolean' }).notNull().default(false),
  githubCopilotPreferredModel: text('github_copilot_preferred_model').notNull().default(''),
  gitlabDuoConnected: integer('gitlab_duo_connected', { mode: 'boolean' }).notNull().default(false),
  gitlabOauthClientId: text('gitlab_oauth_client_id').notNull().default(''),
  gitlabDuoPreferredModel: text('gitlab_duo_preferred_model').notNull().default(''),
  poeConnected: integer('poe_connected', { mode: 'boolean' }).notNull().default(false),
  gdriveWebClientId: text('gdrive_web_client_id').notNull().default(''),
  gdriveConnected: integer('gdrive_connected', { mode: 'boolean' }).notNull().default(false),
  gdriveEmail: text('gdrive_email').notNull().default(''),
  gdriveLastSyncAt: text('gdrive_last_sync_at'),
  lastBackupDeviceId: text('last_backup_device_id').notNull().default(''),
  dbmciClassStartDate: text('dbmci_class_start_date'),
  btrStartDate: text('btr_start_date'),
  homeNoveltyCooldownHours: integer('home_novelty_cooldown_hours').notNull().default(6),
  disabledProviders: text('disabled_providers').notNull().default('[]'),
  jinaApiKey: text('jina_api_key').notNull().default(''),
});

export type UserProfileRow = typeof userProfile.$inferSelect;
export type NewUserProfileRow = typeof userProfile.$inferInsert;
