CREATE TABLE `ai_cache` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`content_type` text NOT NULL,
	`content_json` text NOT NULL,
	`model_used` text NOT NULL,
	`created_at` integer NOT NULL,
	`is_flagged` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_cache_lookup` ON `ai_cache` (`topic_id`,`content_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_cache_unique` ON `ai_cache` (`topic_id`,`content_type`);--> statement-breakpoint
CREATE TABLE `brain_dumps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer,
	`topic_name` text NOT NULL,
	`role` text NOT NULL,
	`message` text NOT NULL,
	`timestamp` integer NOT NULL,
	`sources_json` text,
	`model_used` text,
	FOREIGN KEY (`thread_id`) REFERENCES `guru_chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_history_thread` ON `chat_history` (`thread_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `content_fact_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`content_type` text NOT NULL,
	`check_status` text DEFAULT 'pending' NOT NULL,
	`contradictions_json` text,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_agenda` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`plan_json` text NOT NULL,
	`source` text DEFAULT 'guru',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_agenda_date_unique` ON `daily_agenda` (`date`);--> statement-breakpoint
CREATE INDEX `idx_daily_agenda_date` ON `daily_agenda` (`date`);--> statement-breakpoint
CREATE TABLE `daily_log` (
	`date` text PRIMARY KEY NOT NULL,
	`checked_in` integer DEFAULT 0 NOT NULL,
	`mood` text,
	`total_minutes` integer DEFAULT 0 NOT NULL,
	`xp_earned` integer DEFAULT 0 NOT NULL,
	`session_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `external_app_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_name` text NOT NULL,
	`launched_at` integer NOT NULL,
	`returned_at` integer,
	`duration_minutes` real,
	`notes` text,
	`recording_path` text,
	`transcription_status` text DEFAULT 'pending',
	`transcription_error` text,
	`lecture_note_id` integer,
	`note_enhancement_status` text DEFAULT 'pending',
	`pipeline_metrics_json` text,
	FOREIGN KEY (`lecture_note_id`) REFERENCES `lecture_notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_ext_logs_active` ON `external_app_logs` (`returned_at`);--> statement-breakpoint
CREATE INDEX `idx_ext_logs_retry` ON `external_app_logs` (`transcription_status`,`returned_at`);--> statement-breakpoint
CREATE TABLE `generated_study_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`context_type` text NOT NULL,
	`context_key` text NOT NULL,
	`topic_id` integer,
	`topic_name` text NOT NULL,
	`lecture_note_id` integer,
	`style` text NOT NULL,
	`prompt` text NOT NULL,
	`provider` text NOT NULL,
	`model_used` text NOT NULL,
	`mime_type` text DEFAULT 'image/png' NOT NULL,
	`local_uri` text NOT NULL,
	`remote_url` text,
	`width` integer,
	`height` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lecture_note_id`) REFERENCES `lecture_notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_generated_study_images_context` ON `generated_study_images` (`context_type`,`context_key`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_generated_study_images_topic` ON `generated_study_images` (`topic_name`,`context_type`,`created_at`);--> statement-breakpoint
CREATE TABLE `guru_chat_session_memory` (
	`thread_id` integer PRIMARY KEY NOT NULL,
	`topic_name` text NOT NULL,
	`summary_text` text DEFAULT '' NOT NULL,
	`state_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL,
	`messages_at_last_summary` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `guru_chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_guru_chat_session_memory_thread` ON `guru_chat_session_memory` (`thread_id`);--> statement-breakpoint
CREATE TABLE `guru_chat_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_name` text NOT NULL,
	`syllabus_topic_id` integer,
	`title` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_message_at` integer NOT NULL,
	`last_message_preview` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`syllabus_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_guru_chat_threads_last_message` ON `guru_chat_threads` (`last_message_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_guru_chat_threads_topic` ON `guru_chat_threads` (`topic_name`,`syllabus_topic_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `lecture_learned_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lecture_note_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	`confidence_at_time` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lecture_note_id`) REFERENCES `lecture_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_lecture_learned_topics_lecture` ON `lecture_learned_topics` (`lecture_note_id`);--> statement-breakpoint
CREATE INDEX `idx_lecture_learned_topics_topic` ON `lecture_learned_topics` (`topic_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lecture_learned_topics_unique` ON `lecture_learned_topics` (`lecture_note_id`,`topic_id`);--> statement-breakpoint
CREATE TABLE `lecture_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	`transcript` text,
	`summary` text,
	`topics_json` text,
	`app_name` text,
	`duration_minutes` integer,
	`confidence` integer DEFAULT 2,
	`embedding` blob,
	`recording_path` text,
	`recording_duration_seconds` integer,
	`transcription_confidence` real,
	`processing_metrics_json` text,
	`retry_count` integer DEFAULT 0,
	`last_error` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_lecture_notes_created` ON `lecture_notes` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_lecture_notes_subject` ON `lecture_notes` (`subject_id`);--> statement-breakpoint
CREATE TABLE `lecture_schedule_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`lecture_index` integer NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_lecture_schedule_progress_unique` ON `lecture_schedule_progress` (`batch_id`,`lecture_index`);--> statement-breakpoint
CREATE TABLE `migration_history` (
	`version` integer PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `mind_map_edges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`source_node_id` integer NOT NULL,
	`target_node_id` integer NOT NULL,
	`label` text,
	`is_cross_link` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `mind_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_mind_map_edges_map` ON `mind_map_edges` (`map_id`);--> statement-breakpoint
CREATE INDEX `idx_mind_map_edges_source` ON `mind_map_edges` (`source_node_id`);--> statement-breakpoint
CREATE INDEX `idx_mind_map_edges_target` ON `mind_map_edges` (`target_node_id`);--> statement-breakpoint
CREATE TABLE `mind_map_node_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`node_id` integer NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `mind_map_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mind_map_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`topic_id` integer,
	`label` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`y` real DEFAULT 0 NOT NULL,
	`color` text,
	`is_center` integer DEFAULT 0 NOT NULL,
	`ai_generated` integer DEFAULT 0 NOT NULL,
	`explanation` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `mind_maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_mind_map_nodes_map` ON `mind_map_nodes` (`map_id`);--> statement-breakpoint
CREATE TABLE `mind_maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`subject_id` integer,
	`topic_id` integer,
	`viewport_json` text DEFAULT '{"x":0,"y":0,"scale":1}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `offline_ai_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_type` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending',
	`attempts` integer DEFAULT 0,
	`created_at` integer NOT NULL,
	`last_attempt_at` integer,
	`error_message` text
);
--> statement-breakpoint
CREATE INDEX `idx_offline_ai_queue_status` ON `offline_ai_queue` (`status`,`attempts`,`created_at`);--> statement-breakpoint
CREATE TABLE `plan_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_events_date` ON `plan_events` (`date`);--> statement-breakpoint
CREATE TABLE `question_bank` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`correct_index` integer NOT NULL,
	`explanation` text NOT NULL,
	`topic_id` integer,
	`topic_name` text DEFAULT '' NOT NULL,
	`subject_name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'content_card' NOT NULL,
	`source_id` text,
	`image_url` text,
	`is_bookmarked` integer DEFAULT 0 NOT NULL,
	`is_mastered` integer DEFAULT 0 NOT NULL,
	`times_seen` integer DEFAULT 0 NOT NULL,
	`times_correct` integer DEFAULT 0 NOT NULL,
	`last_seen_at` integer,
	`next_review_at` integer,
	`difficulty` real DEFAULT 0.5 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_qb_dedup` ON `question_bank` (`question`);--> statement-breakpoint
CREATE INDEX `idx_qb_subject` ON `question_bank` (`subject_name`);--> statement-breakpoint
CREATE INDEX `idx_qb_topic` ON `question_bank` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_qb_review` ON `question_bank` (`next_review_at`,`is_mastered`);--> statement-breakpoint
CREATE INDEX `idx_qb_bookmarked` ON `question_bank` (`is_bookmarked`);--> statement-breakpoint
CREATE TABLE `semantic_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer NOT NULL,
	`target_type` text NOT NULL,
	`target_id` integer NOT NULL,
	`relationship` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_semantic_links_unique` ON `semantic_links` (`source_type`,`source_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`planned_topics` text DEFAULT '[]' NOT NULL,
	`completed_topics` text DEFAULT '[]' NOT NULL,
	`total_xp_earned` integer DEFAULT 0 NOT NULL,
	`duration_minutes` integer,
	`cards_created` integer DEFAULT 0,
	`nodes_created` integer DEFAULT 0,
	`mood` text,
	`mode` text DEFAULT 'normal' NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_started_at` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_code` text NOT NULL,
	`color_hex` text NOT NULL,
	`inicet_weight` integer NOT NULL,
	`neet_weight` integer NOT NULL,
	`display_order` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topic_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `topic_progress` (
	`topic_id` integer PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unseen' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`last_studied_at` integer,
	`times_studied` integer DEFAULT 0 NOT NULL,
	`xp_earned` integer DEFAULT 0 NOT NULL,
	`next_review_date` text,
	`user_notes` text DEFAULT '' NOT NULL,
	`wrong_count` integer DEFAULT 0 NOT NULL,
	`is_nemesis` integer DEFAULT 0 NOT NULL,
	`fsrs_due` text,
	`fsrs_stability` real DEFAULT 0,
	`fsrs_difficulty` real DEFAULT 0,
	`fsrs_elapsed_days` integer DEFAULT 0,
	`fsrs_scheduled_days` integer DEFAULT 0,
	`fsrs_reps` integer DEFAULT 0,
	`fsrs_lapses` integer DEFAULT 0,
	`fsrs_state` integer DEFAULT 0,
	`fsrs_last_review` text,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_tp_status_fsrs_due` ON `topic_progress` (`status`,`fsrs_due`,`confidence`);--> statement-breakpoint
CREATE TABLE `topic_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`source_summary` text,
	`mention_count` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_topic_id` integer,
	`first_detected_at` integer NOT NULL,
	`last_detected_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_topic_suggestions_status` ON `topic_suggestions` (`status`,`subject_id`,`last_detected_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_topic_suggestions_unique` ON `topic_suggestions` (`subject_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`parent_topic_id` integer,
	`name` text NOT NULL,
	`estimated_minutes` integer DEFAULT 35,
	`inicet_priority` integer DEFAULT 5,
	`embedding` blob,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_topics_parent` ON `topics` (`parent_topic_id`);--> statement-breakpoint
CREATE INDEX `idx_topics_subject` ON `topics` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_topics_subject_name` ON `topics` (`subject_id`,`name`);--> statement-breakpoint
CREATE TABLE `user_content_flags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`content_type` text NOT NULL,
	`user_note` text,
	`flag_reason` text NOT NULL,
	`flagged_at` integer NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`display_name` text DEFAULT 'Doctor' NOT NULL,
	`total_xp` integer DEFAULT 0 NOT NULL,
	`current_level` integer DEFAULT 1 NOT NULL,
	`streak_current` integer DEFAULT 0 NOT NULL,
	`streak_best` integer DEFAULT 0 NOT NULL,
	`daily_goal_minutes` integer DEFAULT 120 NOT NULL,
	`inicet_date` text DEFAULT '2026-05-17' NOT NULL,
	`neet_date` text DEFAULT '2026-08-30' NOT NULL,
	`preferred_session_length` integer DEFAULT 45 NOT NULL,
	`openrouter_api_key` text DEFAULT '' NOT NULL,
	`openrouter_key` text DEFAULT '' NOT NULL,
	`notifications_enabled` integer DEFAULT true NOT NULL,
	`last_active_date` text,
	`sync_code` text,
	`strict_mode_enabled` integer DEFAULT false NOT NULL,
	`streak_shield_available` integer DEFAULT true NOT NULL,
	`body_doubling_enabled` integer DEFAULT true NOT NULL,
	`blocked_content_types` text DEFAULT '[]' NOT NULL,
	`idle_timeout_minutes` integer DEFAULT 2 NOT NULL,
	`break_duration_minutes` integer DEFAULT 5 NOT NULL,
	`notification_hour` integer DEFAULT 7 NOT NULL,
	`guru_frequency` text DEFAULT 'normal' NOT NULL,
	`focus_subject_ids` text DEFAULT '[]' NOT NULL,
	`focus_audio_enabled` integer DEFAULT false NOT NULL,
	`visual_timers_enabled` integer DEFAULT false NOT NULL,
	`face_tracking_enabled` integer DEFAULT false NOT NULL,
	`quiz_correct_count` integer DEFAULT 0 NOT NULL,
	`last_backup_date` text,
	`use_local_model` integer DEFAULT true NOT NULL,
	`local_model_path` text,
	`use_local_whisper` integer DEFAULT true NOT NULL,
	`local_whisper_path` text,
	`quick_start_streak` integer DEFAULT 0 NOT NULL,
	`groq_api_key` text DEFAULT '' NOT NULL,
	`gemini_key` text DEFAULT '' NOT NULL,
	`huggingface_token` text DEFAULT '' NOT NULL,
	`huggingface_transcription_model` text DEFAULT 'openai/whisper-large-v3' NOT NULL,
	`transcription_provider` text DEFAULT 'auto' NOT NULL,
	`study_resource_mode` text DEFAULT 'hybrid' NOT NULL,
	`subject_load_overrides_json` text DEFAULT '{}' NOT NULL,
	`harassment_tone` text DEFAULT 'shame' NOT NULL,
	`backup_directory_uri` text,
	`pomodoro_enabled` integer DEFAULT true NOT NULL,
	`pomodoro_interval_minutes` integer DEFAULT 20 NOT NULL,
	`cloudflare_account_id` text DEFAULT '' NOT NULL,
	`cloudflare_api_token` text DEFAULT '' NOT NULL,
	`fal_api_key` text DEFAULT '' NOT NULL,
	`brave_search_api_key` text DEFAULT '' NOT NULL,
	`google_custom_search_api_key` text DEFAULT '' NOT NULL,
	`qwen_connected` integer DEFAULT false NOT NULL,
	`guru_chat_default_model` text DEFAULT 'auto' NOT NULL,
	`guru_memory_notes` text DEFAULT '' NOT NULL,
	`image_generation_model` text DEFAULT 'auto' NOT NULL,
	`exam_type` text DEFAULT 'INICET' NOT NULL,
	`prefer_gemini_structured_json` integer DEFAULT true NOT NULL,
	`github_models_pat` text DEFAULT '' NOT NULL,
	`kilo_api_key` text DEFAULT '' NOT NULL,
	`deepseek_key` text DEFAULT '' NOT NULL,
	`agentrouter_key` text DEFAULT '' NOT NULL,
	`provider_order` text DEFAULT '[]' NOT NULL,
	`deepgram_api_key` text DEFAULT '' NOT NULL,
	`api_validation_json` text DEFAULT '{}' NOT NULL,
	`chatgpt_connected` integer DEFAULT false NOT NULL,
	`chatgpt_accounts_json` text DEFAULT '{"primary":{"enabled":true,"connected":false},"secondary":{"enabled":false,"connected":false}}' NOT NULL,
	`auto_backup_frequency` text DEFAULT 'off' NOT NULL,
	`last_auto_backup_at` text,
	`github_copilot_connected` integer DEFAULT false NOT NULL,
	`github_copilot_preferred_model` text DEFAULT '' NOT NULL,
	`gitlab_duo_connected` integer DEFAULT false NOT NULL,
	`gitlab_oauth_client_id` text DEFAULT '' NOT NULL,
	`gitlab_duo_preferred_model` text DEFAULT '' NOT NULL,
	`poe_connected` integer DEFAULT false NOT NULL,
	`gdrive_web_client_id` text DEFAULT '' NOT NULL,
	`gdrive_connected` integer DEFAULT false NOT NULL,
	`gdrive_email` text DEFAULT '' NOT NULL,
	`gdrive_last_sync_at` text,
	`last_backup_device_id` text DEFAULT '' NOT NULL,
	`dbmci_class_start_date` text,
	`btr_start_date` text,
	`home_novelty_cooldown_hours` integer DEFAULT 6 NOT NULL,
	`disabled_providers` text DEFAULT '[]' NOT NULL,
	`jina_api_key` text DEFAULT '' NOT NULL,
	`orb_effect` text DEFAULT 'ripple' NOT NULL
);
