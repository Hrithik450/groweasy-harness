-- Nested levels are fields of their own: campaigns.ads, campaigns.ads.creatives, …
UPDATE `detail_bar_items`
SET `field` = `field` || '.ads'
WHERE `field` = 'campaigns' AND `parent_id` IS NOT NULL;
