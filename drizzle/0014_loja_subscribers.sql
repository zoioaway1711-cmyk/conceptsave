CREATE TABLE `loja_subscribers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`kind` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`consent_text` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "loja_subscribers_kind_check" CHECK("loja_subscribers"."kind" IN ('news','restock'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_subscribers_unique` ON `loja_subscribers` (`email`,`kind`,`sku`);