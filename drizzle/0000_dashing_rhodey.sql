-- Transition from the Astro-era schema: score_cache_metadata was disposable
-- cache data (and was never written to by app code). Safe to drop.
DROP TABLE IF EXISTS `score_cache_metadata`;
--> statement-breakpoint
CREATE TABLE `scores` (
	`tmdb_id` integer PRIMARY KEY NOT NULL,
	`media_type` text NOT NULL,
	`imdb_id` text,
	`base_reelscore` integer,
	`source_count` integer DEFAULT 0 NOT NULL,
	`scores_json` text NOT NULL,
	`breakdown` text,
	`release_date` text,
	`fetched_at` text NOT NULL
);
