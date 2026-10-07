-- Real reviews only (owner decision, 2026-10-07). The ratings/review counts
-- seeded in 0015 never came from a purchase, so they are zeroed; from now on
-- they are recomputed from approved rows of loja_reviews, which can only be
-- written from a delivered order's page (lib/loja-reviews.ts).
UPDATE `loja_products` SET `rating` = 0, `review_count` = 0, `updated_at` = '2026-10-07T00:00:01.000Z' WHERE `rating` <> 0 OR `review_count` <> 0;
--> statement-breakpoint
CREATE TABLE `loja_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_slug` text NOT NULL,
	`rating` integer NOT NULL,
	`text` text NOT NULL,
	`author` text NOT NULL,
	`city` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`moderated_at` text,
	`moderated_by` text,
	CONSTRAINT "loja_reviews_rating_check" CHECK("loja_reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "loja_reviews_status_check" CHECK("loja_reviews"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_loja_reviews_order_product` ON `loja_reviews` (`order_id`,`product_slug`);
--> statement-breakpoint
CREATE INDEX `idx_loja_reviews_status` ON `loja_reviews` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_loja_reviews_product` ON `loja_reviews` (`product_slug`,`status`);
--> statement-breakpoint
-- Product photos uploaded in the admin (R2 is not enabled on the account).
-- One row per size (480/960), already resized and compressed in the
-- browser; stored as base64 so D1 hands it back as a string, not as a
-- huge JSON array of byte numbers. Served by /loja-img/<id>-<size>.webp.
CREATE TABLE `loja_images` (
	`id` text NOT NULL,
	`size` integer NOT NULL,
	`mime` text NOT NULL,
	`data_b64` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	PRIMARY KEY(`id`, `size`),
	CONSTRAINT "loja_images_size_check" CHECK("loja_images"."size" IN (480, 960)),
	CONSTRAINT "loja_images_mime_check" CHECK("loja_images"."mime" IN ('image/webp','image/jpeg'))
);
