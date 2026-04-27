ALTER TABLE `user_profile` ADD COLUMN `web_search_order` text DEFAULT NULL;--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `disabled_web_search_providers` text DEFAULT '[]' NOT NULL;
