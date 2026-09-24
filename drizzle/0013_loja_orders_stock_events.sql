CREATE TABLE `loja_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`params_json` text NOT NULL,
	`path` text NOT NULL,
	`session_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_loja_events_name_created` ON `loja_events` (`name`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_loja_events_created` ON `loja_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `loja_orders` (
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
	CONSTRAINT "loja_orders_status_check" CHECK("loja_orders"."status" IN ('received','payment_approved','preparing','shipped','delivered','cancelled')),
	CONSTRAINT "loja_orders_payment_check" CHECK("loja_orders"."payment_method" IN ('pix','cartao','boleto'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_orders_number` ON `loja_orders` (`number`);--> statement-breakpoint
CREATE INDEX `idx_loja_orders_created` ON `loja_orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `loja_stock` (
	`sku` text PRIMARY KEY NOT NULL,
	`quantity` integer NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL,
	CONSTRAINT "loja_stock_quantity_check" CHECK("loja_stock"."quantity" >= 0)
);
