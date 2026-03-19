CREATE TABLE `score_cache_metadata` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`media_type` text NOT NULL,
	`base_reelscore` integer,
	`source_count` integer,
	`last_fetched_at` text,
	`release_date` text
);
