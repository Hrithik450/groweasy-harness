CREATE TABLE `attachment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`request_id` text,
	`bound_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attachment_receipts_unbound` ON `attachment_receipts` (`bound_at`,`created_at`);