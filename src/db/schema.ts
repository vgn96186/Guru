import { DEFAULT_INICET_DATE, DEFAULT_NEET_DATE } from '../config/appConfig';

export const CREATE_SUBJECTS = `
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  color_hex TEXT NOT NULL,
  inicet_weight INTEGER NOT NULL,
  neet_weight INTEGER NOT NULL,
  display_order INTEGER NOT NULL
)`;

export const CREATE_TOPICS = `
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  parent_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 35,
  inicet_priority INTEGER DEFAULT 5,
  UNIQUE(subject_id, name)
)`;

export const CREATE_TOPIC_PROGRESS = `
CREATE TABLE IF NOT EXISTS topic_progress (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unseen'
    CHECK(status IN ('unseen','seen','reviewed','mastered')),
  confidence INTEGER NOT NULL DEFAULT 0,
  last_studied_at INTEGER,
  times_studied INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  next_review_date TEXT,
  user_notes TEXT NOT NULL DEFAULT '',
  wrong_count INTEGER NOT NULL DEFAULT 0,
  is_nemesis INTEGER NOT NULL DEFAULT 0
  , fsrs_due TEXT
  , fsrs_stability REAL DEFAULT 0
  , fsrs_difficulty REAL DEFAULT 0
  , fsrs_elapsed_days INTEGER DEFAULT 0
  , fsrs_scheduled_days INTEGER DEFAULT 0
  , fsrs_reps INTEGER DEFAULT 0
  , fsrs_lapses INTEGER DEFAULT 0
  , fsrs_state INTEGER DEFAULT 0
  , fsrs_last_review TEXT

)`;

export const CREATE_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  planned_topics TEXT NOT NULL DEFAULT '[]',
  completed_topics TEXT NOT NULL DEFAULT '[]',
  total_xp_earned INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER,
  mood TEXT,
  mode TEXT NOT NULL DEFAULT 'normal',
  notes TEXT
)`;

export const CREATE_LECTURE_NOTES = `
CREATE TABLE IF NOT EXISTS lecture_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER REFERENCES subjects(id),
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  transcript TEXT,
  summary TEXT,
  topics_json TEXT,
  app_name TEXT,
  duration_minutes INTEGER,
  confidence INTEGER DEFAULT 2
)`;

export const CREATE_DAILY_LOG = `
CREATE TABLE IF NOT EXISTS daily_log (
  date TEXT PRIMARY KEY,
  checked_in INTEGER NOT NULL DEFAULT 0,
  mood TEXT,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0
)`;

export const CREATE_AI_CACHE = `
CREATE TABLE IF NOT EXISTS ai_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL
    CHECK(content_type IN ('keypoints','quiz','story','mnemonic','teach_back','error_hunt','detective')),
  content_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, content_type)
)`;

export const CREATE_USER_PROFILE = `
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY DEFAULT 1,
  display_name TEXT NOT NULL DEFAULT 'Doctor',
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_current INTEGER NOT NULL DEFAULT 0,
  streak_best INTEGER NOT NULL DEFAULT 0,
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,
  inicet_date TEXT NOT NULL DEFAULT '${DEFAULT_INICET_DATE}',
  neet_date TEXT NOT NULL DEFAULT '${DEFAULT_NEET_DATE}',
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
  guru_frequency TEXT NOT NULL DEFAULT 'normal'
    CHECK(guru_frequency IN ('rare','normal','frequent','off')),
  focus_subject_ids TEXT NOT NULL DEFAULT '[]',
  focus_audio_enabled INTEGER NOT NULL DEFAULT 0,
  visual_timers_enabled INTEGER NOT NULL DEFAULT 0,
  face_tracking_enabled INTEGER NOT NULL DEFAULT 0,
  quiz_correct_count INTEGER NOT NULL DEFAULT 0,
  last_backup_date TEXT,
  use_local_model INTEGER NOT NULL DEFAULT 1,
  local_model_path TEXT
  , use_local_whisper INTEGER NOT NULL DEFAULT 1
  , local_whisper_path TEXT
  , quick_start_streak INTEGER NOT NULL DEFAULT 0
  , groq_api_key TEXT NOT NULL DEFAULT ''
  , study_resource_mode TEXT NOT NULL DEFAULT 'hybrid'
    CHECK(study_resource_mode IN ('standard','btr','dbmci_live','hybrid'))
  , subject_load_overrides_json TEXT NOT NULL DEFAULT '{}'
)`;

export const CREATE_BRAIN_DUMPS = `
CREATE TABLE IF NOT EXISTS brain_dumps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

export const CREATE_EXTERNAL_APP_LOGS = `
CREATE TABLE IF NOT EXISTS external_app_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL,
  launched_at INTEGER NOT NULL,
  returned_at INTEGER,
  duration_minutes REAL,
  notes TEXT,
  recording_path TEXT,
  transcription_status TEXT DEFAULT 'pending'
    CHECK(transcription_status IN ('pending','recording','transcribing','completed','failed','no_audio')),
  transcription_error TEXT,
  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL,
  note_enhancement_status TEXT DEFAULT 'pending'
    CHECK(note_enhancement_status IN ('pending','completed','failed')),
  pipeline_metrics_json TEXT
)`;

export const CREATE_CHAT_HISTORY = `
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_name TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL
)`;

export const CREATE_OFFLINE_AI_QUEUE = `
CREATE TABLE IF NOT EXISTS offline_ai_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','processing','failed','completed')),
  attempts INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_attempt_at INTEGER,
  error_message TEXT
)`;

// ── Performance Indexes ───────────────────────────────────────────
export const DB_INDEXES = [
  // Spaced repetition lookups (HomeScreen agenda)
  `CREATE INDEX IF NOT EXISTS idx_tp_status_fsrs_due ON topic_progress(status, fsrs_due, confidence)`,
  // AI cache content fetches (topic detail screen)
  `CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)`,
  // Lecture notes chronological listing
  `CREATE INDEX IF NOT EXISTS idx_lecture_notes_created ON lecture_notes(created_at DESC)`,
  // External app session "active" check (returned_at IS NULL)
  `CREATE INDEX IF NOT EXISTS idx_ext_logs_active ON external_app_logs(returned_at)`,
  // Retry scanner for transcription recovery jobs
  `CREATE INDEX IF NOT EXISTS idx_ext_logs_retry ON external_app_logs(transcription_status, returned_at)`,
  // Sessions by date for StatsScreen
  `CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC)`,
  // Queue processing order for offline AI jobs
  `CREATE INDEX IF NOT EXISTS idx_offline_ai_queue_status ON offline_ai_queue(status, attempts, created_at)`,
  // Topic tree traversal (parent lookups)
  `CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics(parent_topic_id)`,
  // Topic-to-subject join
  `CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id)`,
];

export const ALL_SCHEMAS = [
  CREATE_SUBJECTS,
  CREATE_TOPICS,
  CREATE_TOPIC_PROGRESS,
  CREATE_SESSIONS,
  CREATE_LECTURE_NOTES,
  CREATE_DAILY_LOG,
  CREATE_AI_CACHE,
  CREATE_USER_PROFILE,
  CREATE_BRAIN_DUMPS,
  CREATE_EXTERNAL_APP_LOGS,
  CREATE_OFFLINE_AI_QUEUE,
  CREATE_CHAT_HISTORY,
];
