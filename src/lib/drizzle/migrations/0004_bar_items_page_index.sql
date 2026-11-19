DROP INDEX IF EXISTS `idx_bar_items_list`;
CREATE INDEX IF NOT EXISTS `idx_bar_items_page`
	ON `bar_items` (`bar_id`,`kind`,`parent_id`,`updated_at`,`id`);
