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
  embedding BLOB,
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
  confidence INTEGER DEFAULT 2,
  embedding BLOB,
  -- New fields for better tracking
  recording_path TEXT,
  recording_duration_seconds INTEGER,
  transcription_confidence REAL,
  processing_metrics_json TEXT,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
)`;

export const CREATE_LECTURE_LEARNED_TOPICS = `
CREATE TABLE IF NOT EXISTS lecture_learned_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lecture_note_id INTEGER NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  confidence_at_time INTEGER NOT NULL DEFAULT 2,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(lecture_note_id, topic_id)
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

/** Lives in `neet_ai_cache.db` (excluded from Android auto-backup). No FK — topic deletes are handled in app code. */
export const CREATE_AI_CACHE_STANDALONE = `
CREATE TABLE IF NOT EXISTS ai_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL
    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),
  content_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, content_type)
)`;

/**
 * Same table on the attached DB alias `guru_aicache` (single SQLite connection — avoids opening
 * `neet_ai_cache.db` twice, which causes SQLITE_BUSY / "database is locked" with expo-sqlite).
 */
export const CREATE_AI_CACHE_ATTACHED = `
CREATE TABLE IF NOT EXISTS guru_aicache.ai_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL
    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),
  content_json TEXT NOT NULL,
  model_used TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_flagged INTEGER NOT NULL DEFAULT 0,
  UNIQUE(topic_id, content_type)
)`;

