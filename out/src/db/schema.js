'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ALL_SCHEMAS =
  exports.CREATE_USER_CONTENT_FLAGS =
  exports.CREATE_CONTENT_FACT_CHECKS =
  exports.DB_INDEXES =
  exports.CREATE_MIND_MAP_EDGES =
  exports.CREATE_MIND_MAP_NODES =
  exports.CREATE_MIND_MAPS =
  exports.CREATE_LECTURE_SCHEDULE_PROGRESS =
  exports.CREATE_QUESTION_BANK =
  exports.CREATE_TOPIC_SUGGESTIONS =
  exports.CREATE_PLAN_EVENTS =
  exports.CREATE_DAILY_AGENDA =
  exports.CREATE_OFFLINE_AI_QUEUE =
  exports.CREATE_GENERATED_STUDY_IMAGES =
  exports.CREATE_CHAT_HISTORY =
  exports.CREATE_EXTERNAL_APP_LOGS =
  exports.CREATE_BRAIN_DUMPS =
  exports.CREATE_GURU_CHAT_THREADS =
  exports.CREATE_GURU_CHAT_SESSION_MEMORY =
  exports.CREATE_USER_PROFILE =
  exports.CREATE_INDEX_AI_CACHE_ATTACHED =
  exports.CREATE_AI_CACHE_ATTACHED =
  exports.CREATE_AI_CACHE_STANDALONE =
  exports.CREATE_DAILY_LOG =
  exports.CREATE_LECTURE_LEARNED_TOPICS =
  exports.CREATE_LECTURE_NOTES =
  exports.CREATE_SESSIONS =
  exports.CREATE_TOPIC_PROGRESS =
  exports.CREATE_TOPICS =
  exports.CREATE_SUBJECTS =
    void 0;
var appConfig_1 = require('../config/appConfig');
exports.CREATE_SUBJECTS =
  '\nCREATE TABLE IF NOT EXISTS subjects (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  short_code TEXT NOT NULL,\n  color_hex TEXT NOT NULL,\n  inicet_weight INTEGER NOT NULL,\n  neet_weight INTEGER NOT NULL,\n  display_order INTEGER NOT NULL\n)';
exports.CREATE_TOPICS =
  '\nCREATE TABLE IF NOT EXISTS topics (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,\n  parent_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  name TEXT NOT NULL,\n  estimated_minutes INTEGER DEFAULT 35,\n  inicet_priority INTEGER DEFAULT 5,\n  embedding BLOB,\n  UNIQUE(subject_id, name)\n)';
exports.CREATE_TOPIC_PROGRESS =
  "\nCREATE TABLE IF NOT EXISTS topic_progress (\n  topic_id INTEGER PRIMARY KEY REFERENCES topics(id) ON DELETE CASCADE,\n  status TEXT NOT NULL DEFAULT 'unseen'\n    CHECK(status IN ('unseen','seen','reviewed','mastered')),\n  confidence INTEGER NOT NULL DEFAULT 0,\n  last_studied_at INTEGER,\n  times_studied INTEGER NOT NULL DEFAULT 0,\n  xp_earned INTEGER NOT NULL DEFAULT 0,\n  next_review_date TEXT,\n  user_notes TEXT NOT NULL DEFAULT '',\n  wrong_count INTEGER NOT NULL DEFAULT 0,\n  is_nemesis INTEGER NOT NULL DEFAULT 0\n  , fsrs_due TEXT\n  , fsrs_stability REAL DEFAULT 0\n  , fsrs_difficulty REAL DEFAULT 0\n  , fsrs_elapsed_days INTEGER DEFAULT 0\n  , fsrs_scheduled_days INTEGER DEFAULT 0\n  , fsrs_reps INTEGER DEFAULT 0\n  , fsrs_lapses INTEGER DEFAULT 0\n  , fsrs_state INTEGER DEFAULT 0\n  , fsrs_last_review TEXT\n\n)";
