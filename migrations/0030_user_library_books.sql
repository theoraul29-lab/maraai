CREATE TABLE `user_library_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`book_id` integer NOT NULL,
	`book_title` text NOT NULL,
	`book_authors` text DEFAULT '[]' NOT NULL,
	`book_cover_url` text,
	`last_page` integer DEFAULT 0 NOT NULL,
	`total_pages` integer DEFAULT 0 NOT NULL,
	`added_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_library_books_unique` ON `user_library_books` (`user_id`,`book_id`);
--> statement-breakpoint
CREATE INDEX `idx_user_library_books_user` ON `user_library_books` (`user_id`,`updated_at`);
