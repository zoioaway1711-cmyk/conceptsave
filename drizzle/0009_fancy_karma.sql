CREATE TABLE `admin_profile_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`admin_id` text NOT NULL,
	`admin_username` text NOT NULL,
	`changes_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_admin_profile_changes_profile` ON `admin_profile_changes` (`profile_id`,`id`);