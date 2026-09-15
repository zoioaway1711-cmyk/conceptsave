CREATE TABLE `customer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`first_seen` text NOT NULL,
	`last_active` text NOT NULL,
	`preferred_language` text DEFAULT 'pt' NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`level_name` text DEFAULT 'Essencial' NOT NULL,
	`benefits_json` text DEFAULT '[]' NOT NULL,
	`consent_json` text DEFAULT '{}' NOT NULL,
	`serials_json` text DEFAULT '[]' NOT NULL,
	`revoked_serials_json` text DEFAULT '[]' NOT NULL,
	`verified_at_json` text DEFAULT '{}' NOT NULL,
	`rank_override` integer DEFAULT 0 NOT NULL,
	`blocked` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` text NOT NULL,
	`serial` text NOT NULL,
	`product` text DEFAULT '' NOT NULL,
	`maker` text DEFAULT '' NOT NULL,
	`lot` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`credited` integer DEFAULT false NOT NULL,
	`action` text DEFAULT 'verification' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`activated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_verification_profile_serial_time` ON `verification_events` (`profile_id`,`serial`,`activated_at`);