exports.CREATE_SESSIONS =
  "\nCREATE TABLE IF NOT EXISTS sessions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  started_at INTEGER NOT NULL,\n  ended_at INTEGER,\n  planned_topics TEXT NOT NULL DEFAULT '[]',\n  completed_topics TEXT NOT NULL DEFAULT '[]',\n  total_xp_earned INTEGER NOT NULL DEFAULT 0,\n  duration_minutes INTEGER,\n  mood TEXT,\n  mode TEXT NOT NULL DEFAULT 'normal',\n  notes TEXT\n)";
exports.CREATE_LECTURE_NOTES =
  '\nCREATE TABLE IF NOT EXISTS lecture_notes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  subject_id INTEGER REFERENCES subjects(id),\n  note TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  transcript TEXT,\n  summary TEXT,\n  topics_json TEXT,\n  app_name TEXT,\n  duration_minutes INTEGER,\n  confidence INTEGER DEFAULT 2,\n  embedding BLOB,\n  -- New fields for better tracking\n  recording_path TEXT,\n  recording_duration_seconds INTEGER,\n  transcription_confidence REAL,\n  processing_metrics_json TEXT,\n  retry_count INTEGER DEFAULT 0,\n  last_error TEXT\n)';
exports.CREATE_LECTURE_LEARNED_TOPICS =
  "\nCREATE TABLE IF NOT EXISTS lecture_learned_topics (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  lecture_note_id INTEGER NOT NULL REFERENCES lecture_notes(id) ON DELETE CASCADE,\n  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,\n  confidence_at_time INTEGER NOT NULL DEFAULT 2,\n  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),\n  UNIQUE(lecture_note_id, topic_id)\n)";
exports.CREATE_DAILY_LOG =
  '\nCREATE TABLE IF NOT EXISTS daily_log (\n  date TEXT PRIMARY KEY,\n  checked_in INTEGER NOT NULL DEFAULT 0,\n  mood TEXT,\n  total_minutes INTEGER NOT NULL DEFAULT 0,\n  xp_earned INTEGER NOT NULL DEFAULT 0,\n  session_count INTEGER NOT NULL DEFAULT 0\n)';
/** Lives in `neet_ai_cache.db` (excluded from Android auto-backup). No FK — topic deletes are handled in app code. */
exports.CREATE_AI_CACHE_STANDALONE =
  "\nCREATE TABLE IF NOT EXISTS ai_cache (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL\n    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),\n  content_json TEXT NOT NULL,\n  model_used TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  is_flagged INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(topic_id, content_type)\n)";
/**
 * Same table on the attached DB alias `guru_aicache` (single SQLite connection — avoids opening
 * `neet_ai_cache.db` twice, which causes SQLITE_BUSY / "database is locked" with expo-sqlite).
 */
exports.CREATE_AI_CACHE_ATTACHED =
  "\nCREATE TABLE IF NOT EXISTS guru_aicache.ai_cache (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL\n    CHECK(content_type IN ('keypoints','must_know','quiz','story','mnemonic','teach_back','error_hunt','detective','manual','socratic','flashcards')),\n  content_json TEXT NOT NULL,\n  model_used TEXT NOT NULL,\n  created_at INTEGER NOT NULL,\n  is_flagged INTEGER NOT NULL DEFAULT 0,\n  UNIQUE(topic_id, content_type)\n)";
exports.CREATE_INDEX_AI_CACHE_ATTACHED =
  'CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON guru_aicache.ai_cache(topic_id, content_type)';
