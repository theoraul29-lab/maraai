-- Evolutionary emotional profile — columns updated async by the brain
-- cycle after processing chat excerpts (Phase 1).  Never written on the
-- hot path, so chat latency is unaffected.
--
-- dominant_emotion  — most frequent detected emotion over the last 7 days
--                     (ambition / insecurity / excitement / confusion /
--                      frustration / gratitude / curiosity / growth / neutral)
-- dominant_topic    — main subject the user has been discussing lately
-- mara_confidence   — 0-100 score: how well Mara knows this user.
--                     Increments with each successful profile update;
--                     decrements if the user goes silent for 30 d.
-- profile_updated_at — unix timestamp of the last LLM-based update; used
--                      to enforce the 24 h per-user rate limit.

ALTER TABLE `user_personality` ADD COLUMN `dominant_emotion` text;
--> statement-breakpoint
ALTER TABLE `user_personality` ADD COLUMN `dominant_topic` text;
--> statement-breakpoint
ALTER TABLE `user_personality` ADD COLUMN `mara_confidence` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `user_personality` ADD COLUMN `profile_updated_at` integer;
