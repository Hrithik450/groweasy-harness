DROP INDEX IF EXISTS `idx_scraped_ads_query`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_scraped_ads_relevance`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_scraped_ads_last_seen`;--> statement-breakpoint
DROP INDEX IF EXISTS `idx_ad_query_relevance_query_score`;--> statement-breakpoint
DROP TABLE IF EXISTS `ad_query_relevance`;--> statement-breakpoint
DROP TABLE IF EXISTS `scraped_ads`;--> statement-breakpoint
CREATE TABLE `scraped_ads` (
	`library_id` text PRIMARY KEY NOT NULL,
	`ad_url` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`embedding` text,
	`embedding_model` text,
	`embedding_hash` text,
	`start_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_scraped_ads_last_seen` ON `scraped_ads` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `ad_query_relevance` (
	`library_id` text NOT NULL,
	`search_query` text NOT NULL,
	`relevance_score` real NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	PRIMARY KEY(`library_id`, `search_query`),
	FOREIGN KEY (`library_id`) REFERENCES `scraped_ads`(`library_id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_ad_query_relevance_query_score` ON `ad_query_relevance` (`search_query`,`relevance_score`);
