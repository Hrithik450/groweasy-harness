CREATE TABLE `detail_bar_items` (
	`session_id` text NOT NULL,
	`session_slug` text NOT NULL,
	`field` text NOT NULL,
	`id` text NOT NULL,
	`parent_id` text,
	`status` text,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `field`, `id`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_page` ON `detail_bar_items` (`session_id`,`field`,`parent_id`,`updated_at`,`id`);
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_status` ON `detail_bar_items` (`session_id`,`field`,`status`);
--> statement-breakpoint
INSERT INTO `detail_bar_items` (`session_id`,`session_slug`,`field`,`id`,`parent_id`,`status`,`data`,`created_at`,`updated_at`)
SELECT d.`session_id`, d.`session_slug`, d.`field`,
       json_extract(card.value, '$.id'), NULL,
       json_extract(card.value, '$.status'),
       json_remove(card.value, '$.ads'),
       d.`updated_at`, d.`updated_at`
FROM `detail_bar` d, json_each(d.`data`) card;
--> statement-breakpoint
INSERT INTO `detail_bar_items` (`session_id`,`session_slug`,`field`,`id`,`parent_id`,`status`,`data`,`created_at`,`updated_at`)
SELECT d.`session_id`, d.`session_slug`, d.`field`,
       json_extract(ad.value, '$.id'), json_extract(card.value, '$.id'),
       json_extract(ad.value, '$.status'),
       json_remove(ad.value, '$.ads'),
       d.`updated_at`, d.`updated_at`
FROM `detail_bar` d, json_each(d.`data`) card, json_each(card.value, '$.ads') ad;
--> statement-breakpoint
DROP TABLE `detail_bar`;
