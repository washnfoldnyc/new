-- Sales Pipeline: deals + deal_activities tables
-- Run this in the Supabase SQL editor

-- Deals = sales board entries (interested clients with follow-up tracking)
CREATE TABLE IF NOT EXISTS deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'active'
    CHECK (stage IN ('active', 'booked', 'removed')),
  follow_up_at TIMESTAMPTZ,
  follow_up_note TEXT,
  last_contacted_at TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_client_id ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_follow_up_at ON deals(follow_up_at) WHERE follow_up_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_client_active ON deals(client_id) WHERE stage = 'active';

ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on deals" ON deals FOR ALL USING (true) WITH CHECK (true);

-- Activity log for deals (calls, texts, notes, etc.)
CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('note', 'call', 'text', 'email', 'quote_sent', 'follow_up_set', 'auto_created')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON deal_activities(deal_id);

ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on deal_activities" ON deal_activities FOR ALL USING (true) WITH CHECK (true);

-- Add deal_id to notifications for linking follow-up notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

-- Outreach tracking on clients (for working the full list)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_outreach_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS outreach_count INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS outreach_status TEXT DEFAULT 'none';

-- Pet info on clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pet_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pet_type TEXT;

-- Outreach log — tracks every Selena text so we never double-text a moment
CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  moment_id TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_log_client_moment ON outreach_log(client_id, moment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_log_unique ON outreach_log(client_id, moment_id);

ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on outreach_log" ON outreach_log FOR ALL USING (true) WITH CHECK (true);
