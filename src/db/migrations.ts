/**
 * Versioned database migrations.
 * Uses PRAGMA user_version to track applied migrations — only pending ones run on boot.
 * migration_history table (v59+) provides an audit trail of applied migrations.
 * Fresh installs (topicCount === 0) skip migrations; schema comes from CREATE TABLE.
 * Exam date defaults come from appConfig for consistency.
 */
import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

export interface Migration {
  version: number;
  sql: string;
  description?: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `ALTER TABLE topics ADD COLUMN parent_topic_id INTEGER REFERENCES topics(id)`,
  },
  { version: 2, sql: `ALTER TABLE topic_progress ADD COLUMN next_review_date TEXT` },
  { version: 3, sql: `ALTER TABLE topic_progress ADD COLUMN user_notes TEXT NOT NULL DEFAULT ''` },
  { version: 4, sql: `ALTER TABLE external_app_logs ADD COLUMN recording_path TEXT` },
  {
    version: 5,
    sql: `ALTER TABLE external_app_logs ADD COLUMN transcription_status TEXT DEFAULT 'pending'`,
  },
  { version: 6, sql: `ALTER TABLE external_app_logs ADD COLUMN transcription_error TEXT` },
  { version: 7, sql: `ALTER TABLE external_app_logs ADD COLUMN lecture_note_id INTEGER` },
  {
    version: 8,
    sql: `ALTER TABLE external_app_logs ADD COLUMN note_enhancement_status TEXT DEFAULT 'pending'`,
  },
  { version: 9, sql: `ALTER TABLE external_app_logs ADD COLUMN pipeline_metrics_json TEXT` },
  { version: 10, sql: `ALTER TABLE user_profile ADD COLUMN strict_mode_enabled INTEGER DEFAULT 0` },
  {
    version: 11,
    sql: `ALTER TABLE user_profile ADD COLUMN streak_shield_available INTEGER DEFAULT 1`,
  },
  {
    version: 12,
    sql: `ALTER TABLE user_profile ADD COLUMN openrouter_key TEXT NOT NULL DEFAULT ''`,
  },
  {
    version: 13,
    sql: `ALTER TABLE user_profile ADD COLUMN body_doubling_enabled INTEGER NOT NULL DEFAULT 1`,
  },
  {
    version: 14,
    sql: `ALTER TABLE user_profile ADD COLUMN blocked_content_types TEXT NOT NULL DEFAULT '[]'`,
  },
  {
    version: 15,
    sql: `ALTER TABLE user_profile ADD COLUMN idle_timeout_minutes INTEGER NOT NULL DEFAULT 2`,
  },
  {
    version: 16,
    sql: `ALTER TABLE user_profile ADD COLUMN break_duration_minutes INTEGER NOT NULL DEFAULT 5`,
  },
  {
    version: 17,
    sql: `ALTER TABLE user_profile ADD COLUMN notification_hour INTEGER NOT NULL DEFAULT 7`,
  },
  {
    version: 18,
    sql: `ALTER TABLE user_profile ADD COLUMN focus_subject_ids TEXT NOT NULL DEFAULT '[]'`,
  },
  {
    version: 19,
    sql: `ALTER TABLE user_profile ADD COLUMN focus_audio_enabled INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 20,
    sql: `ALTER TABLE user_profile ADD COLUMN visual_timers_enabled INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 21,
    sql: `ALTER TABLE user_profile ADD COLUMN face_tracking_enabled INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 22,
    sql: `ALTER TABLE topic_progress ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 23,
    sql: `ALTER TABLE topic_progress ADD COLUMN is_nemesis INTEGER NOT NULL DEFAULT 0`,
  },
  {
    version: 24,
    sql: `ALTER TABLE user_profile ADD COLUMN quiz_correct_count INTEGER NOT NULL DEFAULT 0`,
  },
  { version: 25, sql: `ALTER TABLE user_profile ADD COLUMN last_backup_date TEXT` },
  {
    version: 26,
    sql: `ALTER TABLE user_profile ADD COLUMN guru_frequency TEXT NOT NULL DEFAULT 'normal'`,
  },
  {
    version: 27,
    sql: `ALTER TABLE user_profile ADD COLUMN use_local_model INTEGER NOT NULL DEFAULT 1`,
  },
  { version: 28, sql: `ALTER TABLE user_profile ADD COLUMN local_model_path TEXT` },
  {
    version: 29,
    sql: `ALTER TABLE user_profile ADD COLUMN use_local_whisper INTEGER NOT NULL DEFAULT 1`,
  },
  { version: 30, sql: `ALTER TABLE user_profile ADD COLUMN local_whisper_path TEXT` },
  {
    version: 31,
    sql: `ALTER TABLE user_profile ADD COLUMN quick_start_streak INTEGER NOT NULL DEFAULT 0`,
  },
  { version: 32, sql: `ALTER TABLE user_profile ADD COLUMN groq_api_key TEXT NOT NULL DEFAULT ''` },
  {
    version: 33,
    sql: `ALTER TABLE user_profile ADD COLUMN study_resource_mode TEXT NOT NULL DEFAULT 'hybrid'`,
  },
  {
    version: 34,
    sql: `ALTER TABLE user_profile ADD COLUMN subject_load_overrides_json TEXT NOT NULL DEFAULT '{}'`,
  },
  {
    version: 35,
    sql: `ALTER TABLE user_profile ADD COLUMN inicet_date TEXT NOT NULL DEFAULT '${DEFAULT_INICET_DATE}'`,
  },
  {
    version: 36,
    sql: `ALTER TABLE user_profile ADD COLUMN neet_date TEXT NOT NULL DEFAULT '${DEFAULT_NEET_DATE}'`,
  },
  { version: 37, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_due TEXT` },
  { version: 38, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_stability REAL DEFAULT 0` },
  { version: 39, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_difficulty REAL DEFAULT 0` },
  { version: 40, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_elapsed_days INTEGER DEFAULT 0` },
  {
    version: 41,
    sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_scheduled_days INTEGER DEFAULT 0`,
  },
  { version: 42, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_reps INTEGER DEFAULT 0` },
  { version: 43, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_lapses INTEGER DEFAULT 0` },
  { version: 44, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_state INTEGER DEFAULT 0` },
  { version: 45, sql: `ALTER TABLE topic_progress ADD COLUMN fsrs_last_review TEXT` },
  {
    version: 46,
    sql: `UPDATE user_profile SET inicet_date = '${DEFAULT_INICET_DATE}' WHERE inicet_date IS NULL OR inicet_date = '' OR inicet_date = '2026-05-01'`,
  },
  {
    version: 47,
    sql: `UPDATE user_profile SET neet_date = '${DEFAULT_NEET_DATE}' WHERE neet_date IS NULL OR neet_date = '' OR neet_date = '2026-08-01'`,
  },
  {
    version: 48,
    sql: `UPDATE user_profile SET use_local_model = 1 WHERE use_local_model = 0 AND (openrouter_api_key IS NULL OR openrouter_api_key = '')`,
  },
  {
    version: 49,
    sql: `UPDATE user_profile SET use_local_whisper = 1 WHERE use_local_whisper = 0 AND (openrouter_api_key IS NULL OR openrouter_api_key = '')`,
  },
  {
    version: 50,
    sql: `UPDATE user_profile SET study_resource_mode = 'hybrid' WHERE study_resource_mode IS NULL OR study_resource_mode = ''`,
  },
  {
    version: 51,
    sql: `UPDATE user_profile SET subject_load_overrides_json = '{}' WHERE subject_load_overrides_json IS NULL OR subject_load_overrides_json = ''`,
  },
  {
    version: 52,
    sql: `ALTER TABLE user_profile ADD COLUMN harassment_tone TEXT NOT NULL DEFAULT 'shame'`,
  },
  { version: 53, sql: `ALTER TABLE lecture_notes ADD COLUMN transcript TEXT` },
  { version: 54, sql: `ALTER TABLE lecture_notes ADD COLUMN summary TEXT` },
  { version: 55, sql: `ALTER TABLE lecture_notes ADD COLUMN topics_json TEXT` },
  { version: 56, sql: `ALTER TABLE lecture_notes ADD COLUMN app_name TEXT` },
  { version: 57, sql: `ALTER TABLE lecture_notes ADD COLUMN duration_minutes INTEGER` },
  { version: 58, sql: `ALTER TABLE lecture_notes ADD COLUMN confidence INTEGER DEFAULT 2` },
  {
    version: 59,
    sql: `CREATE TABLE IF NOT EXISTS migration_history (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  description TEXT
)`,
    description: 'migration_history audit table',
  },
  { version: 60, sql: `ALTER TABLE lecture_notes ADD COLUMN embedding BLOB` },
  { version: 61, sql: `ALTER TABLE topics ADD COLUMN embedding BLOB` },
  {
    version: 62,
    sql: `ALTER TABLE user_profile ADD COLUMN backup_directory_uri TEXT`,
    description: 'Add cloud/public backup directory URI',
  },
  {
    version: 63,
    sql: `CREATE TABLE IF NOT EXISTS daily_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  source TEXT DEFAULT 'guru',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
    description: 'Add daily_plan table for AI study twin',
  },
  {
    version: 64,
    sql: `CREATE TABLE IF NOT EXISTS plan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
    description: 'Add plan_events table for AI study twin',
  },
  {
    version: 65,
    sql: `CREATE INDEX IF NOT EXISTS idx_daily_plan_date ON daily_plan(date)`,
    description: 'Add index for daily_plan date',
  },
  {
    version: 66,
    sql: `CREATE INDEX IF NOT EXISTS idx_plan_events_date ON plan_events(date)`,
    description: 'Add index for plan_events date',
  },
  // ── Lecture Recording Pipeline Improvements ─────────────────────────────────────
  {
    version: 67,
    sql: `ALTER TABLE lecture_notes ADD COLUMN recording_path TEXT`,
    description: 'Store path to recording file for cleanup',
  },
  {
    version: 68,
    sql: `ALTER TABLE lecture_notes ADD COLUMN recording_duration_seconds INTEGER`,
    description: 'Store actual recording duration in seconds',
  },
  {
    version: 69,
    sql: `ALTER TABLE lecture_notes ADD COLUMN transcription_confidence REAL`,
    description: 'Store confidence score (0-1) from transcription',
  },
  {
    version: 70,
    sql: `ALTER TABLE lecture_notes ADD COLUMN processing_metrics_json TEXT`,
    description: 'Store timing metrics: {transcriptionMs, totalMs, modelUsed}',
  },
  {
    version: 71,
    sql: `ALTER TABLE lecture_notes ADD COLUMN retry_count INTEGER DEFAULT 0`,
    description: 'Track how many times transcription was retried',
  },
  {
    version: 72,
    sql: `ALTER TABLE lecture_notes ADD COLUMN last_error TEXT`,
    description: 'Store last error message if transcription failed',
  },
  {
    version: 73,
    sql: `CREATE TABLE IF NOT EXISTS lecture_learned_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_note_id INTEGER NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  confidence_at_time INTEGER NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(lecture_note_id, topic_id)
)`,
    description: 'Track which topics were learned from each lecture',
  },
  {
    version: 74,
    sql: `CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_lecture ON lecture_learned_topics(lecture_note_id)`,
    description: 'Index for finding topics from a lecture',
  },
  {
    version: 75,
    sql: `CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_topic ON lecture_learned_topics(topic_id)`,
    description: 'Index for finding lectures that covered a topic',
  },
  {
    version: 76,
    sql: `ALTER TABLE daily_plan RENAME TO daily_agenda;`,
    description: 'Rename daily_plan to daily_agenda for consistency',
  },
  {
    version: 77,
    sql: `DROP INDEX IF EXISTS idx_daily_plan_date; CREATE INDEX IF NOT EXISTS idx_daily_agenda_date ON daily_agenda(date);`,
    description: 'Update index name for daily_agenda',
  },
  {
    version: 78,
    sql: `ALTER TABLE user_profile ADD COLUMN pomodoro_enabled INTEGER NOT NULL DEFAULT 1`,
    description: 'Add Pomodoro enabled flag to user_profile',
  },
  {
    version: 79,
    sql: `ALTER TABLE user_profile ADD COLUMN pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20`,
    description: 'Add Pomodoro interval duration to user_profile',
  },
  {
    version: 80,
    sql: `ALTER TABLE user_profile ADD COLUMN huggingface_token TEXT NOT NULL DEFAULT ''`,
    description: 'Add Hugging Face API token to user_profile',
  },
  {
    version: 81,
    sql: `ALTER TABLE user_profile ADD COLUMN huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'`,
    description: 'Add Hugging Face transcription model to user_profile',
  },
  {
    version: 82,
    sql: `ALTER TABLE user_profile ADD COLUMN transcription_provider TEXT NOT NULL DEFAULT 'auto'`,
    description: 'Add preferred transcription provider to user_profile',
  },
  {
    version: 83,
    sql: `UPDATE user_profile
          SET transcription_provider = CASE
            WHEN transcription_provider NOT IN ('auto','groq','huggingface','local') OR transcription_provider IS NULL OR transcription_provider = ''
            THEN 'auto'
            ELSE transcription_provider
          END`,
    description: 'Normalize transcription provider values',
  },
  {
    version: 84,
    sql: `UPDATE user_profile
          SET huggingface_transcription_model = 'openai/whisper-large-v3'
          WHERE huggingface_transcription_model IS NULL
             OR huggingface_transcription_model = ''
             OR huggingface_transcription_model = 'openai/whisper-large-v3-turbo'`,
    description: 'Move Hugging Face transcription default to whisper-large-v3',
  },
  {
    version: 85,
    sql: `CREATE TABLE IF NOT EXISTS topic_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  source_summary TEXT,
  mention_count INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  approved_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  first_detected_at INTEGER NOT NULL,
  last_detected_at INTEGER NOT NULL,
  UNIQUE(subject_id, normalized_name)
)`,
    description: 'Add review queue for syllabus topics suggested by lectures',
  },
  {
    version: 86,
    sql: `CREATE INDEX IF NOT EXISTS idx_topic_suggestions_status ON topic_suggestions(status, subject_id, last_detected_at DESC)`,
    description: 'Index pending topic suggestions for syllabus review',
  },
  // ── Cloudflare Workers AI ─────────────────────────────────────────────────────
  {
    version: 87,
    sql: `ALTER TABLE user_profile ADD COLUMN cloudflare_account_id TEXT NOT NULL DEFAULT ''`,
    description: 'Add Cloudflare Workers AI account ID to user_profile',
  },
  {
    version: 88,
    sql: `ALTER TABLE user_profile ADD COLUMN cloudflare_api_token TEXT NOT NULL DEFAULT ''`,
    description: 'Add Cloudflare Workers AI API token to user_profile',
  },
  {
    version: 89,
    sql: `UPDATE user_profile
          SET transcription_provider = CASE
            WHEN transcription_provider NOT IN ('auto','groq','huggingface','cloudflare','local') OR transcription_provider IS NULL OR transcription_provider = ''
            THEN 'auto'
            ELSE transcription_provider
          END`,
    description: 'Normalize transcription provider values to include cloudflare option',
  },
  {
    version: 90,
    sql: `ALTER TABLE user_profile ADD COLUMN gemini_key TEXT NOT NULL DEFAULT ''`,
    description: 'Add Gemini API key to user_profile',
  },
  {
    version: 91,
    sql: `CREATE TABLE IF NOT EXISTS generated_study_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  context_type TEXT NOT NULL
    CHECK(context_type IN ('chat','topic_note','lecture_note')),
  context_key TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  topic_name TEXT NOT NULL,
  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE CASCADE,
  style TEXT NOT NULL
    CHECK(style IN ('illustration','chart')),
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_used TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  local_uri TEXT NOT NULL,
  remote_url TEXT,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
)`,
    description: 'Add generated_study_images table for note/chat attachments',
  },
  {
    version: 92,
    sql: `CREATE INDEX IF NOT EXISTS idx_generated_study_images_context ON generated_study_images(context_type, context_key, created_at DESC)`,
    description: 'Index generated study images by context',
  },
  {
    version: 93,
    sql: `CREATE INDEX IF NOT EXISTS idx_generated_study_images_topic ON generated_study_images(topic_name, context_type, created_at DESC)`,
    description: 'Index generated study images by topic',
  },
  {
    version: 94,
    sql: `ALTER TABLE user_profile ADD COLUMN guru_chat_default_model TEXT NOT NULL DEFAULT 'auto'`,
    description:
      'Default Guru Chat model id (auto, local, groq/..., openrouter id, gemini/..., cf/...)',
  },
  {
    version: 95,
    sql: `ALTER TABLE user_profile ADD COLUMN guru_memory_notes TEXT NOT NULL DEFAULT ''`,
    description: 'Guru Chat persistent memory notes (profile)',
  },
  {
    version: 96,
    sql: `CREATE TABLE IF NOT EXISTS guru_chat_session_memory (
  topic_name TEXT PRIMARY KEY,
  summary_text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  messages_at_last_summary INTEGER NOT NULL DEFAULT 0
)`,
    description: 'Per-topic rolling session summary for Guru Chat',
  },
  {
    version: 97,
    sql: `ALTER TABLE user_profile ADD COLUMN image_generation_model TEXT NOT NULL DEFAULT 'auto'`,
    description: 'Study image generation model preference (auto, Gemini id, or @cf/...)',
  },
  {
    version: 98,
    sql: `ALTER TABLE chat_history ADD COLUMN sources_json TEXT`,
    description: 'Add sources_json to chat_history to persist grounding sources',
  },
  {
    version: 99,
    sql: `ALTER TABLE chat_history ADD COLUMN model_used TEXT`,
    description: 'Add model_used to chat_history to display the model used for each message',
  },
  {
    version: 100,
    sql: `ALTER TABLE user_profile ADD COLUMN exam_type TEXT NOT NULL DEFAULT 'INICET'`,
    description: 'Persist INICET vs NEET exam selection',
  },
  {
    version: 101,
    sql: `ALTER TABLE user_profile ADD COLUMN prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1`,
    description: 'Prefer Gemini native JSON + schema for structured AI (generateJSONWithRouting)',
  },
  {
    version: 102,
    sql: `ALTER TABLE user_profile ADD COLUMN github_models_pat TEXT NOT NULL DEFAULT ''`,
    description: 'GitHub Models PAT (models:read) for OpenAI-style chat at models.github.ai',
  },
  {
    version: 103,
    sql: `DROP TABLE IF EXISTS ai_cache; CREATE TABLE IF NOT EXISTS ai_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      content_type TEXT NOT NULL
        CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic')),
      content_json TEXT NOT NULL,
      model_used TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(topic_id, content_type)
    ); CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)`,
    description:
      'Recreate ai_cache with updated CHECK constraint (add manual, socratic content types)',
  },
  {
    version: 104,
    sql: `ALTER TABLE user_profile ADD COLUMN kilo_api_key TEXT NOT NULL DEFAULT ''`,
    description: 'Kilo gateway API key for OpenAI-compatible chat routing',
  },
  {
    version: 105,
    sql: `ALTER TABLE user_profile ADD COLUMN deepseek_key TEXT NOT NULL DEFAULT ''`,
    description: 'DeepSeek API key for direct DeepSeek chat/reasoner routing',
  },
  {
    version: 106,
    sql: `ALTER TABLE user_profile ADD COLUMN agentrouter_key TEXT NOT NULL DEFAULT ''`,
    description: 'AgentRouter API key (OpenAI-compatible proxy at agentrouter.org)',
  },
  {
    version: 107,
    sql: `ALTER TABLE user_profile ADD COLUMN provider_order TEXT NOT NULL DEFAULT '[]'`,
    description: 'Customisable cloud LLM provider priority order (JSON array of provider IDs)',
  },
  {
    version: 108,
    sql: `ALTER TABLE user_profile ADD COLUMN deepgram_api_key TEXT NOT NULL DEFAULT ''`,
    description: 'Deepgram API key for batch + live WebSocket transcription',
  },
  {
    version: 109,
    sql: `CREATE TABLE IF NOT EXISTS question_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  explanation TEXT NOT NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  topic_name TEXT NOT NULL DEFAULT '',
  subject_name TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'content_card'
    CHECK(source IN ('content_card','lecture_quiz','mock_test','live_lecture','manual')),
  source_id TEXT,
  image_url TEXT,
  is_bookmarked INTEGER NOT NULL DEFAULT 0,
  is_mastered INTEGER NOT NULL DEFAULT 0,
  times_seen INTEGER NOT NULL DEFAULT 0,
  times_correct INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  next_review_at INTEGER,
  difficulty REAL NOT NULL DEFAULT 0.5,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qb_subject ON question_bank(subject_name);
CREATE INDEX IF NOT EXISTS idx_qb_topic ON question_bank(topic_id);
CREATE INDEX IF NOT EXISTS idx_qb_review ON question_bank(next_review_at, is_mastered);
CREATE INDEX IF NOT EXISTS idx_qb_bookmarked ON question_bank(is_bookmarked);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_dedup ON question_bank(question)`,
    description: 'Question bank table for auto-saved MCQs with SR scheduling',
  },
  {
    version: 110,
    sql: `
-- Rebuild user_profile to widen the transcription_provider CHECK constraint to include 'deepgram'.
-- SQLite cannot ALTER a CHECK, so we recreate the table.
CREATE TABLE user_profile_new (
  id INTEGER PRIMARY KEY DEFAULT 1,
  display_name TEXT NOT NULL DEFAULT 'Doctor',
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
  inicet_date TEXT NOT NULL DEFAULT '2026-05-01',
  neet_date TEXT NOT NULL DEFAULT '2026-08-01',
  preferred_session_length INTEGER NOT NULL DEFAULT 45,
  openrouter_api_key TEXT NOT NULL DEFAULT '',
  openrouter_key TEXT NOT NULL DEFAULT '',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  last_active_date TEXT,
  sync_code TEXT,
  strict_mode_enabled INTEGER NOT NULL DEFAULT 0,
  streak_shield_available INTEGER NOT NULL DEFAULT 1,
  body_doubling_enabled INTEGER NOT NULL DEFAULT 1,
  blocked_content_types TEXT NOT NULL DEFAULT '[]',
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 2,
  break_duration_minutes INTEGER NOT NULL DEFAULT 5,
  notification_hour INTEGER NOT NULL DEFAULT 7,
  guru_frequency TEXT NOT NULL DEFAULT 'normal',
  focus_subject_ids TEXT NOT NULL DEFAULT '[]',
  focus_audio_enabled INTEGER NOT NULL DEFAULT 0,
  visual_timers_enabled INTEGER NOT NULL DEFAULT 0,
  face_tracking_enabled INTEGER NOT NULL DEFAULT 0,
  quiz_correct_count INTEGER NOT NULL DEFAULT 0,
  last_backup_date TEXT,
  use_local_model INTEGER NOT NULL DEFAULT 1,
  local_model_path TEXT,
  use_local_whisper INTEGER NOT NULL DEFAULT 1,
  local_whisper_path TEXT,
  quick_start_streak INTEGER NOT NULL DEFAULT 0,
  groq_api_key TEXT NOT NULL DEFAULT '',
  gemini_key TEXT NOT NULL DEFAULT '',
  huggingface_token TEXT NOT NULL DEFAULT '',
  huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3',
  transcription_provider TEXT NOT NULL DEFAULT 'auto',
  study_resource_mode TEXT NOT NULL DEFAULT 'hybrid',
  subject_load_overrides_json TEXT NOT NULL DEFAULT '{}',
  backup_directory_uri TEXT,
  pomodoro_enabled INTEGER NOT NULL DEFAULT 1,
  pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20,
  cloudflare_account_id TEXT NOT NULL DEFAULT '',
  cloudflare_api_token TEXT NOT NULL DEFAULT '',
  guru_chat_default_model TEXT NOT NULL DEFAULT 'auto',
  guru_memory_notes TEXT NOT NULL DEFAULT '',
  image_generation_model TEXT NOT NULL DEFAULT 'auto',
  exam_type TEXT NOT NULL DEFAULT 'INICET',
  prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1,
  github_models_pat TEXT NOT NULL DEFAULT '',
  kilo_api_key TEXT NOT NULL DEFAULT '',
  deepseek_key TEXT NOT NULL DEFAULT '',
  agentrouter_key TEXT NOT NULL DEFAULT '',
  provider_order TEXT NOT NULL DEFAULT '[]',
  deepgram_api_key TEXT NOT NULL DEFAULT ''
);

INSERT INTO user_profile_new SELECT
  id, display_name, total_xp, current_level, streak_current, streak_best,
  daily_goal_minutes, inicet_date, neet_date, preferred_session_length,
  openrouter_api_key, openrouter_key, notifications_enabled, last_active_date,
  sync_code, strict_mode_enabled, streak_shield_available, body_doubling_enabled,
  blocked_content_types, idle_timeout_minutes, break_duration_minutes, notification_hour,
  guru_frequency, focus_subject_ids, focus_audio_enabled, visual_timers_enabled,
  face_tracking_enabled, quiz_correct_count, last_backup_date, use_local_model,
  local_model_path, use_local_whisper, local_whisper_path, quick_start_streak,
  groq_api_key, gemini_key, huggingface_token, huggingface_transcription_model,
  CASE WHEN transcription_provider IN ('auto','groq','huggingface','cloudflare','deepgram','local') THEN transcription_provider ELSE 'auto' END,
  study_resource_mode, subject_load_overrides_json, backup_directory_uri,
  pomodoro_enabled, pomodoro_interval_minutes, cloudflare_account_id, cloudflare_api_token,
  guru_chat_default_model, guru_memory_notes, image_generation_model, exam_type,
  prefer_gemini_structured_json, github_models_pat, kilo_api_key, deepseek_key,
  agentrouter_key, provider_order, deepgram_api_key
FROM user_profile;

DROP TABLE user_profile;
ALTER TABLE user_profile_new RENAME TO user_profile`,
    description: 'Rebuild user_profile to strip CHECK constraints (validation moved to app layer)',
  },
  {
    version: 111,
    sql: `ALTER TABLE user_profile ADD COLUMN api_validation_json TEXT NOT NULL DEFAULT '{}'`,
    description: 'Persist API provider key validation metadata for Settings UI status',
  },
  {
    version: 112,
    sql: `DROP TABLE IF EXISTS external_app_logs_new`,
    description: 'Cleanup leftover temp table from failed migration',
  },
  {
    version: 113,
    sql: `CREATE TABLE external_app_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name TEXT NOT NULL,
      launched_at INTEGER NOT NULL,
      returned_at INTEGER,
      duration_minutes REAL,
      notes TEXT,
      recording_path TEXT,
      transcription_status TEXT DEFAULT 'pending'
        CHECK(transcription_status IN ('pending','recording','transcribing','completed','failed','no_audio','dismissed')),
      transcription_error TEXT,
      lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL,
      note_enhancement_status TEXT DEFAULT 'pending'
        CHECK(note_enhancement_status IN ('pending','completed','failed')),
      pipeline_metrics_json TEXT
    )`,
    description: 'Create new external_app_logs with dismissed in CHECK',
  },
  {
    version: 114,
    sql: `INSERT OR IGNORE INTO external_app_logs_new SELECT * FROM external_app_logs`,
    description: 'Copy data to new external_app_logs table',
  },
  {
    version: 115,
    sql: `DROP TABLE external_app_logs`,
    description: 'Drop old external_app_logs',
  },
  {
    version: 116,
    sql: `ALTER TABLE external_app_logs_new RENAME TO external_app_logs`,
    description: 'Rename new table to external_app_logs',
  },
  {
    version: 117,
    sql: `ALTER TABLE user_profile ADD COLUMN chatgpt_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Add chatgpt_connected flag to user_profile',
  },
  {
    version: 118,
    sql: `ALTER TABLE user_profile ADD COLUMN fal_api_key TEXT NOT NULL DEFAULT ''`,
    description: 'Add fal API key for image generation',
  },
  {
    version: 119,
    sql: `CREATE TABLE IF NOT EXISTS guru_chat_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_name TEXT NOT NULL,
      syllabus_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_message_at INTEGER NOT NULL,
      last_message_preview TEXT NOT NULL DEFAULT ''
    )`,
    description: 'Create Guru chat thread table',
  },
  {
    version: 120,
    sql: `ALTER TABLE chat_history ADD COLUMN thread_id INTEGER`,
    description: 'Add thread_id to chat_history',
  },
  {
    version: 121,
    sql: `ALTER TABLE guru_chat_session_memory ADD COLUMN thread_id INTEGER`,
    description: 'Add thread_id to guru_chat_session_memory',
  },
  {
    version: 122,
    sql: `INSERT INTO guru_chat_threads (
      topic_name,
      syllabus_topic_id,
      title,
      created_at,
      updated_at,
      last_message_at,
      last_message_preview
    )
    SELECT
      topic_name,
      NULL,
      topic_name,
      COALESCE(MIN(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),
      COALESCE(MAX(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),
      COALESCE(MAX(timestamp), CAST(strftime('%s','now') AS INTEGER) * 1000),
      COALESCE((
        SELECT substr(replace(replace(ch2.message, char(10), ' '), char(13), ' '), 1, 96)
        FROM chat_history ch2
        WHERE ch2.topic_name = grouped.topic_name
        ORDER BY ch2.timestamp DESC, ch2.id DESC
        LIMIT 1
      ), '')
    FROM (
      SELECT topic_name, timestamp FROM chat_history
      UNION ALL
      SELECT topic_name, NULL AS timestamp FROM guru_chat_session_memory
    ) AS grouped
    GROUP BY topic_name`,
    description: 'Backfill Guru chat threads from legacy chat history and session memory',
  },
  {
    version: 123,
    sql: `UPDATE chat_history
      SET thread_id = (
        SELECT id
        FROM guru_chat_threads
        WHERE guru_chat_threads.topic_name = chat_history.topic_name
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      )
      WHERE thread_id IS NULL`,
    description: 'Backfill chat_history.thread_id from legacy topic threads',
  },
  {
    version: 124,
    sql: `UPDATE guru_chat_session_memory
      SET thread_id = (
        SELECT id
        FROM guru_chat_threads
        WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name
        ORDER BY last_message_at DESC, id DESC
        LIMIT 1
      )
      WHERE thread_id IS NULL`,
    description: 'Backfill guru_chat_session_memory.thread_id from legacy topic threads',
  },
  {
    version: 125,
    sql: `CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_last_message ON guru_chat_threads(last_message_at DESC, updated_at DESC)`,
    description: 'Index Guru chat threads by recent activity',
  },
  {
    version: 126,
    sql: `CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_topic ON guru_chat_threads(topic_name, syllabus_topic_id, last_message_at DESC)`,
    description: 'Index Guru chat threads by topic',
  },
  {
    version: 127,
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_history_thread ON chat_history(thread_id, timestamp ASC)`,
    description: 'Index chat history by thread',
  },
  {
    version: 128,
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)`,
    description: 'Ensure one session memory row per Guru chat thread',
  },
  {
    version: 129,
    sql: `DROP TABLE IF EXISTS guru_chat_session_memory_new;
CREATE TABLE guru_chat_session_memory_new (
  thread_id INTEGER PRIMARY KEY,
  topic_name TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  messages_at_last_summary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(thread_id) REFERENCES guru_chat_threads(id) ON DELETE CASCADE
);
INSERT OR REPLACE INTO guru_chat_session_memory_new (
  thread_id,
  topic_name,
  summary_text,
  updated_at,
  messages_at_last_summary
)
SELECT
  COALESCE(
    thread_id,
    (
      SELECT id
      FROM guru_chat_threads
      WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name
      ORDER BY last_message_at DESC, id DESC
      LIMIT 1
    )
  ) AS resolved_thread_id,
  topic_name,
  summary_text,
  updated_at,
  messages_at_last_summary
FROM guru_chat_session_memory
WHERE COALESCE(
  thread_id,
  (
    SELECT id
    FROM guru_chat_threads
    WHERE guru_chat_threads.topic_name = guru_chat_session_memory.topic_name
    ORDER BY last_message_at DESC, id DESC
    LIMIT 1
  )
) IS NOT NULL;
DROP TABLE guru_chat_session_memory;
ALTER TABLE guru_chat_session_memory_new RENAME TO guru_chat_session_memory;
CREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)`,
    description: 'Rebuild guru_chat_session_memory to remove legacy topic_name uniqueness',
  },
  {
    version: 130,
    sql: `ALTER TABLE user_profile ADD COLUMN brave_search_api_key TEXT NOT NULL DEFAULT ''`,
    description: 'Add Brave Search API key for image search fallback',
  },
  {
    version: 131,
    sql: `DROP TABLE IF EXISTS ai_cache; CREATE TABLE IF NOT EXISTS ai_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id INTEGER NOT NULL,
      content_type TEXT NOT NULL
        CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic')),
      content_json TEXT NOT NULL,
      model_used TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(topic_id, content_type)
    ); CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)`,
    description: 'Recreate ai_cache CHECK constraint to include must_know content',
  },
  {
    version: 132,
    sql: `ALTER TABLE user_profile ADD COLUMN chatgpt_accounts_json TEXT NOT NULL DEFAULT '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}'`,
    description: 'Add per-slot ChatGPT account config for primary and backup account fallback',
  },
  {
    version: 133,
    sql: `UPDATE user_profile
          SET chatgpt_accounts_json = CASE
            WHEN chatgpt_connected = 1
            THEN '{"primary":{"enabled":true,"connected":true},"secondary":{"enabled":false,"connected":false}}'
            ELSE '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}'
          END
          WHERE chatgpt_accounts_json IS NULL
             OR trim(chatgpt_accounts_json) = ''`,
    description: 'Backfill ChatGPT primary slot from legacy chatgpt_connected flag',
  },
  {
    version: 134,
    sql: `ALTER TABLE user_profile ADD COLUMN auto_backup_frequency TEXT NOT NULL DEFAULT 'off'`,
    description: 'Add auto-backup frequency setting for unified backup system',
  },
  {
    version: 135,
    sql: `ALTER TABLE user_profile ADD COLUMN last_auto_backup_at TEXT`,
    description: 'Add timestamp for last auto-backup execution',
  },
  {
    version: 136,
    sql: `ALTER TABLE user_profile ADD COLUMN github_copilot_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Add github_copilot_connected flag to user_profile',
  },
  {
    version: 137,
    sql: `ALTER TABLE user_profile ADD COLUMN gitlab_duo_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Add gitlab_duo_connected flag to user_profile',
  },
  {
    version: 138,
    sql: `ALTER TABLE user_profile ADD COLUMN poe_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Add poe_connected flag to user_profile',
  },
  {
    version: 139,
    sql: `ALTER TABLE user_profile ADD COLUMN github_copilot_preferred_model TEXT NOT NULL DEFAULT ''`,
    description: 'Preferred GitHub Copilot model id for auto-routing',
  },
  {
    version: 140,
    sql: `ALTER TABLE user_profile ADD COLUMN gitlab_oauth_client_id TEXT NOT NULL DEFAULT ''`,
    description: 'GitLab OAuth Application ID (optional; overrides EXPO_PUBLIC_GITLAB_CLIENT_ID)',
  },
  {
    version: 141,
    sql: `ALTER TABLE user_profile ADD COLUMN gitlab_duo_preferred_model TEXT NOT NULL DEFAULT ''`,
    description: 'Preferred GitLab Duo model id for auto-routing',
  },
  {
    version: 142,
    sql: `ALTER TABLE user_profile ADD COLUMN gdrive_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Google Drive backup connection flag',
  },
  {
    version: 143,
    sql: `ALTER TABLE user_profile ADD COLUMN gdrive_email TEXT NOT NULL DEFAULT ''`,
    description: 'Google Drive connected account email',
  },
  {
    version: 144,
    sql: `ALTER TABLE user_profile ADD COLUMN gdrive_last_sync_at TEXT`,
    description: 'Timestamp of last successful GDrive backup sync',
  },
  {
    version: 145,
    sql: `ALTER TABLE user_profile ADD COLUMN last_backup_device_id TEXT NOT NULL DEFAULT ''`,
    description: 'Device ID of the last auto-backup (for cross-device detection)',
  },
  {
    version: 146,
    sql: `ALTER TABLE user_profile ADD COLUMN dbmci_class_start_date TEXT`,
    description: "Start date (YYYY-MM-DD) of the user's DBMCI One live batch",
  },
  {
    version: 147,
    sql: `ALTER TABLE user_profile ADD COLUMN btr_start_date TEXT`,
    description: "Start date (YYYY-MM-DD) of the user's BTR (Back to Roots) revision batch",
  },
  {
    version: 148,
    sql: `ALTER TABLE user_profile ADD COLUMN home_novelty_cooldown_hours INTEGER NOT NULL DEFAULT 6`,
    description: 'Home anti-repeat cooldown window (hours) for novelty rotation',
  },
  {
    version: 149,
    sql: `ALTER TABLE user_profile ADD COLUMN gdrive_web_client_id TEXT NOT NULL DEFAULT ''`,
    description: 'Google OAuth Web Client ID for Drive sync (runtime override)',
  },
  {
    version: 149,
    sql: `ALTER TABLE guru_chat_session_memory ADD COLUMN state_json TEXT NOT NULL DEFAULT '{}'`,
    description: 'Structured tutoring state for Guru chat thread memory',
  },
  // ── Lecture Schedule Progress ─────────────────────────────────────────────────
  {
    version: 150,
    sql: `CREATE TABLE IF NOT EXISTS lecture_schedule_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  lecture_index INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  UNIQUE(batch_id, lecture_index)
)`,
    description: 'Track completed lectures per coaching batch (BTR, DBMCI One)',
  },
  // ── Mind Maps ────────────────────────────────────────────────────────────────
  {
    version: 151,
    sql: `CREATE TABLE IF NOT EXISTS mind_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"scale":1}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`,
    description: 'Create mind_maps table for persistent infinite-canvas mind maps',
  },
  {
    version: 152,
    sql: `CREATE TABLE IF NOT EXISTS mind_map_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  color TEXT,
  is_center INTEGER NOT NULL DEFAULT 0,
  ai_generated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
)`,
    description: 'Create mind_map_nodes table for nodes on the canvas',
  },
  {
    version: 153,
    sql: `CREATE TABLE IF NOT EXISTS mind_map_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  source_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at INTEGER NOT NULL
)`,
    description: 'Create mind_map_edges table for connections between nodes',
  },
  {
    version: 154,
    sql: `CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_map ON mind_map_nodes(map_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_map ON mind_map_edges(map_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_source ON mind_map_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_mind_map_edges_target ON mind_map_edges(target_node_id)`,
    description: 'Add indexes for mind map lookups',
  },
  {
    version: 155,
    sql: `
-- Add 'flashcards' to ai_cache CHECK constraint (SQLite requires table recreation)
ALTER TABLE ai_cache RENAME TO ai_cache_old;
CREATE TABLE ai_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL
    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),
  content_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, content_type)
);
INSERT INTO ai_cache SELECT * FROM ai_cache_old;
DROP TABLE ai_cache_old;`,
    description: "Add 'flashcards' to ai_cache content_type CHECK constraint",
  },
  {
    version: 156,
    sql: `ALTER TABLE user_profile ADD COLUMN google_custom_search_api_key TEXT NOT NULL DEFAULT ''`,
    description: 'Add Google Custom Search API key for image search',
  },
  {
    version: 157,
    sql: `ALTER TABLE user_profile ADD COLUMN qwen_connected INTEGER NOT NULL DEFAULT 0`,
    description: 'Add Qwen OAuth connection flag',
  },
  {
    version: 158,
    sql: `ALTER TABLE user_profile ADD COLUMN disabled_providers TEXT NOT NULL DEFAULT '[]'`,
    description: 'Add per-provider disable toggles',
  },
];

/** Latest schema version. Bump when adding new migrations. */
export const LATEST_VERSION = 158;
