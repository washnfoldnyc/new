-- Add manual verification columns to lead_clicks
ALTER TABLE lead_clicks ADD COLUMN IF NOT EXISTS true_conversion BOOLEAN DEFAULT FALSE;
ALTER TABLE lead_clicks ADD COLUMN IF NOT EXISTS true_close BOOLEAN DEFAULT FALSE;
