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
        CHECK(content_type IN ('keypoints','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic')),
      content_json TEXT NOT NULL,
      model_used TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_flagged INTEGER NOT NULL DEFAULT 0,
      UNIQUE(topic_id, content_type)
    ); CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)`,
    description: 'Recreate ai_cache with updated CHECK constraint (add manual, socratic content types)',
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
];

/** Latest schema version. Bump when adding new migrations. */
export const LATEST_VERSION = 106;
