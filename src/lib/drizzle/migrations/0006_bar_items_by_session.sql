ALTER TABLE `bar_items` RENAME TO `bar_items_old`;
--> statement-breakpoint
CREATE TABLE `bar_items` (
	`id` text NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_id` text,
	`depth` integer DEFAULT 0 NOT NULL,
	`status` text,
	`error` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`session_id`,`parent_id`) REFERENCES `bar_items`(`session_id`,`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `bar_items` (`id`,`session_id`,`kind`,`parent_id`,`depth`,`status`,`error`,`data`,`created_at`,`updated_at`)
SELECT `bar_items_old`.`id`, `bars`.`session_id`, `bar_items_old`.`kind`, `bar_items_old`.`parent_id`,
       `bar_items_old`.`depth`, `bar_items_old`.`status`, `bar_items_old`.`error`,
       `bar_items_old`.`data`, `bar_items_old`.`created_at`, `bar_items_old`.`updated_at`
FROM `bar_items_old` JOIN `bars` ON `bars`.`id` = `bar_items_old`.`bar_id`;
--> statement-breakpoint
DROP TABLE `bar_items_old`;
--> statement-breakpoint
DROP TABLE `bars`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_bar_items_session_kind_id` ON `bar_items` (`session_id`,`kind`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_page` ON `bar_items` (`session_id`,`kind`,`parent_id`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_bar_items_status` ON `bar_items` (`session_id`,`kind`,`status`);
