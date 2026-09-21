CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`admin_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_admin_sessions_admin` ON `admin_sessions` (`admin_id`,`id`);