CREATE TABLE `admin_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`target_type` text DEFAULT 'system' NOT NULL,
	`target_id` text DEFAULT '' NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`ip` text DEFAULT '' NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `product_serials` (
	`serial` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`maker` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`lot` text DEFAULT '' NOT NULL,
	`expiry` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'authentic' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text DEFAULT 'admin' NOT NULL
);
