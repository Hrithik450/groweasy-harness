ALTER TABLE `detail_bar` ADD COLUMN `session_slug` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `detail_bar`
SET `session_slug` = (SELECT `slug` FROM `sessions` WHERE `sessions`.`id` = `detail_bar`.`session_id`);