export const CREATE_INDEX_AI_CACHE_ATTACHED =
  'CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON guru_aicache.ai_cache(topic_id, content_type)';

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
  guru_frequency TEXT NOT NULL DEFAULT 'normal',
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
  , use_nano INTEGER NOT NULL DEFAULT 1
  , quick_start_streak INTEGER NOT NULL DEFAULT 0
  , groq_api_key TEXT NOT NULL DEFAULT ''
  , gemini_key TEXT NOT NULL DEFAULT ''
  , huggingface_token TEXT NOT NULL DEFAULT ''
  , huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'
  , transcription_provider TEXT NOT NULL DEFAULT 'auto'
  , study_resource_mode TEXT NOT NULL DEFAULT 'hybrid'
  , subject_load_overrides_json TEXT NOT NULL DEFAULT '{}'
  , backup_directory_uri TEXT
  , pomodoro_enabled INTEGER NOT NULL DEFAULT 1
  , pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20
  , cloudflare_account_id TEXT NOT NULL DEFAULT ''
  , cloudflare_api_token TEXT NOT NULL DEFAULT ''
  , fal_api_key TEXT NOT NULL DEFAULT ''
  , brave_search_api_key TEXT NOT NULL DEFAULT ''
  , google_custom_search_api_key TEXT NOT NULL DEFAULT ''
  , qwen_connected INTEGER NOT NULL DEFAULT 0
  , guru_chat_default_model TEXT NOT NULL DEFAULT 'auto'
  , guru_memory_notes TEXT NOT NULL DEFAULT ''
  , image_generation_model TEXT NOT NULL DEFAULT 'auto'
  , exam_type TEXT NOT NULL DEFAULT 'INICET'
  , prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1
  , github_models_pat TEXT NOT NULL DEFAULT ''
  , kilo_api_key TEXT NOT NULL DEFAULT ''
  , deepseek_key TEXT NOT NULL DEFAULT ''
  , agentrouter_key TEXT NOT NULL DEFAULT ''
  , provider_order TEXT NOT NULL DEFAULT '[]'
  , deepgram_api_key TEXT NOT NULL DEFAULT ''
  , api_validation_json TEXT NOT NULL DEFAULT '{}'
  , chatgpt_connected INTEGER NOT NULL DEFAULT 0
  , chatgpt_accounts_json TEXT NOT NULL DEFAULT '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}'
  , auto_backup_frequency TEXT NOT NULL DEFAULT 'off'
  , last_auto_backup_at TEXT
  , github_copilot_connected INTEGER NOT NULL DEFAULT 0
  , github_copilot_preferred_model TEXT NOT NULL DEFAULT ''
  , gitlab_duo_connected INTEGER NOT NULL DEFAULT 0
  , gitlab_oauth_client_id TEXT NOT NULL DEFAULT ''
  , gitlab_duo_preferred_model TEXT NOT NULL DEFAULT ''
  , poe_connected INTEGER NOT NULL DEFAULT 0
  , gdrive_web_client_id TEXT NOT NULL DEFAULT ''
  , gdrive_connected INTEGER NOT NULL DEFAULT 0
  , gdrive_email TEXT NOT NULL DEFAULT ''
  , gdrive_last_sync_at TEXT
  , last_backup_device_id TEXT NOT NULL DEFAULT ''
  , dbmci_class_start_date TEXT
  , btr_start_date TEXT
  , home_novelty_cooldown_hours INTEGER NOT NULL DEFAULT 6
  , disabled_providers TEXT NOT NULL DEFAULT '[]'
  , jina_api_key TEXT NOT NULL DEFAULT ''
  , auto_repair_legacy_notes_enabled INTEGER NOT NULL DEFAULT 0
  , scan_orphaned_transcripts_enabled INTEGER NOT NULL DEFAULT 0
)`;

export const CREATE_GURU_CHAT_SESSION_MEMORY = `
CREATE TABLE IF NOT EXISTS guru_chat_session_memory (
  thread_id INTEGER PRIMARY KEY,
  topic_name TEXT NOT NULL,
  summary_text TEXT NOT NULL DEFAULT '',
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  messages_at_last_summary INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(thread_id) REFERENCES guru_chat_threads(id) ON DELETE CASCADE
)`;

export const CREATE_GURU_CHAT_THREADS = `
CREATE TABLE IF NOT EXISTS guru_chat_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_name TEXT NOT NULL,
  syllabus_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_message_at INTEGER NOT NULL,
  last_message_preview TEXT NOT NULL DEFAULT ''
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
    CHECK(transcription_status IN ('pending','recording','transcribing','completed','failed','no_audio','dismissed')),
  transcription_error TEXT,
  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL,
  note_enhancement_status TEXT DEFAULT 'pending'
    CHECK(note_enhancement_status IN ('pending','completed','failed')),
  pipeline_metrics_json TEXT
)`;

export const CREATE_CHAT_HISTORY = `
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER REFERENCES guru_chat_threads(id) ON DELETE CASCADE,
  topic_name TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  sources_json TEXT,
  model_used TEXT
)`;

export const CREATE_GENERATED_STUDY_IMAGES = `
CREATE TABLE IF NOT EXISTS generated_study_images (
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

export const CREATE_DAILY_AGENDA = `
CREATE TABLE IF NOT EXISTS daily_agenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  source TEXT DEFAULT 'guru',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export const CREATE_PLAN_EVENTS = `
CREATE TABLE IF NOT EXISTS plan_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`;

export const CREATE_TOPIC_SUGGESTIONS = `
CREATE TABLE IF NOT EXISTS topic_suggestions (
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
)`;

export const CREATE_QUESTION_BANK = `
CREATE TABLE IF NOT EXISTS question_bank (
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
)`;

export const CREATE_LECTURE_SCHEDULE_PROGRESS = `
CREATE TABLE IF NOT EXISTS lecture_schedule_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  lecture_index INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  UNIQUE(batch_id, lecture_index)
)`;

// ── Mind Maps ─────────────────────────────────────────────────────

export const CREATE_MIND_MAPS = `
CREATE TABLE IF NOT EXISTS mind_maps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  viewport_json TEXT NOT NULL DEFAULT '{"x":0,"y":0,"scale":1}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

export const CREATE_MIND_MAP_NODES = `
CREATE TABLE IF NOT EXISTS mind_map_nodes (
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
)`;

export const CREATE_MIND_MAP_EDGES = `
CREATE TABLE IF NOT EXISTS mind_map_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,
  source_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,
  label TEXT,
  created_at INTEGER NOT NULL
)`;