exports.CREATE_USER_PROFILE =
  "\nCREATE TABLE IF NOT EXISTS user_profile (\n  id INTEGER PRIMARY KEY DEFAULT 1,\n  display_name TEXT NOT NULL DEFAULT 'Doctor',\n  total_xp INTEGER NOT NULL DEFAULT 0,\n  current_level INTEGER NOT NULL DEFAULT 1,\n  streak_current INTEGER NOT NULL DEFAULT 0,\n  streak_best INTEGER NOT NULL DEFAULT 0,\n  daily_goal_minutes INTEGER NOT NULL DEFAULT 120,\n  inicet_date TEXT NOT NULL DEFAULT '"
    .concat(appConfig_1.DEFAULT_INICET_DATE, "',\n  neet_date TEXT NOT NULL DEFAULT '")
    .concat(
      appConfig_1.DEFAULT_NEET_DATE,
      "',\n  preferred_session_length INTEGER NOT NULL DEFAULT 45,\n  openrouter_api_key TEXT NOT NULL DEFAULT '',\n  openrouter_key TEXT NOT NULL DEFAULT '',\n  notifications_enabled INTEGER NOT NULL DEFAULT 1,\n  last_active_date TEXT,\n  sync_code TEXT,\n  strict_mode_enabled INTEGER NOT NULL DEFAULT 0,\n  streak_shield_available INTEGER NOT NULL DEFAULT 1,\n  body_doubling_enabled INTEGER NOT NULL DEFAULT 1,\n  blocked_content_types TEXT NOT NULL DEFAULT '[]',\n  idle_timeout_minutes INTEGER NOT NULL DEFAULT 2,\n  break_duration_minutes INTEGER NOT NULL DEFAULT 5,\n  notification_hour INTEGER NOT NULL DEFAULT 7,\n  guru_frequency TEXT NOT NULL DEFAULT 'normal',\n  focus_subject_ids TEXT NOT NULL DEFAULT '[]',\n  focus_audio_enabled INTEGER NOT NULL DEFAULT 0,\n  visual_timers_enabled INTEGER NOT NULL DEFAULT 0,\n  face_tracking_enabled INTEGER NOT NULL DEFAULT 0,\n  quiz_correct_count INTEGER NOT NULL DEFAULT 0,\n  last_backup_date TEXT,\n  use_local_model INTEGER NOT NULL DEFAULT 1,\n  local_model_path TEXT\n  , use_local_whisper INTEGER NOT NULL DEFAULT 1\n  , local_whisper_path TEXT\n  , use_nano INTEGER NOT NULL DEFAULT 1\n  , quick_start_streak INTEGER NOT NULL DEFAULT 0\n  , groq_api_key TEXT NOT NULL DEFAULT ''\n  , gemini_key TEXT NOT NULL DEFAULT ''\n  , huggingface_token TEXT NOT NULL DEFAULT ''\n  , huggingface_transcription_model TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'\n  , transcription_provider TEXT NOT NULL DEFAULT 'auto'\n  , study_resource_mode TEXT NOT NULL DEFAULT 'hybrid'\n  , subject_load_overrides_json TEXT NOT NULL DEFAULT '{}'\n  , backup_directory_uri TEXT\n  , pomodoro_enabled INTEGER NOT NULL DEFAULT 1\n  , pomodoro_interval_minutes INTEGER NOT NULL DEFAULT 20\n  , cloudflare_account_id TEXT NOT NULL DEFAULT ''\n  , cloudflare_api_token TEXT NOT NULL DEFAULT ''\n  , fal_api_key TEXT NOT NULL DEFAULT ''\n  , brave_search_api_key TEXT NOT NULL DEFAULT ''\n  , google_custom_search_api_key TEXT NOT NULL DEFAULT ''\n  , qwen_connected INTEGER NOT NULL DEFAULT 0\n  , guru_chat_default_model TEXT NOT NULL DEFAULT 'auto'\n  , guru_memory_notes TEXT NOT NULL DEFAULT ''\n  , image_generation_model TEXT NOT NULL DEFAULT 'auto'\n  , exam_type TEXT NOT NULL DEFAULT 'INICET'\n  , prefer_gemini_structured_json INTEGER NOT NULL DEFAULT 1\n  , github_models_pat TEXT NOT NULL DEFAULT ''\n  , kilo_api_key TEXT NOT NULL DEFAULT ''\n  , deepseek_key TEXT NOT NULL DEFAULT ''\n  , agentrouter_key TEXT NOT NULL DEFAULT ''\n  , provider_order TEXT NOT NULL DEFAULT '[]'\n  , deepgram_api_key TEXT NOT NULL DEFAULT ''\n  , api_validation_json TEXT NOT NULL DEFAULT '{}'\n  , chatgpt_connected INTEGER NOT NULL DEFAULT 0\n  , chatgpt_accounts_json TEXT NOT NULL DEFAULT '{\"primary\":{\"enabled\":true,\"connected\":false},\"secondary\":{\"enabled\":false,\"connected\":false}}'\n  , auto_backup_frequency TEXT NOT NULL DEFAULT 'off'\n  , last_auto_backup_at TEXT\n  , github_copilot_connected INTEGER NOT NULL DEFAULT 0\n  , github_copilot_preferred_model TEXT NOT NULL DEFAULT ''\n  , gitlab_duo_connected INTEGER NOT NULL DEFAULT 0\n  , gitlab_oauth_client_id TEXT NOT NULL DEFAULT ''\n  , gitlab_duo_preferred_model TEXT NOT NULL DEFAULT ''\n  , poe_connected INTEGER NOT NULL DEFAULT 0\n  , gdrive_web_client_id TEXT NOT NULL DEFAULT ''\n  , gdrive_connected INTEGER NOT NULL DEFAULT 0\n  , gdrive_email TEXT NOT NULL DEFAULT ''\n  , gdrive_last_sync_at TEXT\n  , last_backup_device_id TEXT NOT NULL DEFAULT ''\n  , dbmci_class_start_date TEXT\n  , btr_start_date TEXT\n  , home_novelty_cooldown_hours INTEGER NOT NULL DEFAULT 6\n  , disabled_providers TEXT NOT NULL DEFAULT '[]'\n  , jina_api_key TEXT NOT NULL DEFAULT ''\n  , auto_repair_legacy_notes_enabled INTEGER NOT NULL DEFAULT 0\n  , scan_orphaned_transcripts_enabled INTEGER NOT NULL DEFAULT 0\n)",
    );
