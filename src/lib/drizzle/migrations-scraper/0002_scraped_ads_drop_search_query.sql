DROP INDEX IF EXISTS `idx_scraped_ads_query`;--> statement-breakpoint
CREATE TABLE `__new_scraped_ads` (
	`library_id` text NOT NULL,
	`ad_url` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`relevance_score` real NOT NULL,
	`start_date` text,
	`status` text DEFAULT 'active',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`library_id`)
);--> statement-breakpoint
DROP TABLE `scraped_ads`;--> statement-breakpoint
ALTER TABLE `__new_scraped_ads` RENAME TO `scraped_ads`;--> statement-breakpoint
CREATE INDEX `idx_scraped_ads_relevance` ON `scraped_ads` (`relevance_score`);
