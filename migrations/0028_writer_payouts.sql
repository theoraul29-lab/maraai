ALTER TABLE `users` ADD COLUMN `paypal_payout_email` text;
--> statement-breakpoint
ALTER TABLE `writer_purchases` ADD COLUMN `payout_status` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `writer_purchases` ADD COLUMN `payout_ref` text;
