CREATE TABLE `connectors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`slug` text NOT NULL,
	`provider_slug` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`permissions_json` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`metadata` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connectors_user_slug` ON `connectors` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_connectors_user_status` ON `connectors` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_connectors_user_provider` ON `connectors` (`user_id`,`provider_slug`);--> statement-breakpoint
CREATE TABLE `cron_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`timing` text NOT NULL,
	`requires` text,
	`last_run_at` text,
	`last_delivery_at` text,
	`last_error` text,
	`next_run_at` text,
	`status` text DEFAULT 'inactive' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cron_jobs_user_id` ON `cron_jobs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cron_jobs_session_id` ON `cron_jobs` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_cron_jobs_user_requires` ON `cron_jobs` (`user_id`,`requires`);--> statement-breakpoint
CREATE INDEX `idx_cron_jobs_due` ON `cron_jobs` (`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_cron_jobs_status_due` ON `cron_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE TABLE `session_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`time` integer NOT NULL,
	`data` text NOT NULL,
	`surface_op` text,
	`source_event_seqs` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_session_events_session_seq` ON `session_events` (`session_id`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_session_events_session_id` ON `session_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_session_events_session_type` ON `session_events` (`session_id`,`type`,`seq`);--> statement-breakpoint
CREATE TABLE `session_projections` (
	`session_id` text NOT NULL,
	`key` text NOT NULL,
	`state_version` integer DEFAULT 1 NOT NULL,
	`as_of_seq` integer DEFAULT -1 NOT NULL,
	`state` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`session_id`, `key`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_session_projections_session` ON `session_projections` (`session_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`slug` text,
	`hidden` integer DEFAULT false NOT NULL,
	`extra` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sessions_user_slug` ON `sessions` (`user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_updated` ON `sessions` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_hidden` ON `sessions` (`user_id`,`hidden`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`google_id` text,
	`email` text,
	`name` text,
	`picture` text,
	`email_verified` integer DEFAULT false,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_google_id` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `idx_users_email` ON `users` (`email`);