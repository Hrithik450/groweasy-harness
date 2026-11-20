ALTER TABLE `detail_bar_items` RENAME TO `detail_bar_items_old`;
--> statement-breakpoint
CREATE TABLE `detail_bar_items` (
	`session_id` text NOT NULL,
	`session_slug` text NOT NULL,
	`field` text NOT NULL,
	`id` text NOT NULL,
	`parent_field` text,
	`parent_id` text,
	`status` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`session_id`, `field`, `id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`session_id`,`parent_field`,`parent_id`) REFERENCES `detail_bar_items`(`session_id`,`field`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `detail_bar_items` (`session_id`,`session_slug`,`field`,`id`,`parent_field`,`parent_id`,`status`,`data`,`created_at`,`updated_at`,`seq`)
SELECT `session_id`,`session_slug`,`field`,`id`,
       CASE WHEN `parent_id` IS NULL THEN NULL
            WHEN `field` = 'campaigns.ads' THEN 'campaigns'
            ELSE NULL END,
       `parent_id`,`status`,`data`,`created_at`,`updated_at`,`seq`
FROM `detail_bar_items_old`;
--> statement-breakpoint
DROP TABLE `detail_bar_items_old`;
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_page` ON `detail_bar_items` (`session_id`,`field`,`parent_id`,`seq`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_status` ON `detail_bar_items` (`session_id`,`field`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_parent` ON `detail_bar_items` (`session_id`,`parent_field`,`parent_id`);
