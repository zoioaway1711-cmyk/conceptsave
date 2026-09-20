PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_live_events` (
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
	`device_fingerprint` text DEFAULT '' NOT NULL,
	`geo_permission` text DEFAULT '' NOT NULL,
	`geo_latitude` real,
	`geo_longitude` real,
	`geo_accuracy` real,
	`reason` text DEFAULT '' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "live_events_severity_check" CHECK("__new_live_events"."severity" IN ('info','warning','critical')),
	CONSTRAINT "live_events_geo_permission_check" CHECK("__new_live_events"."geo_permission" IN ('','granted','denied','unavailable','unsupported'))
);
--> statement-breakpoint
INSERT INTO `__new_live_events`("id", "type", "severity", "actor_profile_id", "actor_admin_id", "material_id", "license_id", "ip", "country", "region", "city", "device", "device_fingerprint", "reason", "metadata_json", "created_at") SELECT "id", "type", "severity", "actor_profile_id", "actor_admin_id", "material_id", "license_id", "ip", "country", "region", "city", "device", "device_fingerprint", "reason", "metadata_json", "created_at" FROM `live_events`;--> statement-breakpoint
DROP TABLE `live_events`;--> statement-breakpoint
ALTER TABLE `__new_live_events` RENAME TO `live_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_live_events_created_at` ON `live_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_live_events_type` ON `live_events` (`type`);--> statement-breakpoint
CREATE INDEX `idx_live_events_device_fingerprint` ON `live_events` (`device_fingerprint`);