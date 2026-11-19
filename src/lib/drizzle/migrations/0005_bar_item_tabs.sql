CREATE TABLE IF NOT EXISTS `bar_items_new` (
	`id` text NOT NULL,
	`bar_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`status` text,
	`error` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`bar_id`, `id`),
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`parent_id`) REFERENCES `bar_items_new`(`bar_id`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `bar_items_new` (`id`,`bar_id`,`kind`,`parent_id`,`depth`,`status`,`error`,`data`,`created_at`,`updated_at`)
SELECT `id`, `bar_id`,
  CASE
    WHEN `kind` = 'campaigns' AND `depth` = 1 THEN 'campaigns.ads'
    WHEN `kind` = 'campaigns' AND `depth` = 2 THEN 'campaigns.ads.creatives'
    ELSE `kind`
  END,
  `parent_id`, `depth`, `status`, `error`, `data`, `created_at`, `updated_at`
FROM `bar_items`;
--> statement-breakpoint
DROP TABLE `bar_items`;
--> statement-breakpoint
ALTER TABLE `bar_items_new` RENAME TO `bar_items`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bar_items_bar_kind_id` ON `bar_items` (`bar_id`,`kind`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_page` ON `bar_items` (`bar_id`,`kind`,`parent_id`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_status` ON `bar_items` (`bar_id`,`kind`,`status`);