// ── Performance Indexes ───────────────────────────────────────────
export const DB_INDEXES = [
  // Spaced repetition lookups (HomeScreen agenda)
  `CREATE INDEX IF NOT EXISTS idx_tp_status_fsrs_due ON topic_progress(status, fsrs_due, confidence)`,
  `CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)`,
  // Lecture notes chronological listing
  `CREATE INDEX IF NOT EXISTS idx_lecture_notes_created ON lecture_notes(created_at DESC)`,
  // Lecture notes by subject for stats
  `CREATE INDEX IF NOT EXISTS idx_lecture_notes_subject ON lecture_notes(subject_id)`,
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
  // Daily agenda lookups
  `CREATE INDEX IF NOT EXISTS idx_daily_agenda_date ON daily_agenda(date)`,
  // Plan events lookup by date
  `CREATE INDEX IF NOT EXISTS idx_plan_events_date ON plan_events(date)`,
  `CREATE INDEX IF NOT EXISTS idx_topic_suggestions_status ON topic_suggestions(status, subject_id, last_detected_at DESC)`,
  // Lecture learned topics for quick lookup
  `CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_lecture ON lecture_learned_topics(lecture_note_id)`,
  `CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_topic ON lecture_learned_topics(topic_id)`,
  // Recording cleanup index (find old recordings)
  `CREATE INDEX IF NOT EXISTS idx_lecture_notes_created_at ON lecture_notes(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_generated_study_images_context ON generated_study_images(context_type, context_key, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_generated_study_images_topic ON generated_study_images(topic_name, context_type, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_last_message ON guru_chat_threads(last_message_at DESC, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_topic ON guru_chat_threads(topic_name, syllabus_topic_id, last_message_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_history_thread ON chat_history(thread_id, timestamp ASC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)`,
  // Question bank
  `CREATE INDEX IF NOT EXISTS idx_qb_subject ON question_bank(subject_name)`,
  `CREATE INDEX IF NOT EXISTS idx_qb_topic ON question_bank(topic_id)`,
  `CREATE INDEX IF NOT EXISTS idx_qb_review ON question_bank(next_review_at, is_mastered)`,
  `CREATE INDEX IF NOT EXISTS idx_qb_bookmarked ON question_bank(is_bookmarked)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_dedup ON question_bank(question)`,
  // Mind maps
  `CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_map ON mind_map_nodes(map_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mind_map_edges_map ON mind_map_edges(map_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mind_map_edges_source ON mind_map_edges(source_node_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mind_map_edges_target ON mind_map_edges(target_node_id)`,
];

export const CREATE_CONTENT_FACT_CHECKS = `
CREATE TABLE IF NOT EXISTS content_fact_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending'
    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),
  contradictions_json TEXT,
  checked_at INTEGER NOT NULL,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`;

export const CREATE_USER_CONTENT_FLAGS = `
CREATE TABLE IF NOT EXISTS user_content_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  user_note TEXT,
  flag_reason TEXT NOT NULL
    CHECK(flag_reason IN ('incorrect_fact', 'outdated_info', 'wrong_dosage', 'missing_concept', 'other')),
  flagged_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolved_at INTEGER,
  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE
)`;

export const ALL_SCHEMAS = [
  CREATE_SUBJECTS,
  CREATE_TOPICS,
  CREATE_TOPIC_PROGRESS,
  CREATE_SESSIONS,
  CREATE_LECTURE_NOTES,
  CREATE_DAILY_LOG,
  CREATE_USER_PROFILE,
  CREATE_BRAIN_DUMPS,
  CREATE_EXTERNAL_APP_LOGS,
  CREATE_OFFLINE_AI_QUEUE,
  CREATE_GURU_CHAT_THREADS,
  CREATE_CHAT_HISTORY,
  CREATE_GURU_CHAT_SESSION_MEMORY,
  CREATE_GENERATED_STUDY_IMAGES,
  CREATE_DAILY_AGENDA,
  CREATE_PLAN_EVENTS,
  CREATE_TOPIC_SUGGESTIONS,
  CREATE_LECTURE_LEARNED_TOPICS,
  CREATE_AI_CACHE_STANDALONE,
  CREATE_QUESTION_BANK,
  CREATE_LECTURE_SCHEDULE_PROGRESS,
  CREATE_MIND_MAPS,
  CREATE_MIND_MAP_NODES,
  CREATE_MIND_MAP_EDGES,
  CREATE_CONTENT_FACT_CHECKS,
  CREATE_USER_CONTENT_FLAGS,
];
