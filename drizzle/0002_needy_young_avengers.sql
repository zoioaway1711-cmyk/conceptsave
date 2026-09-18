CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`resource` text DEFAULT '' NOT NULL,
	`resource_id` text DEFAULT '' NOT NULL,
	`result` text NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "audit_logs_result_check" CHECK("audit_logs"."result" IN ('success','failure'))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_created_at` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_action` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expires_at` ON `rate_limits` (`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_verification_events` (
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
	`activated_at` text NOT NULL,
	CONSTRAINT "verification_events_status_check" CHECK("__new_verification_events"."status" IN ('authentic','invalid','not_found')),
	CONSTRAINT "verification_events_action_check" CHECK("__new_verification_events"."action" IN ('login','verification')),
	CONSTRAINT "verification_events_source_check" CHECK("__new_verification_events"."source" IN ('manual','qr-camera','qr-image','qr-link'))
);
--> statement-breakpoint
INSERT INTO `__new_verification_events`("id", "profile_id", "serial", "product", "maker", "lot", "status", "credited", "action", "source", "ip", "country", "user_agent", "metadata_json", "activated_at") SELECT "id", "profile_id", "serial", "product", "maker", "lot", "status", "credited", "action", "source", "ip", "country", "user_agent", "metadata_json", "activated_at" FROM `verification_events`;--> statement-breakpoint
DROP TABLE `verification_events`;--> statement-breakpoint
ALTER TABLE `__new_verification_events` RENAME TO `verification_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_verification_profile_serial_time` ON `verification_events` (`profile_id`,`serial`,`activated_at`);--> statement-breakpoint
CREATE INDEX `idx_verification_serial` ON `verification_events` (`serial`);--> statement-breakpoint
CREATE TABLE `__new_customer_profiles` (
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
	`blocked` integer DEFAULT false NOT NULL,
	CONSTRAINT "customer_profiles_points_check" CHECK("__new_customer_profiles"."points" >= 0),
	CONSTRAINT "customer_profiles_level_check" CHECK("__new_customer_profiles"."level" BETWEEN 1 AND 5),
	CONSTRAINT "customer_profiles_rank_override_check" CHECK("__new_customer_profiles"."rank_override" BETWEEN 0 AND 5),
	CONSTRAINT "customer_profiles_preferred_language_check" CHECK("__new_customer_profiles"."preferred_language" IN ('pt','en','es'))
);
--> statement-breakpoint
INSERT INTO `__new_customer_profiles`("id", "first_seen", "last_active", "preferred_language", "points", "level", "level_name", "benefits_json", "consent_json", "serials_json", "revoked_serials_json", "verified_at_json", "rank_override", "blocked") SELECT "id", "first_seen", "last_active", "preferred_language", "points", "level", "level_name", "benefits_json", "consent_json", "serials_json", "revoked_serials_json", "verified_at_json", "rank_override", "blocked" FROM `customer_profiles`;--> statement-breakpoint
DROP TABLE `customer_profiles`;--> statement-breakpoint
ALTER TABLE `__new_customer_profiles` RENAME TO `customer_profiles`;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`serial` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`maker` text NOT NULL,
	`lot` text NOT NULL,
	`expiry` text NOT NULL,
	`status` text NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	CONSTRAINT "products_status_check" CHECK("__new_products"."status" IN ('authentic','invalid')),
	CONSTRAINT "products_serial_format_check" CHECK("__new_products"."serial" GLOB '[0-9][0-9][0-9][0-9][0-9]' OR "__new_products"."serial" GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]' OR "__new_products"."serial" GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_products`("serial", "name", "maker", "lot", "expiry", "status", "brand") SELECT "serial", "name", "maker", "lot", "expiry", "status", "brand" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;