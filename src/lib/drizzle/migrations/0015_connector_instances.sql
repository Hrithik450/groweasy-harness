ALTER TABLE `connectors` ADD `instance` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE `connectors` ADD `is_primary` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `connectors`
SET `instance` = lower(
  CASE
    WHEN instr(json_extract(`metadata`, '$.url'), '://') > 0
      THEN substr(
        json_extract(`metadata`, '$.url'),
        instr(json_extract(`metadata`, '$.url'), '://') + 3
      )
    ELSE json_extract(`metadata`, '$.url')
  END
)
WHERE `slug` = 'businessProfile'
  AND json_extract(`metadata`, '$.url') IS NOT NULL;
--> statement-breakpoint
UPDATE `connectors`
SET `instance` = substr(`instance`, 1, instr(`instance` || '/', '/') - 1)
WHERE `slug` = 'businessProfile'
  AND `instance` LIKE '%/%';
--> statement-breakpoint
UPDATE `connectors`
SET `instance` = substr(`instance`, 5)
WHERE `slug` = 'businessProfile'
  AND `instance` LIKE 'www.%';
--> statement-breakpoint
UPDATE `connectors`
SET `instance` = 'default'
WHERE `slug` = 'businessProfile'
  AND (`instance` IS NULL OR `instance` = '');
--> statement-breakpoint
UPDATE `connectors` SET `is_primary` = true;
--> statement-breakpoint
DROP INDEX `idx_connectors_user_slug`;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connectors_user_slug_instance` ON `connectors` (`user_id`, `slug`, `instance`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connectors_one_primary` ON `connectors` (`user_id`, `slug`) WHERE `is_primary` = 1;