exports.CREATE_GURU_CHAT_SESSION_MEMORY =
  "\nCREATE TABLE IF NOT EXISTS guru_chat_session_memory (\n  thread_id INTEGER PRIMARY KEY,\n  topic_name TEXT NOT NULL,\n  summary_text TEXT NOT NULL DEFAULT '',\n  state_json TEXT NOT NULL DEFAULT '{}',\n  updated_at INTEGER NOT NULL,\n  messages_at_last_summary INTEGER NOT NULL DEFAULT 0,\n  FOREIGN KEY(thread_id) REFERENCES guru_chat_threads(id) ON DELETE CASCADE\n)";
exports.CREATE_GURU_CHAT_THREADS =
  "\nCREATE TABLE IF NOT EXISTS guru_chat_threads (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_name TEXT NOT NULL,\n  syllabus_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  title TEXT NOT NULL DEFAULT '',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL,\n  last_message_at INTEGER NOT NULL,\n  last_message_preview TEXT NOT NULL DEFAULT ''\n)";
exports.CREATE_BRAIN_DUMPS =
  '\nCREATE TABLE IF NOT EXISTS brain_dumps (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  note TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n)';
exports.CREATE_EXTERNAL_APP_LOGS =
  "\nCREATE TABLE IF NOT EXISTS external_app_logs (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  app_name TEXT NOT NULL,\n  launched_at INTEGER NOT NULL,\n  returned_at INTEGER,\n  duration_minutes REAL,\n  notes TEXT,\n  recording_path TEXT,\n  transcription_status TEXT DEFAULT 'pending'\n    CHECK(transcription_status IN ('pending','recording','transcribing','completed','failed','no_audio','dismissed')),\n  transcription_error TEXT,\n  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL,\n  note_enhancement_status TEXT DEFAULT 'pending'\n    CHECK(note_enhancement_status IN ('pending','completed','failed')),\n  pipeline_metrics_json TEXT\n)";
