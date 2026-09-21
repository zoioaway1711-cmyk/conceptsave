CREATE TABLE `blocked_ips` (
	`ip` text PRIMARY KEY NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`blocked_by` text NOT NULL,
	`blocked_at` text NOT NULL,
	`expires_at` text
);
