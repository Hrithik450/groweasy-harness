CREATE TABLE `bar_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`field` text NOT NULL,
	`item_id` text NOT NULL,
	`seq` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bar_items_field_item` ON `bar_items` (`session_id`,`field`,`item_id`);--> statement-breakpoint
CREATE INDEX `idx_bar_items_page` ON `bar_items` (`session_id`,`field`,`seq`);