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
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  parent_topic_id INTEGER REFERENCES topics(id),
  name TEXT NOT NULL,
  estimated_minutes INTEGER DEFAULT 35,
  inicet_priority INTEGER DEFAULT 5,
  UNIQUE(subject_id, name)
)`;

export const CREATE_TOPIC_PROGRESS = `
CREATE TABLE IF NOT EXISTS topic_progress (
  topic_id INTEGER PRIMARY KEY REFERENCES topics(id),
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
  created_at INTEGER NOT NULL
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
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  content_type TEXT NOT NULL
    CHECK(content_type IN ('keypoints','quiz','story','mnemonic','teach_back','error_hunt','detective')),
  content_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL,
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
  inicet_date TEXT NOT NULL DEFAULT '2026-05-01',
  neet_date TEXT NOT NULL DEFAULT '2026-08-01',
  preferred_session_length INTEGER NOT NULL DEFAULT 45,
  openrouter_api_key TEXT NOT NULL DEFAULT '',
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  strict_mode_enabled INTEGER NOT NULL DEFAULT 0,
  always_ask_mood_on_launch INTEGER NOT NULL DEFAULT 1,
  focus_audio_enabled INTEGER NOT NULL DEFAULT 0,
  visual_timers_enabled INTEGER NOT NULL DEFAULT 1,
  face_tracking_enabled INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT
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
  duration_minutes INTEGER,
  notes TEXT
)`;

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
  CREATE_EXTERNAL_APP_LOGS
];
