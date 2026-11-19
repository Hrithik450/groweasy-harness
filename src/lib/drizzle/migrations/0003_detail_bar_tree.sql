CREATE TABLE `bars` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bars_session_id_unique` ON `bars` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_bars_session` ON `bars` (`session_id`);
--> statement-breakpoint
INSERT INTO `bars` (`id`, `session_id`, `type`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), `sessions`.`id`, COALESCE(`sessions`.`slug`, 'default'), datetime('now'), datetime('now')
FROM `sessions`
WHERE `sessions`.`slug` IS NOT NULL
   OR EXISTS (SELECT 1 FROM `bar_items` WHERE `bar_items`.`session_id` = `sessions`.`id`);
--> statement-breakpoint
CREATE TABLE `bar_items_new` (
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
	FOREIGN KEY (`bar_id`) REFERENCES `bars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bar_id`,`kind`,`parent_id`) REFERENCES `bar_items_new`(`bar_id`,`kind`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bar_items_bar_kind_id` ON `bar_items_new` (`bar_id`,`kind`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_list` ON `bar_items_new` (`bar_id`,`kind`,`parent_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_status` ON `bar_items_new` (`bar_id`,`kind`,`status`);
--> statement-breakpoint
INSERT INTO `bar_items_new` (`id`, `bar_id`, `kind`, `parent_id`, `depth`, `status`, `error`, `data`, `created_at`, `updated_at`)
SELECT `bar_items`.`item_id`, `bars`.`id`, `bar_items`.`field`, NULL, 0,
       json_extract(`bar_items`.`data`, '$.status'),
       json_extract(`bar_items`.`data`, '$.note'),
       json_remove(`bar_items`.`data`, '$.status', '$.note'),
       `bar_items`.`created_at`, `bar_items`.`updated_at`
FROM `bar_items`
JOIN `bars` ON `bars`.`session_id` = `bar_items`.`session_id`;
--> statement-breakpoint
DROP TABLE `bar_items`;
--> statement-breakpoint
ALTER TABLE `bar_items_new` RENAME TO `bar_items`;
--> statement-breakpoint
DROP TABLE `session_projections`;
