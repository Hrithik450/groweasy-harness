CREATE TABLE `session_skills` (
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`session_id`, `name`),
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE cascade ON DELETE cascade
);
