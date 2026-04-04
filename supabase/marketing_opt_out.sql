-- Add per-channel marketing opt-out columns to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_marketing_opt_out BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_marketing_opt_out BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS email_marketing_opted_out_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS sms_marketing_opted_out_at TIMESTAMPTZ;

-- Opt-out audit log — proof of when and how a client opted out
CREATE TABLE IF NOT EXISTS marketing_opt_out_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  method TEXT NOT NULL CHECK (method IN ('email_link', 'sms_stop', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opt_out_log_client ON marketing_opt_out_log(client_id);