exports.CREATE_CHAT_HISTORY =
  '\nCREATE TABLE IF NOT EXISTS chat_history (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  thread_id INTEGER REFERENCES guru_chat_threads(id) ON DELETE CASCADE,\n  topic_name TEXT NOT NULL,\n  role TEXT NOT NULL,\n  message TEXT NOT NULL,\n  timestamp INTEGER NOT NULL,\n  sources_json TEXT,\n  model_used TEXT\n)';
exports.CREATE_GENERATED_STUDY_IMAGES =
  "\nCREATE TABLE IF NOT EXISTS generated_study_images (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  context_type TEXT NOT NULL\n    CHECK(context_type IN ('chat','topic_note','lecture_note')),\n  context_key TEXT NOT NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  topic_name TEXT NOT NULL,\n  lecture_note_id INTEGER REFERENCES lecture_notes(id) ON DELETE CASCADE,\n  style TEXT NOT NULL\n    CHECK(style IN ('illustration','chart')),\n  prompt TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  model_used TEXT NOT NULL,\n  mime_type TEXT NOT NULL DEFAULT 'image/png',\n  local_uri TEXT NOT NULL,\n  remote_url TEXT,\n  width INTEGER,\n  height INTEGER,\n  created_at INTEGER NOT NULL\n)";
exports.CREATE_OFFLINE_AI_QUEUE =
  "\nCREATE TABLE IF NOT EXISTS offline_ai_queue (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  request_type TEXT NOT NULL,\n  payload TEXT NOT NULL,\n  status TEXT DEFAULT 'pending'\n    CHECK(status IN ('pending','processing','failed','completed')),\n  attempts INTEGER DEFAULT 0,\n  created_at INTEGER NOT NULL,\n  last_attempt_at INTEGER,\n  error_message TEXT\n)";
exports.CREATE_DAILY_AGENDA =
  "\nCREATE TABLE IF NOT EXISTS daily_agenda (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  date TEXT NOT NULL UNIQUE,\n  plan_json TEXT NOT NULL,\n  source TEXT DEFAULT 'guru',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)";
exports.CREATE_PLAN_EVENTS =
  '\nCREATE TABLE IF NOT EXISTS plan_events (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  date TEXT NOT NULL,\n  event_type TEXT NOT NULL,\n  payload_json TEXT NOT NULL,\n  created_at INTEGER NOT NULL\n)';
exports.CREATE_TOPIC_SUGGESTIONS =
  "\nCREATE TABLE IF NOT EXISTS topic_suggestions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  normalized_name TEXT NOT NULL,\n  source_summary TEXT,\n  mention_count INTEGER NOT NULL DEFAULT 1,\n  status TEXT NOT NULL DEFAULT 'pending'\n    CHECK(status IN ('pending','approved','rejected')),\n  approved_topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  first_detected_at INTEGER NOT NULL,\n  last_detected_at INTEGER NOT NULL,\n  UNIQUE(subject_id, normalized_name)\n)";
exports.CREATE_QUESTION_BANK =
  "\nCREATE TABLE IF NOT EXISTS question_bank (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  question TEXT NOT NULL,\n  options TEXT NOT NULL,\n  correct_index INTEGER NOT NULL,\n  explanation TEXT NOT NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  topic_name TEXT NOT NULL DEFAULT '',\n  subject_name TEXT NOT NULL DEFAULT '',\n  source TEXT NOT NULL DEFAULT 'content_card'\n    CHECK(source IN ('content_card','lecture_quiz','mock_test','live_lecture','manual')),\n  source_id TEXT,\n  image_url TEXT,\n  is_bookmarked INTEGER NOT NULL DEFAULT 0,\n  is_mastered INTEGER NOT NULL DEFAULT 0,\n  times_seen INTEGER NOT NULL DEFAULT 0,\n  times_correct INTEGER NOT NULL DEFAULT 0,\n  last_seen_at INTEGER,\n  next_review_at INTEGER,\n  difficulty REAL NOT NULL DEFAULT 0.5,\n  created_at INTEGER NOT NULL\n)";
