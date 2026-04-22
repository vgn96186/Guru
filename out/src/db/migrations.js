'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.LATEST_VERSION = exports.MIGRATIONS = void 0;
/**
 * Versioned database migrations.
 * Uses PRAGMA user_version to track applied migrations — only pending ones run on boot.
 * migration_history table (v59+) provides an audit trail of applied migrations.
 * Fresh installs (topicCount === 0) skip migrations; schema comes from CREATE TABLE.
 * Exam date defaults come from appConfig for consistency.
 */
var appConfig_1 = require('../config/appConfig');
exports.MIGRATIONS = [
  {
    version: 1,
    sql: 'ALTER TABLE topics ADD COLUMN parent_topic_id INTEGER REFERENCES topics(id)',
  },
  { version: 2, sql: 'ALTER TABLE topic_progress ADD COLUMN next_review_date TEXT' },
  { version: 3, sql: "ALTER TABLE topic_progress ADD COLUMN user_notes TEXT NOT NULL DEFAULT ''" },
  { version: 4, sql: 'ALTER TABLE external_app_logs ADD COLUMN recording_path TEXT' },
  {
    version: 5,
    sql: "ALTER TABLE external_app_logs ADD COLUMN transcription_status TEXT DEFAULT 'pending'",
  },
  { version: 6, sql: 'ALTER TABLE external_app_logs ADD COLUMN transcription_error TEXT' },
  { version: 7, sql: 'ALTER TABLE external_app_logs ADD COLUMN lecture_note_id INTEGER' },
  {
    version: 8,
    sql: "ALTER TABLE external_app_logs ADD COLUMN note_enhancement_status TEXT DEFAULT 'pending'",
  },
  { version: 9, sql: 'ALTER TABLE external_app_logs ADD COLUMN pipeline_metrics_json TEXT' },
  { version: 10, sql: 'ALTER TABLE user_profile ADD COLUMN strict_mode_enabled INTEGER DEFAULT 0' },
  {
    version: 11,
    sql: 'ALTER TABLE user_profile ADD COLUMN streak_shield_available INTEGER DEFAULT 1',
  },
  {
    version: 12,
    sql: "ALTER TABLE user_profile ADD COLUMN openrouter_key TEXT NOT NULL DEFAULT ''",
  },
  {
    version: 13,
    sql: 'ALTER TABLE user_profile ADD COLUMN body_doubling_enabled INTEGER NOT NULL DEFAULT 1',
  },
  {
    version: 14,
    sql: "ALTER TABLE user_profile ADD COLUMN blocked_content_types TEXT NOT NULL DEFAULT '[]'",
  },
  {
    version: 15,
    sql: 'ALTER TABLE user_profile ADD COLUMN idle_timeout_minutes INTEGER NOT NULL DEFAULT 2',
  },
  {
    version: 16,
    sql: 'ALTER TABLE user_profile ADD COLUMN break_duration_minutes INTEGER NOT NULL DEFAULT 5',
  },
  {
    version: 17,
    sql: 'ALTER TABLE user_profile ADD COLUMN notification_hour INTEGER NOT NULL DEFAULT 7',
  },
  {
    version: 18,
    sql: "ALTER TABLE user_profile ADD COLUMN focus_subject_ids TEXT NOT NULL DEFAULT '[]'",
  },
  {
    version: 19,
    sql: 'ALTER TABLE user_profile ADD COLUMN focus_audio_enabled INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 20,
    sql: 'ALTER TABLE user_profile ADD COLUMN visual_timers_enabled INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 21,
    sql: 'ALTER TABLE user_profile ADD COLUMN face_tracking_enabled INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 22,
    sql: 'ALTER TABLE topic_progress ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 23,
    sql: 'ALTER TABLE topic_progress ADD COLUMN is_nemesis INTEGER NOT NULL DEFAULT 0',
  },
  {
    version: 24,
    sql: 'ALTER TABLE user_profile ADD COLUMN quiz_correct_count INTEGER NOT NULL DEFAULT 0',
  },
  { version: 25, sql: 'ALTER TABLE user_profile ADD COLUMN last_backup_date TEXT' },
  {
    version: 26,
    sql: "ALTER TABLE user_profile ADD COLUMN guru_frequency TEXT NOT NULL DEFAULT 'normal'",
  },
  {
    version: 27,
    sql: 'ALTER TABLE user_profile ADD COLUMN use_local_model INTEGER NOT NULL DEFAULT 1',
  },
  { version: 28, sql: 'ALTER TABLE user_profile ADD COLUMN local_model_path TEXT' },
  {
    version: 29,
    sql: 'ALTER TABLE user_profile ADD COLUMN use_local_whisper INTEGER NOT NULL DEFAULT 1',
  },
  { version: 30, sql: 'ALTER TABLE user_profile ADD COLUMN local_whisper_path TEXT' },
  {
    version: 31,
    sql: 'ALTER TABLE user_profile ADD COLUMN quick_start_streak INTEGER NOT NULL DEFAULT 0',
  },
  { version: 32, sql: "ALTER TABLE user_profile ADD COLUMN groq_api_key TEXT NOT NULL DEFAULT ''" },
  {
    version: 33,
    sql: "ALTER TABLE user_profile ADD COLUMN study_resource_mode TEXT NOT NULL DEFAULT 'hybrid'",
  },
  {
    version: 34,
    sql: "ALTER TABLE user_profile ADD COLUMN subject_load_overrides_json TEXT NOT NULL DEFAULT '{}'",
  },
  {
    version: 35,
    sql: "ALTER TABLE user_profile ADD COLUMN inicet_date TEXT NOT NULL DEFAULT '".concat(
      appConfig_1.DEFAULT_INICET_DATE,
      "'",
    ),
  },
  {
    version: 36,
    sql: "ALTER TABLE user_profile ADD COLUMN neet_date TEXT NOT NULL DEFAULT '".concat(
      appConfig_1.DEFAULT_NEET_DATE,
      "'",
    ),
  },
  { version: 37, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_due TEXT' },
  { version: 38, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_stability REAL DEFAULT 0' },
  { version: 39, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_difficulty REAL DEFAULT 0' },
  { version: 40, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_elapsed_days INTEGER DEFAULT 0' },
  {
    version: 41,
    sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_scheduled_days INTEGER DEFAULT 0',
  },
  { version: 42, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_reps INTEGER DEFAULT 0' },
  { version: 43, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_lapses INTEGER DEFAULT 0' },
  { version: 44, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_state INTEGER DEFAULT 0' },
  { version: 45, sql: 'ALTER TABLE topic_progress ADD COLUMN fsrs_last_review TEXT' },
  {
    version: 46,
    sql: "UPDATE user_profile SET inicet_date = '".concat(
      appConfig_1.DEFAULT_INICET_DATE,
      "' WHERE inicet_date IS NULL OR inicet_date = '' OR inicet_date = '2026-05-01'",
    ),
  },
  {
    version: 47,
    sql: "UPDATE user_profile SET neet_date = '".concat(
      appConfig_1.DEFAULT_NEET_DATE,
      "' WHERE neet_date IS NULL OR neet_date = '' OR neet_date = '2026-08-01'",
    ),
  },
  {
    version: 48,
    sql: "UPDATE user_profile SET use_local_model = 1 WHERE use_local_model = 0 AND (openrouter_api_key IS NULL OR openrouter_api_key = '')",
  },
  {
    version: 49,
    sql: "UPDATE user_profile SET use_local_whisper = 1 WHERE use_local_whisper = 0 AND (openrouter_api_key IS NULL OR openrouter_api_key = '')",
  },
  {
    version: 50,
    sql: "UPDATE user_profile SET study_resource_mode = 'hybrid' WHERE study_resource_mode IS NULL OR study_resource_mode = ''",
  },
  {
    version: 51,
    sql: "UPDATE user_profile SET subject_load_overrides_json = '{}' WHERE subject_load_overrides_json IS NULL OR subject_load_overrides_json = ''",
  },
  {
    version: 52,
    sql: "ALTER TABLE user_profile ADD COLUMN harassment_tone TEXT NOT NULL DEFAULT 'shame'",
  },
  { version: 53, sql: 'ALTER TABLE lecture_notes ADD COLUMN transcript TEXT' },
  { version: 54, sql: 'ALTER TABLE lecture_notes ADD COLUMN summary TEXT' },
  { version: 55, sql: 'ALTER TABLE lecture_notes ADD COLUMN topics_json TEXT' },
  { version: 56, sql: 'ALTER TABLE lecture_notes ADD COLUMN app_name TEXT' },
  { version: 57, sql: 'ALTER TABLE lecture_notes ADD COLUMN duration_minutes INTEGER' },
  { version: 58, sql: 'ALTER TABLE lecture_notes ADD COLUMN confidence INTEGER DEFAULT 2' },
  {
    version: 59,
    sql: 'CREATE TABLE IF NOT EXISTS migration_history (\n  version INTEGER PRIMARY KEY,\n  applied_at INTEGER NOT NULL,\n  description TEXT\n)',
    description: 'migration_history audit table',
  },
  { version: 60, sql: 'ALTER TABLE lecture_notes ADD COLUMN embedding BLOB' },
  { version: 61, sql: 'ALTER TABLE topics ADD COLUMN embedding BLOB' },
  {
    version: 62,
    sql: 'ALTER TABLE user_profile ADD COLUMN backup_directory_uri TEXT',
    description: 'Add cloud/public backup directory URI',
  },
  {
    version: 63,
    sql: "CREATE TABLE IF NOT EXISTS daily_plan (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  date TEXT NOT NULL UNIQUE,\n  plan_json TEXT NOT NULL,\n  source TEXT DEFAULT 'guru',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)",
    description: 'Add daily_plan table for AI study twin',
  },
  {
    version: 64,
    sql: 'CREATE TABLE IF NOT EXISTS plan_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  date TEXT NOT NULL,\n  event_type TEXT NOT NULL,\n  payload_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n)',
    description: 'Add plan_events table for AI study twin',
  },
  {
    version: 65,
    sql: 'CREATE INDEX IF NOT EXISTS idx_daily_plan_date ON daily_plan(date)',
    description: 'Add index for daily_plan date',
  },
  {
    version: 66,
    sql: 'CREATE INDEX IF NOT EXISTS idx_plan_events_date ON plan_events(date)',
    description: 'Add index for plan_events date',
  },
  // ── Lecture Recording Pipeline Improvements ─────────────────────────────────────
  {
    version: 67,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN recording_path TEXT',
    description: 'Store path to recording file for cleanup',
  },
  {
    version: 68,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN recording_duration_seconds INTEGER',
    description: 'Store actual recording duration in seconds',
  },
  {
    version: 69,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN transcription_confidence REAL',
    description: 'Store confidence score (0-1) from transcription',
  },
  {
    version: 70,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN processing_metrics_json TEXT',
    description: 'Store timing metrics: {transcriptionMs, totalMs, modelUsed}',
  },
  {
    version: 71,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN retry_count INTEGER DEFAULT 0',
    description: 'Track how many times transcription was retried',
  },
  {
    version: 72,
    sql: 'ALTER TABLE lecture_notes ADD COLUMN last_error TEXT',
    description: 'Store last error message if transcription failed',
  },
  {
    version: 73,
    sql: "CREATE TABLE IF NOT EXISTS lecture_learned_topics (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  lecture_note_id INTEGER NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,\n  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,\n  confidence_at_time INTEGER NOT NULL DEFAULT 2,\n  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),\n  UNIQUE(lecture_note_id, topic_id)\n)",
    description: 'Track which topics were learned from each lecture',
  },
  {
    version: 74,
    sql: 'CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_lecture ON lecture_learned_topics(lecture_note_id)',
    description: 'Index for finding topics from a lecture',
  },
  {
    version: 75,
    sql: 'CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_topic ON lecture_learned_topics(topic_id)',
    description: 'Index for finding lectures that covered a topic',
  },
  {
    version: 76,
    sql: 'ALTER TABLE daily_plan RENAME TO daily_agenda;',
    description: 'Rename daily_plan to daily_agenda for consistency',
  },
  {
    version: 77,
    sql: 'DROP INDEX IF EXISTS idx_daily_plan_date; CREATE INDEX IF NOT EXISTS idx_daily_agenda_date ON daily_agenda(date);',
    description: 'Update index name for daily_agenda',
  },
  {
    version: 78,
    sql: 'ALTER TABLE user_profile ADD COLUMN pomodoro_enabled INTEGER NOT NULL DEFAULT 1',
    description: 'Add Pomodoro enabled flag to user_profile',
  },
  {
    version: 79,
    sql: 'ALTER TABLE user_profile ADD COLUMN pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20',
    description: 'Add Pomodoro interval duration to user_profile',
  },
  {
    version: 80,
    sql: "ALTER TABLE user_profile ADD COLUMN huggingface_token TEXT NOT NULL DEFAULT ''",
    description: 'Add Hugging Face API token to user_profile',
  },
  {
    version: 81,
    sql: "ALTER TABLE user_profile ADD COLUMN huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'",
    description: 'Add Hugging Face transcription model to user_profile',
  },
  {
    version: 82,
    sql: "ALTER TABLE user_profile ADD COLUMN transcription_provider TEXT NOT NULL DEFAULT 'auto'",
    description: 'Add preferred transcription provider to user_profile',
  },
  {
    version: 83,
    sql: "UPDATE user_profile\n          SET transcription_provider = CASE\n            WHEN transcription_provider NOT IN ('auto','groq','huggingface','local') OR transcription_provider IS NULL OR transcription_provider = ''\n            THEN 'auto'\n            ELSE transcription_provider\n          END",
    description: 'Normalize transcription provider values',
  },
  {
    version: 84,
    sql: "UPDATE user_profile\n          SET huggingface_transcription_model = 'openai/whisper-large-v3'\n          WHERE huggingface_transcription_model IS NULL\n             OR huggingface_transcription_model = ''\n             OR huggingface_transcription_model = 'openai/whisper-large-v3-turbo'",
    description: 'Move Hugging Face transcription default to whisper-large-v3',
  },
  {
    version: 85,
    sql: "CREATE TABLE IF NOT EXISTS topic_suggestions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  normalized_name TEXT NOT NULL,\n  source_summary TEXT,\n  mention_count INTEGER NOT NULL DEFAULT 1,\n  status TEXT NOT NULL DEFAULT 'pending'\n    CHECK(status IN ('pending','approved','rejected')),\n  approved_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  first_detected_at INTEGER NOT NULL,\n  last_detected_at INTEGER NOT NULL,\n  UNIQUE(subject_id, normalized_name)\n)",
    description: 'Add review queue for syllabus topics suggested by lectures',
  },
  {
    version: 86,
    sql: 'CREATE INDEX IF NOT EXISTS idx_topic_suggestions_status ON topic_suggestions(status, subject_id, last_detected_at DESC)',
    description: 'Index pending topic suggestions for syllabus review',
  },
  // ── Cloudflare Workers AI ─────────────────────────────────────────────────────
  {
    version: 87,
    sql: "ALTER TABLE user_profile ADD COLUMN cloudflare_account_id TEXT NOT NULL DEFAULT ''",
    description: 'Add Cloudflare Workers AI account ID to user_profile',
  },
  {
    version: 88,
    sql: "ALTER TABLE user_profile ADD COLUMN cloudflare_api_token TEXT NOT NULL DEFAULT ''",
    description: 'Add Cloudflare Workers AI API token to user_profile',
  },
  {
    version: 89,
    sql: "UPDATE user_profile\n          SET transcription_provider = CASE\n            WHEN transcription_provider NOT IN ('auto','groq','huggingface','cloudflare','local') OR transcription_provider IS NULL OR transcription_provider = ''\n            THEN 'auto'\n            ELSE transcription_provider\n          END",
    description: 'Normalize transcription provider values to include cloudflare option',
  },
  {
    version: 90,
    sql: "ALTER TABLE user_profile ADD COLUMN gemini_key TEXT NOT NULL DEFAULT ''",
    description: 'Add Gemini API key to user_profile',
  },
  {
    version: 91,
    sql: "CREATE TABLE IF NOT EXISTS generated_study_images (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  context_type TEXT NOT NULL\n    CHECK(context_type IN ('chat','topic_note','lecture_note')),\n  context_key TEXT NOT NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  topic_name TEXT NOT NULL,\n  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE CASCADE,\n  style TEXT NOT NULL\n    CHECK(style IN ('illustration','chart')),\n  prompt TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  model_used TEXT NOT NULL,\n  mime_type TEXT NOT NULL DEFAULT 'image/png',\n  local_uri TEXT NOT NULL,\n  remote_url TEXT,\n  width INTEGER,\n  height INTEGER,\n  created_at INTEGER NOT NULL\n)",
    description: 'Add generated_study_images table for note/chat attachments',
  },
  {
    version: 92,
    sql: 'CREATE INDEX IF NOT EXISTS idx_generated_study_images_context ON generated_study_images(context_type, context_key, created_at DESC)',
    description: 'Index generated study images by context',
  },
  {
    version: 93,
    sql: 'CREATE INDEX IF NOT EXISTS idx_generated_study_images_topic ON generated_study_images(topic_name, context_type, created_at DESC)',
    description: 'Index generated study images by topic',
  },
  {
    version: 94,
    sql: "ALTER TABLE user_profile ADD COLUMN guru_chat_default_model TEXT NOT NULL DEFAULT 'auto'",
    description:
      'Default Guru Chat model id (auto, local, groq/..., openrouter id, gemini/..., cf/...)',
  },
  {
    version: 95,
    sql: "ALTER TABLE user_profile ADD COLUMN guru_memory_notes TEXT NOT NULL DEFAULT ''",
    description: 'Guru Chat persistent memory notes (profile)',
  },
  {
    version: 96,
    sql: "CREATE TABLE IF NOT EXISTS guru_chat_session_memory (\n  topic_name TEXT PRIMARY KEY,\n  summary_text TEXT NOT NULL DEFAULT '',\n  updated_at INTEGER NOT NULL,\n  messages_at_last_summary INTEGER NOT NULL DEFAULT 0\n)",
    description: 'Per-topic rolling session summary for Guru Chat',
  },
  {
    version: 97,
    sql: "ALTER TABLE user_profile ADD COLUMN image_generation_model TEXT NOT NULL DEFAULT 'auto'",
    description: 'Study image generation model preference (auto, Gemini id, or @cf/...)',
  },
  {
    version: 98,
    sql: 'ALTER TABLE chat_history ADD COLUMN sources_json TEXT',
    description: 'Add sources_json to chat_history to persist grounding sources',
  },
  {
    version: 99,
    sql: 'ALTER TABLE chat_history ADD COLUMN model_used TEXT',
    description: 'Add model_used to chat_history to display the model used for each message',
  },
  {
    version: 100,
    sql: "ALTER TABLE user_profile ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'INICET'",
    description: 'Persist INICET vs NEET exam selection',
  },
  {
    version: 101,
    sql: 'ALTER TABLE user_profile ADD COLUMN prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1',
    description: 'Prefer Gemini native JSON + schema for structured AI (generateJSONWithRouting)',
  },
  {
    version: 102,
    sql: "ALTER TABLE user_profile ADD COLUMN github_models_pat TEXT NOT NULL DEFAULT ''",
    description: 'GitHub Models PAT (models:read) for OpenAI-style chat at models.github.ai',
  },
  {
    version: 103,
    sql: "DROP TABLE IF EXISTS ai_cache; CREATE TABLE IF NOT EXISTS ai_cache (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      topic_id INTEGER NOT NULL,\n      content_type TEXT NOT NULL\n        CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic')),\n      content_json TEXT NOT NULL,\n      model_used TEXT NOT NULL,\n      created_at INTEGER NOT NULL,\n      is_flagged INTEGER NOT NULL DEFAULT 0,\n      UNIQUE(topic_id, content_type)\n    ); CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)",
    description:
      'Recreate ai_cache with updated CHECK constraint (add manual, socratic content types)',
  },
  {
    version: 104,
    sql: "ALTER TABLE user_profile ADD COLUMN kilo_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Kilo gateway API key for OpenAI-compatible chat routing',
  },
  {
    version: 105,
    sql: "ALTER TABLE user_profile ADD COLUMN deepseek_key TEXT NOT NULL DEFAULT ''",
    description: 'DeepSeek API key for direct DeepSeek chat/reasoner routing',
  },
  {
    version: 106,
    sql: "ALTER TABLE user_profile ADD COLUMN agentrouter_key TEXT NOT NULL DEFAULT ''",
    description: 'AgentRouter API key (OpenAI-compatible proxy at agentrouter.org)',
  },
  {
    version: 107,
    sql: "ALTER TABLE user_profile ADD COLUMN provider_order TEXT NOT NULL DEFAULT '[]'",
    description: 'Customisable cloud LLM provider priority order (JSON array of provider IDs)',
  },
  {
    version: 108,
    sql: "ALTER TABLE user_profile ADD COLUMN deepgram_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Deepgram API key for batch + live WebSocket transcription',
  },
  {
    version: 109,
    sql: "CREATE TABLE IF NOT EXISTS question_bank (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  question TEXT NOT NULL,\n  options TEXT NOT NULL,\n  correct_index INTEGER NOT NULL,\n  explanation TEXT NOT NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  topic_name TEXT NOT NULL DEFAULT '',\n  subject_name TEXT NOT NULL DEFAULT '',\n  source TEXT NOT NULL DEFAULT 'content_card'\n    CHECK(source IN ('content_card','lecture_quiz','mock_test','live_lecture','manual')),\n  source_id TEXT,\n  image_url TEXT,\n  is_bookmarked INTEGER NOT NULL DEFAULT 0,\n  is_mastered INTEGER NOT NULL DEFAULT 0,\n  times_seen INTEGER NOT NULL DEFAULT 0,\n  times_correct INTEGER NOT NULL DEFAULT 0,\n  last_seen_at INTEGER,\n  next_review_at INTEGER,\n  difficulty REAL NOT NULL DEFAULT 0.5,\n  created_at INTEGER NOT NULL\n);\nCREATE INDEX IF NOT EXISTS idx_qb_subject ON question_bank(subject_name);\nCREATE INDEX IF NOT EXISTS idx_qb_topic ON question_bank(topic_id);\nCREATE INDEX IF NOT EXISTS idx_qb_review ON question_bank(next_review_at, is_mastered);\nCREATE INDEX IF NOT EXISTS idx_qb_bookmarked ON question_bank(is_bookmarked);\nCREATE UNIQUE INDEX IF NOT EXISTS idx_qb_dedup ON question_bank(question)",
    description: 'Question bank table for auto-saved MCQs with SR scheduling',
  },
  {
    version: 110,
    sql: "\n-- Rebuild user_profile to widen the transcription_provider CHECK constraint to include 'deepgram'.\n-- SQLite cannot ALTER a CHECK, so we recreate the table.\nDROP TABLE IF EXISTS user_profile_new;\nCREATE TABLE user_profile_new (\n  id INTEGER PRIMARY KEY DEFAULT 1,\n  display_name TEXT NOT NULL DEFAULT 'Doctor',\n  total_xp INTEGER NOT NULL DEFAULT 0,\n  current_level INTEGER NOT NULL DEFAULT 1,\n  streak_current INTEGER NOT NULL DEFAULT 0,\n  streak_best INTEGER NOT NULL DEFAULT 0,\n  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,\n  inicet_date TEXT NOT NULL DEFAULT '2026-05-01',\n  neet_date TEXT NOT NULL DEFAULT '2026-08-01',\n  preferred_session_length INTEGER NOT NULL DEFAULT 45,\n  openrouter_api_key TEXT NOT NULL DEFAULT '',\n  openrouter_key TEXT NOT NULL DEFAULT '',\n  notifications_enabled INTEGER NOT NULL DEFAULT 1,\n  last_active_date TEXT,\n  sync_code TEXT,\n  strict_mode_enabled INTEGER NOT NULL DEFAULT 0,\n  streak_shield_available INTEGER NOT NULL DEFAULT 1,\n  body_doubling_enabled INTEGER NOT NULL DEFAULT 1,\n  blocked_content_types TEXT NOT NULL DEFAULT '[]',\n  idle_timeout_minutes INTEGER NOT NULL DEFAULT 2,\n  break_duration_minutes INTEGER NOT NULL DEFAULT 5,\n  notification_hour INTEGER NOT NULL DEFAULT 7,\n  guru_frequency TEXT NOT NULL DEFAULT 'normal',\n  focus_subject_ids TEXT NOT NULL DEFAULT '[]',\n  focus_audio_enabled INTEGER NOT NULL DEFAULT 0,\n  visual_timers_enabled INTEGER NOT NULL DEFAULT 0,\n  face_tracking_enabled INTEGER NOT NULL DEFAULT 0,\n  quiz_correct_count INTEGER NOT NULL DEFAULT 0,\n  last_backup_date TEXT,\n  use_local_model INTEGER NOT NULL DEFAULT 1,\n  local_model_path TEXT,\n  use_local_whisper INTEGER NOT NULL DEFAULT 1,\n  local_whisper_path TEXT,\n  quick_start_streak INTEGER NOT NULL DEFAULT 0,\n  groq_api_key TEXT NOT NULL DEFAULT '',\n  gemini_key TEXT NOT NULL DEFAULT '',\n  huggingface_token TEXT NOT NULL DEFAULT '',\n  huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3',\n  transcription_provider TEXT NOT NULL DEFAULT 'auto',\n  study_resource_mode TEXT NOT NULL DEFAULT 'hybrid',\n  subject_load_overrides_json TEXT NOT NULL DEFAULT '{}',\n  backup_directory_uri TEXT,\n  pomodoro_enabled INTEGER NOT NULL DEFAULT 1,\n  pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20,\n  cloudflare_account_id TEXT NOT NULL DEFAULT '',\n  cloudflare_api_token TEXT NOT NULL DEFAULT '',\n  guru_chat_default_model TEXT NOT NULL DEFAULT 'auto',\n  guru_memory_notes TEXT NOT NULL DEFAULT '',\n  image_generation_model TEXT NOT NULL DEFAULT 'auto',\n  exam_type TEXT NOT NULL DEFAULT 'INICET',\n  prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1,\n  github_models_pat TEXT NOT NULL DEFAULT '',\n  kilo_api_key TEXT NOT NULL DEFAULT '',\n  deepseek_key TEXT NOT NULL DEFAULT '',\n  agentrouter_key TEXT NOT NULL DEFAULT '',\n  provider_order TEXT NOT NULL DEFAULT '[]',\n  deepgram_api_key TEXT NOT NULL DEFAULT ''\n);\n\nINSERT INTO user_profile_new SELECT\n  id, display_name, total_xp, current_level, streak_current, streak_best,\n  daily_goal_minutes, inicet_date, neet_date, preferred_session_length,\n  openrouter_api_key, openrouter_key, notifications_enabled, last_active_date,\n  sync_code, strict_mode_enabled, streak_shield_available, body_doubling_enabled,\n  blocked_content_types, idle_timeout_minutes, break_duration_minutes, notification_hour,\n  guru_frequency, focus_subject_ids, focus_audio_enabled, visual_timers_enabled,\n  face_tracking_enabled, quiz_correct_count, last_backup_date, use_local_model,\n  local_model_path, use_local_whisper, local_whisper_path, quick_start_streak,\n  groq_api_key, gemini_key, huggingface_token, huggingface_transcription_model,\n  CASE WHEN transcription_provider IN ('auto','groq','huggingface','cloudflare','deepgram','local') THEN transcription_provider ELSE 'auto' END,\n  study_resource_mode, subject_load_overrides_json, backup_directory_uri,\n  pomodoro_enabled, pomodoro_interval_minutes, cloudflare_account_id, cloudflare_api_token,\n  guru_chat_default_model, guru_memory_notes, image_generation_model, exam_type,\n  prefer_gemini_structured_json, github_models_pat, kilo_api_key, deepseek_key,\n  agentrouter_key, provider_order, deepgram_api_key\nFROM user_profile;\n\nDROP TABLE user_profile;\nALTER TABLE user_profile_new RENAME TO user_profile",
    description: 'Rebuild user_profile to strip CHECK constraints (validation moved to app layer)',
  },
  {
    version: 111,
    sql: "ALTER TABLE user_profile ADD COLUMN api_validation_json TEXT NOT NULL DEFAULT '{}'",
    description: 'Persist API provider key validation metadata for Settings UI status',
  },
  {
    version: 112,
    sql: 'DROP TABLE IF EXISTS external_app_logs_new',
    description: 'Cleanup leftover temp table from failed migration',
  },
  {
    version: 113,
    sql: "CREATE TABLE external_app_logs_new (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      app_name TEXT NOT NULL,\n      launched_at INTEGER NOT NULL,\n      returned_at INTEGER,\n      duration_minutes REAL,\n      notes TEXT,\n      recording_path TEXT,\n      transcription_status TEXT DEFAULT 'pending'\n        CHECK(transcription_status IN ('pending','recording','transcribing','completed','failed','no_audio','dismissed')),\n      transcription_error TEXT,\n      lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL,\n      note_enhancement_status TEXT DEFAULT 'pending'\n        CHECK(note_enhancement_status IN ('pending','completed','failed')),\n      pipeline_metrics_json TEXT\n    )",
    description: 'Create new external_app_logs with dismissed in CHECK',
  },
  {
    version: 114,
    sql: 'INSERT OR IGNORE INTO external_app_logs_new SELECT * FROM external_app_logs',
    description: 'Copy data to new external_app_logs table',
  },
  {
    version: 115,
    sql: 'DROP TABLE external_app_logs',
    description: 'Drop old external_app_logs',
  },
  {
    version: 116,
    sql: 'ALTER TABLE external_app_logs_new RENAME TO external_app_logs',
    description: 'Rename new table to external_app_logs',
  },
  {
    version: 117,
    sql: 'ALTER TABLE user_profile ADD COLUMN chatgpt_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Add chatgpt_connected flag to user_profile',
  },
  {
    version: 118,
    sql: "ALTER TABLE user_profile ADD COLUMN fal_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Add fal API key for image generation',
  },
  {
    version: 119,
    sql: "CREATE TABLE IF NOT EXISTS guru_chat_threads (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      topic_name TEXT NOT NULL,\n      syllabus_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n      title TEXT NOT NULL DEFAULT '',\n      created_at INTEGER NOT NULL,\n      updated_at INTEGER NOT NULL,\n      last_message_at INTEGER NOT NULL,\n      last_message_preview TEXT NOT NULL DEFAULT ''\n    )",
    description: 'Create Guru chat thread table',
  },
  {
    version: 120,
    sql: 'ALTER TABLE chat_history ADD COLUMN thread_id INTEGER',
    description: 'Add thread_id to chat_history',
  },
  {
    version: 121,
    sql: 'ALTER TABLE guru_chat_session_memory ADD COLUMN thread_id INTEGER',
    description: 'Add thread_id to guru_chat_session_memory',
  },
  {
    version: 122,
    sql: "INSERT INTO guru_chat_threads (\n      topic_name,\n      syllabus_topic_id,\n      title,\n      created_at,\n      updated_at,\n      last_message_at,\n      last_message_preview\n    )\n    SELECT\n      topic_name,\n      NULL,\n      topic_name,\n      COALESCE(MIN(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),\n      COALESCE(MAX(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),\n      COALESCE(MAX(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),\n      COALESCE((\n        SELECT substr(replace(replace(ch2.message, char(10), ' '), char(13), ' '), 1, 96)\n        FROM chat_history ch2\n        WHERE ch2.topic_name = grouped.topic_name\n        ORDER BY ch2.timestamp DESC, ch2.id DESC\n        LIMIT 1\n      ), '')\n    FROM (\n      SELECT topic_name, timestamp FROM chat_history\n      UNION ALL\n      SELECT topic_name, NULL AS timestamp FROM guru_chat_session_memory\n    ) AS grouped\n    GROUP BY topic_name",
    description: 'Backfill Guru chat threads from legacy chat history and session memory',
  },
  {
    version: 123,
    sql: 'UPDATE chat_history\n      SET thread_id = (\n        SELECT id\n        FROM guru_chat_threads\n        WHERE guru_chat_threads.topic_name = chat_history.topic_name\n        ORDER BY last_message_at DESC, id DESC\n        LIMIT 1\n      )\n      WHERE thread_id IS NULL',
    description: 'Backfill chat_history.thread_id from legacy topic threads',
  },
  {
    version: 124,
    sql: 'UPDATE guru_chat_session_memory\n      SET thread_id = (\n        SELECT id\n        FROM guru_chat_threads\n        WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name\n        ORDER BY last_message_at DESC, id DESC\n        LIMIT 1\n      )\n      WHERE thread_id IS NULL',
    description: 'Backfill guru_chat_session_memory.thread_id from legacy topic threads',
  },
  {
    version: 125,
    sql: 'CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_last_message ON guru_chat_threads(last_message_at DESC, updated_at DESC)',
    description: 'Index Guru chat threads by recent activity',
  },
  {
    version: 126,
    sql: 'CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_topic ON guru_chat_threads(topic_name, syllabus_topic_id, last_message_at DESC)',
    description: 'Index Guru chat threads by topic',
  },
  {
    version: 127,
    sql: 'CREATE INDEX IF NOT EXISTS idx_chat_history_thread ON chat_history(thread_id, timestamp ASC)',
    description: 'Index chat history by thread',
  },
  {
    version: 128,
    sql: 'CREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)',
    description: 'Ensure one session memory row per Guru chat thread',
  },
  {
    version: 129,
    sql: "DROP TABLE IF EXISTS guru_chat_session_memory_new;\nCREATE TABLE guru_chat_session_memory_new (\n  thread_id INTEGER PRIMARY KEY,\n  topic_name TEXT NOT NULL,\n  summary_text TEXT NOT NULL DEFAULT '',\n  updated_at INTEGER NOT NULL,\n  messages_at_last_summary INTEGER NOT NULL DEFAULT 0,\n  FOREIGN KEY(thread_id) REFERENCES guru_chat_threads(id) ON DELETE CASCADE\n);\nINSERT OR REPLACE INTO guru_chat_session_memory_new (\n  thread_id,\n  topic_name,\n  summary_text,\n  updated_at,\n  messages_at_last_summary\n)\nSELECT\n  COALESCE(\n    thread_id,\n    (\n      SELECT id\n      FROM guru_chat_threads\n      WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name\n      ORDER BY last_message_at DESC, id DESC\n      LIMIT 1\n    )\n  ) AS resolved_thread_id,\n  topic_name,\n  summary_text,\n  updated_at,\n  messages_at_last_summary\nFROM guru_chat_session_memory\nWHERE COALESCE(\n  thread_id,\n  (\n    SELECT id\n    FROM guru_chat_threads\n    WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name\n    ORDER BY last_message_at DESC, id DESC\n    LIMIT 1\n  )\n) IS NOT NULL;\nDROP TABLE guru_chat_session_memory;\nALTER TABLE guru_chat_session_memory_new RENAME TO guru_chat_session_memory;\nCREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)",
    description: 'Rebuild guru_chat_session_memory to remove legacy topic_name uniqueness',
  },
  {
    version: 130,
    sql: "ALTER TABLE user_profile ADD COLUMN brave_search_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Add Brave Search API key for image search fallback',
  },
  {
    version: 131,
    sql: "DROP TABLE IF EXISTS ai_cache; CREATE TABLE IF NOT EXISTS ai_cache (\n      id INTEGER PRIMARY KEY AUTOINCREMENT,\n      topic_id INTEGER NOT NULL,\n      content_type TEXT NOT NULL\n        CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic')),\n      content_json TEXT NOT NULL,\n      model_used TEXT NOT NULL,\n      created_at INTEGER NOT NULL,\n      is_flagged INTEGER NOT NULL DEFAULT 0,\n      UNIQUE(topic_id, content_type)\n    ); CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)",
    description: 'Recreate ai_cache CHECK constraint to include must_know content',
  },
  {
    version: 132,
    sql: 'ALTER TABLE user_profile ADD COLUMN chatgpt_accounts_json TEXT NOT NULL DEFAULT \'{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}\'',
    description: 'Add per-slot ChatGPT account config for primary and backup account fallback',
  },
  {
    version: 133,
    sql: 'UPDATE user_profile\n          SET chatgpt_accounts_json = CASE\n            WHEN chatgpt_connected = 1\n            THEN \'{"primary":{"enabled":true,"connected":true},"secondary":{"enabled":false,"connected":false}}\'\n            ELSE \'{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}\'\n          END\n          WHERE chatgpt_accounts_json IS NULL\n             OR trim(chatgpt_accounts_json) = \'\'',
    description: 'Backfill ChatGPT primary slot from legacy chatgpt_connected flag',
  },
  {
    version: 134,
    sql: "ALTER TABLE user_profile ADD COLUMN auto_backup_frequency TEXT NOT NULL DEFAULT 'off'",
    description: 'Add auto-backup frequency setting for unified backup system',
  },
  {
    version: 135,
    sql: 'ALTER TABLE user_profile ADD COLUMN last_auto_backup_at TEXT',
    description: 'Add timestamp for last auto-backup execution',
  },
  {
    version: 136,
    sql: 'ALTER TABLE user_profile ADD COLUMN github_copilot_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Add github_copilot_connected flag to user_profile',
  },
  {
    version: 137,
    sql: 'ALTER TABLE user_profile ADD COLUMN gitlab_duo_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Add gitlab_duo_connected flag to user_profile',
  },
  {
    version: 138,
    sql: 'ALTER TABLE user_profile ADD COLUMN poe_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Add poe_connected flag to user_profile',
  },
  {
    version: 139,
    sql: "ALTER TABLE user_profile ADD COLUMN github_copilot_preferred_model TEXT NOT NULL DEFAULT ''",
    description: 'Preferred GitHub Copilot model id for auto-routing',
  },
  {
    version: 140,
    sql: "ALTER TABLE user_profile ADD COLUMN gitlab_oauth_client_id TEXT NOT NULL DEFAULT ''",
    description: 'GitLab OAuth Application ID (optional; overrides EXPO_PUBLIC_GITLAB_CLIENT_ID)',
  },
  {
    version: 141,
    sql: "ALTER TABLE user_profile ADD COLUMN gitlab_duo_preferred_model TEXT NOT NULL DEFAULT ''",
    description: 'Preferred GitLab Duo model id for auto-routing',
  },
  {
    version: 142,
    sql: 'ALTER TABLE user_profile ADD COLUMN gdrive_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Google Drive backup connection flag',
  },
  {
    version: 143,
    sql: "ALTER TABLE user_profile ADD COLUMN gdrive_email TEXT NOT NULL DEFAULT ''",
    description: 'Google Drive connected account email',
  },
  {
    version: 144,
    sql: 'ALTER TABLE user_profile ADD COLUMN gdrive_last_sync_at TEXT',
    description: 'Timestamp of last successful GDrive backup sync',
  },
  {
    version: 145,
    sql: "ALTER TABLE user_profile ADD COLUMN last_backup_device_id TEXT NOT NULL DEFAULT ''",
    description: 'Device ID of the last auto-backup (for cross-device detection)',
  },
  {
    version: 146,
    sql: 'ALTER TABLE user_profile ADD COLUMN dbmci_class_start_date TEXT',
    description: "Start date (YYYY-MM-DD) of the user's DBMCI One live batch",
  },
  {
    version: 147,
    sql: 'ALTER TABLE user_profile ADD COLUMN btr_start_date TEXT',
    description: "Start date (YYYY-MM-DD) of the user's BTR (Back to Roots) revision batch",
  },
  {
    version: 148,
    sql: 'ALTER TABLE user_profile ADD COLUMN home_novelty_cooldown_hours INTEGER NOT NULL DEFAULT 6',
    description: 'Home anti-repeat cooldown window (hours) for novelty rotation',
  },
  {
    version: 149,
    sql: "ALTER TABLE user_profile ADD COLUMN gdrive_web_client_id TEXT NOT NULL DEFAULT ''",
    description: 'Google OAuth Web Client ID for Drive sync (runtime override)',
  },
  // v149 was duplicated — state_json column moved to v161 to fix existing installs
  // ── Lecture Schedule Progress ─────────────────────────────────────────────────
  {
    version: 150,
    sql: 'CREATE TABLE IF NOT EXISTS lecture_schedule_progress (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  batch_id TEXT NOT NULL,\n  lecture_index INTEGER NOT NULL,\n  completed_at INTEGER NOT NULL,\n  UNIQUE(batch_id, lecture_index)\n)',
    description: 'Track completed lectures per coaching batch (BTR, DBMCI One)',
  },
  // ── Mind Maps ────────────────────────────────────────────────────────────────
  {
    version: 151,
    sql: 'CREATE TABLE IF NOT EXISTS mind_maps (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  viewport_json TEXT NOT NULL DEFAULT \'{"x":0,"y":0,"scale":1}\',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)',
    description: 'Create mind_maps table for persistent infinite-canvas mind maps',
  },
  {
    version: 152,
    sql: 'CREATE TABLE IF NOT EXISTS mind_map_nodes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  label TEXT NOT NULL,\n  x REAL NOT NULL DEFAULT 0,\n  y REAL NOT NULL DEFAULT 0,\n  color TEXT,\n  is_center INTEGER NOT NULL DEFAULT 0,\n  ai_generated INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL\n)',
    description: 'Create mind_map_nodes table for nodes on the canvas',
  },
  {
    version: 153,
    sql: 'CREATE TABLE IF NOT EXISTS mind_map_edges (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,\n  source_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,\n  target_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,\n  label TEXT,\n  created_at INTEGER NOT NULL\n)',
    description: 'Create mind_map_edges table for connections between nodes',
  },
  {
    version: 154,
    sql: 'CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_map ON mind_map_nodes(map_id);\nCREATE INDEX IF NOT EXISTS idx_mind_map_edges_map ON mind_map_edges(map_id);\nCREATE INDEX IF NOT EXISTS idx_mind_map_edges_source ON mind_map_edges(source_node_id);\nCREATE INDEX IF NOT EXISTS idx_mind_map_edges_target ON mind_map_edges(target_node_id)',
    description: 'Add indexes for mind map lookups',
  },
  {
    version: 155,
    sql: "\n-- Add 'flashcards' to ai_cache CHECK constraint (SQLite requires table recreation)\nALTER TABLE ai_cache RENAME TO ai_cache_old;\nCREATE TABLE ai_cache (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL\n    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),\n  content_json TEXT NOT NULL,\n  model_used TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  is_flagged INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(topic_id, content_type)\n);\nINSERT INTO ai_cache SELECT * FROM ai_cache_old;\nDROP TABLE ai_cache_old;",
    description: "Add 'flashcards' to ai_cache content_type CHECK constraint",
  },
  {
    version: 156,
    sql: "ALTER TABLE user_profile ADD COLUMN google_custom_search_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Add Google Custom Search API key for image search',
  },
  {
    version: 157,
    sql: 'ALTER TABLE user_profile ADD COLUMN qwen_connected INTEGER NOT NULL DEFAULT 0',
    description: 'Add Qwen OAuth connection flag',
  },
  {
    version: 158,
    sql: "ALTER TABLE user_profile ADD COLUMN disabled_providers TEXT NOT NULL DEFAULT '[]'",
    description: 'Add per-provider disable toggles',
  },
  {
    version: 159,
    sql: 'ALTER TABLE mind_map_nodes ADD COLUMN explanation TEXT',
    description: 'Add cached AI explanation text to mind map nodes',
  },
  {
    version: 160,
    sql: 'ALTER TABLE mind_map_edges ADD COLUMN is_cross_link INTEGER NOT NULL DEFAULT 0',
    description: 'Flag cross-link edges for distinct visual rendering',
  },
  {
    version: 161,
    sql: "ALTER TABLE guru_chat_session_memory ADD COLUMN state_json TEXT NOT NULL DEFAULT '{}'",
    description:
      'Structured tutoring state for Guru chat thread memory (moved from duplicate v149)',
  },
  {
    version: 162,
    sql: "CREATE TABLE IF NOT EXISTS content_fact_checks (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  check_status TEXT NOT NULL DEFAULT 'pending'\n    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),\n  contradictions_json TEXT,\n  checked_at INTEGER NOT NULL,\n  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE\n)",
    description: 'Add content_fact_checks table for automated fact-check results',
  },
  {
    version: 163,
    sql: "CREATE TABLE IF NOT EXISTS user_content_flags (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  user_note TEXT,\n  flag_reason TEXT NOT NULL\n    CHECK(flag_reason IN ('incorrect_fact', 'outdated_info', 'wrong_dosage', 'missing_concept', 'other')),\n  flagged_at INTEGER NOT NULL,\n  resolved INTEGER NOT NULL DEFAULT 0,\n  resolved_at INTEGER,\n  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE\n)",
    description: 'Add user_content_flags table for manual content flagging',
  },
  {
    version: 164,
    sql: "ALTER TABLE user_profile ADD COLUMN jina_api_key TEXT NOT NULL DEFAULT ''",
    description: 'Add Jina AI API key for embedding fallback',
  },
  {
    version: 165,
    sql: 'ALTER TABLE user_profile ADD COLUMN auto_repair_legacy_notes_enabled INTEGER NOT NULL DEFAULT 0',
    description: 'Add toggle for auto-repair legacy notes feature',
  },
  {
    version: 166,
    sql: 'ALTER TABLE user_profile ADD COLUMN scan_orphaned_transcripts_enabled INTEGER NOT NULL DEFAULT 0',
    description: 'Add toggle for scan orphaned transcripts feature',
  },
  {
    version: 167,
    sql: 'ALTER TABLE user_profile ADD COLUMN use_nano INTEGER NOT NULL DEFAULT 1',
    description: 'Add toggle for Gemini Nano (AICore) in local AI fallback chain',
  },
  {
    version: 168,
    sql: "ALTER TABLE user_profile ADD COLUMN loading_orb_style TEXT NOT NULL DEFAULT 'classic'",
    description: 'Add loading orb style preference',
  },
];
/** Latest schema version. Bump when adding new migrations. */
exports.LATEST_VERSION = 168;
