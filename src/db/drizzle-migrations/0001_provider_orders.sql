ALTER TABLE `user_profile` ADD COLUMN `image_generation_order` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `transcription_order` text DEFAULT '[]' NOT NULL;
