CREATE TABLE `admin_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`last_login_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_admin_users_username` ON `admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`material_id` integer NOT NULL,
	`serial_digest` text NOT NULL,
	`display_prefix` text NOT NULL,
	`display_suffix` text NOT NULL,
	`lot` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`owner_profile_id` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`activated_at` text,
	`revoked_at` text,
	FOREIGN KEY (`material_id`) REFERENCES `materials`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "licenses_status_check" CHECK("licenses"."status" IN ('active','revoked')),
	CONSTRAINT "licenses_display_suffix_check" CHECK(length("licenses"."display_suffix") = 4)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_licenses_digest` ON `licenses` (`serial_digest`);--> statement-breakpoint
CREATE INDEX `idx_licenses_material` ON `licenses` (`material_id`);--> statement-breakpoint
CREATE INDEX `idx_licenses_owner` ON `licenses` (`owner_profile_id`);--> statement-breakpoint
CREATE TABLE `live_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`actor_profile_id` text,
	`actor_admin_id` text,
	`material_id` integer,
	`license_id` integer,
	`ip` text DEFAULT '' NOT NULL,
	`country` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`device` text DEFAULT '' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "live_events_severity_check" CHECK("live_events"."severity" IN ('info','warning','critical'))
);
--> statement-breakpoint
CREATE INDEX `idx_live_events_created_at` ON `live_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_live_events_type` ON `live_events` (`type`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`prefix_code` text NOT NULL,
	`name` text NOT NULL,
	`maker` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "materials_prefix_check" CHECK("materials"."prefix_code" NOT GLOB '*[^A-Z0-9]*' AND length("materials"."prefix_code") BETWEEN 2 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_materials_slug` ON `materials` (`slug`);--> statement-breakpoint
ALTER TABLE `customer_profiles` ADD `last_seen_at` text;--> statement-breakpoint
CREATE INDEX `idx_customer_profiles_last_seen` ON `customer_profiles` (`last_seen_at`);--> statement-breakpoint
ALTER TABLE `verification_events` ADD `license_id` integer;--> statement-breakpoint
ALTER TABLE `verification_events` ADD `attempted_digest` text;--> statement-breakpoint
CREATE INDEX `idx_verification_license` ON `verification_events` (`license_id`);