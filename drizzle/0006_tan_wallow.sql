ALTER TABLE `live_events` ADD `device_fingerprint` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_live_events_device_fingerprint` ON `live_events` (`device_fingerprint`);