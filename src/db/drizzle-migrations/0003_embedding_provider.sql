-- Custom SQL migration file, put you code below! --
ALTER TABLE `user_profile` ADD `embedding_provider` text DEFAULT 'gemini' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD `embedding_model` text DEFAULT 'models/text-embedding-004' NOT NULL;