exports.CREATE_LECTURE_SCHEDULE_PROGRESS =
  '\nCREATE TABLE IF NOT EXISTS lecture_schedule_progress (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  batch_id TEXT NOT NULL,\n  lecture_index INTEGER NOT NULL,\n  completed_at INTEGER NOT NULL,\n  UNIQUE(batch_id, lecture_index)\n)';
// ── Mind Maps ─────────────────────────────────────────────────────
exports.CREATE_MIND_MAPS =
  '\nCREATE TABLE IF NOT EXISTS mind_maps (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  viewport_json TEXT NOT NULL DEFAULT \'{"x":0,"y":0,"scale":1}\',\n  created_at INTEGER NOT NULL,\n  updated_at INTEGER NOT NULL\n)';
exports.CREATE_MIND_MAP_NODES =
  '\nCREATE TABLE IF NOT EXISTS mind_map_nodes (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,\n  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,\n  label TEXT NOT NULL,\n  x REAL NOT NULL DEFAULT 0,\n  y REAL NOT NULL DEFAULT 0,\n  color TEXT,\n  is_center INTEGER NOT NULL DEFAULT 0,\n  ai_generated INTEGER NOT NULL DEFAULT 0,\n  created_at INTEGER NOT NULL\n)';
exports.CREATE_MIND_MAP_EDGES =
  '\nCREATE TABLE IF NOT EXISTS mind_map_edges (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  map_id INTEGER NOT NULL REFERENCES mind_maps(id) ON DELETE CASCADE,\n  source_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,\n  target_node_id INTEGER NOT NULL REFERENCES mind_map_nodes(id) ON DELETE CASCADE,\n  label TEXT,\n  created_at INTEGER NOT NULL\n)';
// ── Performance Indexes ───────────────────────────────────────────
exports.DB_INDEXES = [
  // Spaced repetition lookups (HomeScreen agenda)
  'CREATE INDEX IF NOT EXISTS idx_tp_status_fsrs_due ON topic_progress(status, fsrs_due, confidence)',
  'CREATE INDEX IF NOT EXISTS idx_ai_cache_lookup ON ai_cache(topic_id, content_type)',
  // Lecture notes chronological listing
  'CREATE INDEX IF NOT EXISTS idx_lecture_notes_created ON lecture_notes(created_at DESC)',
  // Lecture notes by subject for stats
  'CREATE INDEX IF NOT EXISTS idx_lecture_notes_subject ON lecture_notes(subject_id)',
  // External app session "active" check (returned_at IS NULL)
  'CREATE INDEX IF NOT EXISTS idx_ext_logs_active ON external_app_logs(returned_at)',
  // Retry scanner for transcription recovery jobs
  'CREATE INDEX IF NOT EXISTS idx_ext_logs_retry ON external_app_logs(transcription_status, returned_at)',
  // Sessions by date for StatsScreen
  'CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at DESC)',
  // Queue processing order for offline AI jobs
  'CREATE INDEX IF NOT EXISTS idx_offline_ai_queue_status ON offline_ai_queue(status, attempts, created_at)',
  // Topic tree traversal (parent lookups)
  'CREATE INDEX IF NOT EXISTS idx_topics_parent ON topics(parent_topic_id)',
  // Topic-to-subject join
  'CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id)',
  // Daily agenda lookups
  'CREATE INDEX IF NOT EXISTS idx_daily_agenda_date ON daily_agenda(date)',
  // Plan events lookup by date
  'CREATE INDEX IF NOT EXISTS idx_plan_events_date ON plan_events(date)',
  'CREATE INDEX IF NOT EXISTS idx_topic_suggestions_status ON topic_suggestions(status, subject_id, last_detected_at DESC)',
  // Lecture learned topics for quick lookup
  'CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_lecture ON lecture_learned_topics(lecture_note_id)',
  'CREATE INDEX IF NOT EXISTS idx_lecture_learned_topics_topic ON lecture_learned_topics(topic_id)',
  // Recording cleanup index (find old recordings)
  'CREATE INDEX IF NOT EXISTS idx_lecture_notes_created_at ON lecture_notes(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_generated_study_images_context ON generated_study_images(context_type, context_key, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_generated_study_images_topic ON generated_study_images(topic_name, context_type, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_last_message ON guru_chat_threads(last_message_at DESC, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_guru_chat_threads_topic ON guru_chat_threads(topic_name, syllabus_topic_id, last_message_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_chat_history_thread ON chat_history(thread_id, timestamp ASC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_guru_chat_session_memory_thread ON guru_chat_session_memory(thread_id)',
  // Question bank
  'CREATE INDEX IF NOT EXISTS idx_qb_subject ON question_bank(subject_name)',
  'CREATE INDEX IF NOT EXISTS idx_qb_topic ON question_bank(topic_id)',
  'CREATE INDEX IF NOT EXISTS idx_qb_review ON question_bank(next_review_at, is_mastered)',
  'CREATE INDEX IF NOT EXISTS idx_qb_bookmarked ON question_bank(is_bookmarked)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_dedup ON question_bank(question)',
  // Mind maps
  'CREATE INDEX IF NOT EXISTS idx_mind_map_nodes_map ON mind_map_nodes(map_id)',
  'CREATE INDEX IF NOT EXISTS idx_mind_map_edges_map ON mind_map_edges(map_id)',
  'CREATE INDEX IF NOT EXISTS idx_mind_map_edges_source ON mind_map_edges(source_node_id)',
  'CREATE INDEX IF NOT EXISTS idx_mind_map_edges_target ON mind_map_edges(target_node_id)',
];
exports.CREATE_CONTENT_FACT_CHECKS =
  "\nCREATE TABLE IF NOT EXISTS content_fact_checks (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  check_status TEXT NOT NULL DEFAULT 'pending'\n    CHECK(check_status IN ('pending', 'passed', 'failed', 'inconclusive')),\n  contradictions_json TEXT,\n  checked_at INTEGER NOT NULL,\n  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE\n)";
