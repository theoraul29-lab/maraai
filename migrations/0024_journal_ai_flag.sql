-- Add is_ai_generated flag to journal_entries so admins can distinguish
-- LLM-generated pages from fallback plain-text entries (when the LLM
-- was unavailable at the time of day completion).
-- Default = 1 (assume AI-generated) so existing rows stay consistent.
ALTER TABLE `journal_entries` ADD COLUMN `is_ai_generated` integer DEFAULT 1;
