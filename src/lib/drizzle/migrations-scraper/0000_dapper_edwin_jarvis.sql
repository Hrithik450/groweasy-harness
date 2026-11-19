CREATE TABLE `scraped_ads` (
	`library_id` text NOT NULL,
	`search_query` text NOT NULL,
	`ad_url` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`relevance_score` real NOT NULL,
	`start_date` text,
	`status` text DEFAULT 'active',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`library_id`, `search_query`)
);
--> statement-breakpoint
CREATE INDEX `idx_scraped_ads_query` ON `scraped_ads` (`search_query`,`relevance_score`);