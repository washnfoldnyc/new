-- Cleaner in-app notifications
CREATE TABLE IF NOT EXISTS cleaner_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cleaner_notifs_cleaner ON cleaner_notifications(cleaner_id, created_at DESC);
ALTER TABLE cleaner_notifications ENABLE ROW LEVEL SECURITY;

-- Blanket RLS policy — service role bypasses anyway, this allows dashboard access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cleaner_notifications' AND policyname = 'Service role full access on cleaner_notifications'
  ) THEN
    CREATE POLICY "Service role full access on cleaner_notifications"
      ON cleaner_notifications FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Notification preferences on cleaners table
-- DEFAULT ensures every new cleaner automatically gets the same rules — no per-person config needed
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"job_assignment":{"push":true,"email":true,"sms":true},"job_reminder":{"push":true,"email":true,"sms":true},"daily_summary":{"push":true,"email":true,"sms":true},"job_cancelled":{"push":true,"email":true,"sms":true},"job_rescheduled":{"push":true,"email":true,"sms":true},"broadcast":{"push":true,"email":true,"sms":true},"quiet_start":"22:00","quiet_end":"07:00"}'::jsonb;