exports.CREATE_USER_CONTENT_FLAGS =
  "\nCREATE TABLE IF NOT EXISTS user_content_flags (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  topic_id INTEGER NOT NULL,\n  content_type TEXT NOT NULL,\n  user_note TEXT,\n  flag_reason TEXT NOT NULL\n    CHECK(flag_reason IN ('incorrect_fact', 'outdated_info', 'wrong_dosage', 'missing_concept', 'other')),\n  flagged_at INTEGER NOT NULL,\n  resolved INTEGER NOT NULL DEFAULT 0,\n  resolved_at INTEGER,\n  FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE CASCADE\n)";
exports.ALL_SCHEMAS = [
  exports.CREATE_SUBJECTS,
  exports.CREATE_TOPICS,
  exports.CREATE_TOPIC_PROGRESS,
  exports.CREATE_SESSIONS,
  exports.CREATE_LECTURE_NOTES,
  exports.CREATE_DAILY_LOG,
  exports.CREATE_USER_PROFILE,
  exports.CREATE_BRAIN_DUMPS,
  exports.CREATE_EXTERNAL_APP_LOGS,
  exports.CREATE_OFFLINE_AI_QUEUE,
  exports.CREATE_GURU_CHAT_THREADS,
  exports.CREATE_CHAT_HISTORY,
  exports.CREATE_GURU_CHAT_SESSION_MEMORY,
  exports.CREATE_GENERATED_STUDY_IMAGES,
  exports.CREATE_DAILY_AGENDA,
  exports.CREATE_PLAN_EVENTS,
  exports.CREATE_TOPIC_SUGGESTIONS,
  exports.CREATE_LECTURE_LEARNED_TOPICS,
  exports.CREATE_AI_CACHE_STANDALONE,
  exports.CREATE_QUESTION_BANK,
  exports.CREATE_LECTURE_SCHEDULE_PROGRESS,
  exports.CREATE_MIND_MAPS,
  exports.CREATE_MIND_MAP_NODES,
  exports.CREATE_MIND_MAP_EDGES,
  exports.CREATE_CONTENT_FACT_CHECKS,
  exports.CREATE_USER_CONTENT_FLAGS,
];
