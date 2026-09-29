CREATE TABLE `loja_payment_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`provider_ref` text NOT NULL,
	`event` text NOT NULL,
	`payload_json` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_payment_events_unique` ON `loja_payment_events` (`provider`,`provider_ref`,`event`);--> statement-breakpoint
CREATE TABLE `loja_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_ref` text,
	`status` text NOT NULL,
	`provider_status` text,
	`amount_cents` integer NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`provider_data_json` text DEFAULT '{}' NOT NULL,
	`receipt_url` text,
	`paid_at` text,
	`checked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "loja_payments_provider_check" CHECK("loja_payments"."provider" IN ('pix','crypto')),
	CONSTRAINT "loja_payments_status_check" CHECK("loja_payments"."status" IN ('creating','pending','paid','expired','review','failed')),
	CONSTRAINT "loja_payments_amount_check" CHECK("loja_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_payments_provider_ref` ON `loja_payments` (`provider`,`provider_ref`);--> statement-breakpoint
CREATE INDEX `idx_loja_payments_order` ON `loja_payments` (`order_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_payments_live` ON `loja_payments` (`order_id`) WHERE "loja_payments"."status" IN ('creating','pending');--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_loja_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`status` text NOT NULL,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`customer_cpf_encrypted` text NOT NULL,
	`cpf_last2` text NOT NULL,
	`address_json` text NOT NULL,
	`items_json` text NOT NULL,
	`totals_json` text NOT NULL,
	`total` real NOT NULL,
	`payment_method` text NOT NULL,
	`installments` integer DEFAULT 1 NOT NULL,
	`tracking_code` text,
	`history_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "loja_orders_status_check" CHECK("__new_loja_orders"."status" IN ('received','payment_approved','preparing','shipped','delivered','cancelled')),
	CONSTRAINT "loja_orders_payment_check" CHECK("__new_loja_orders"."payment_method" IN ('pix','cartao','boleto','crypto'))
);
--> statement-breakpoint
INSERT INTO `__new_loja_orders`("id", "number", "status", "customer_name", "customer_email", "customer_phone", "customer_cpf_encrypted", "cpf_last2", "address_json", "items_json", "totals_json", "total", "payment_method", "installments", "tracking_code", "history_json", "created_at", "updated_at") SELECT "id", "number", "status", "customer_name", "customer_email", "customer_phone", "customer_cpf_encrypted", "cpf_last2", "address_json", "items_json", "totals_json", "total", "payment_method", "installments", "tracking_code", "history_json", "created_at", "updated_at" FROM `loja_orders`;--> statement-breakpoint
DROP TABLE `loja_orders`;--> statement-breakpoint
ALTER TABLE `__new_loja_orders` RENAME TO `loja_orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_orders_number` ON `loja_orders` (`number`);--> statement-breakpoint
CREATE INDEX `idx_loja_orders_created` ON `loja_orders` (`created_at`);