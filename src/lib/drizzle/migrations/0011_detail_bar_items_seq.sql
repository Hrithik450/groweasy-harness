ALTER TABLE `detail_bar_items` ADD COLUMN `seq` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
WITH `ranked` AS (
	SELECT `session_id`, `field`, `id`,
		ROW_NUMBER() OVER (
			PARTITION BY `session_id`, `field`, `parent_id`
			ORDER BY `updated_at` DESC, `id` DESC
		) AS `rn`
	FROM `detail_bar_items`
)
UPDATE `detail_bar_items`
SET `seq` = -(
	SELECT `ranked`.`rn` FROM `ranked`
	WHERE `ranked`.`session_id` = `detail_bar_items`.`session_id`
		AND `ranked`.`field` = `detail_bar_items`.`field`
		AND `ranked`.`id` = `detail_bar_items`.`id`
);
--> statement-breakpoint
DROP INDEX IF EXISTS `idx_detail_bar_items_page`;
--> statement-breakpoint
CREATE INDEX `idx_detail_bar_items_page` ON `detail_bar_items` (`session_id`,`field`,`parent_id`,`seq`,`id`);
