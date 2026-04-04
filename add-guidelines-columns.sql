-- Add team guidelines columns to settings table
-- cleaner_guidelines: JSON object with { en: "...", es: "..." } bilingual content
-- guidelines_updated_at: timestamp for tracking when guidelines were last published
ALTER TABLE settings ADD COLUMN IF NOT EXISTS cleaner_guidelines JSONB DEFAULT NULL;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS guidelines_updated_at TIMESTAMPTZ DEFAULT NULL;
