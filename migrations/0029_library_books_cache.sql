CREATE TABLE `library_books_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`authors` text NOT NULL,
	`languages` text NOT NULL,
	`subjects` text DEFAULT '[]' NOT NULL,
	`cover_url` text,
	`content` text NOT NULL,
	`content_format` text NOT NULL,
	`word_count` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer NOT NULL
);
