-- Schedule issues: actionable tasks from monitors
CREATE TABLE IF NOT EXISTS schedule_issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  message TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  booking_ids UUID[] DEFAULT '{}',
  cleaner_id UUID REFERENCES cleaners(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_schedule_issues_status ON schedule_issues(status);
CREATE INDEX idx_schedule_issues_date ON schedule_issues(date);
CREATE INDEX idx_schedule_issues_type ON schedule_issues(type);
