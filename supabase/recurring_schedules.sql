-- Recurring Schedules: parent record for recurring booking series
-- Replaces fragile client_id + recurring_type matching

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id),
  cleaner_id UUID REFERENCES cleaners(id),
  recurring_type TEXT NOT NULL,        -- 'Weekly', 'Bi-weekly', etc.
  day_of_week INTEGER,                 -- 0=Sun..6=Sat
  preferred_time TIME,                 -- e.g. '09:00'
  duration_hours NUMERIC DEFAULT 3,
  hourly_rate NUMERIC,
  cleaner_pay_rate NUMERIC,
  notes TEXT,
  special_instructions TEXT,
  status TEXT DEFAULT 'active',        -- active, paused, cancelled
  paused_until DATE,                   -- resume date for vacations
  next_generate_after DATE,            -- last date we generated through
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_client ON recurring_schedules(client_id);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_status ON recurring_schedules(status);

-- Add schedule_id column to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES recurring_schedules(id);
CREATE INDEX IF NOT EXISTS idx_bookings_schedule_id ON bookings(schedule_id);

-- Migration: backfill existing recurring bookings
-- Groups future scheduled recurring bookings by client + recurring_type + cleaner
-- Creates one recurring_schedules row per group, then links bookings via schedule_id

DO $$
DECLARE
  rec RECORD;
  new_schedule_id UUID;
BEGIN
  FOR rec IN
    SELECT DISTINCT
      b.client_id,
      b.cleaner_id,
      b.recurring_type,
      EXTRACT(DOW FROM b.start_time::timestamp) AS day_of_week,
      b.start_time::time AS preferred_time,
      EXTRACT(EPOCH FROM (b.end_time::timestamp - b.start_time::timestamp)) / 3600 AS duration_hours,
      b.hourly_rate,
      MAX(b.start_time::date) AS last_booking_date
    FROM bookings b
    WHERE b.recurring_type IS NOT NULL
      AND b.status IN ('scheduled', 'pending')
      AND b.start_time::date >= CURRENT_DATE
      AND b.schedule_id IS NULL
    GROUP BY b.client_id, b.cleaner_id, b.recurring_type,
             EXTRACT(DOW FROM b.start_time::timestamp),
             b.start_time::time,
             EXTRACT(EPOCH FROM (b.end_time::timestamp - b.start_time::timestamp)) / 3600,
             b.hourly_rate
  LOOP
    INSERT INTO recurring_schedules (
      client_id, cleaner_id, recurring_type, day_of_week,
      preferred_time, duration_hours, hourly_rate, status, next_generate_after
    ) VALUES (
      rec.client_id, rec.cleaner_id, rec.recurring_type, rec.day_of_week,
      rec.preferred_time, rec.duration_hours, rec.hourly_rate, 'active', rec.last_booking_date
    ) RETURNING id INTO new_schedule_id;

    -- Link all matching bookings (past and future) to this schedule
    UPDATE bookings
    SET schedule_id = new_schedule_id
    WHERE client_id = rec.client_id
      AND recurring_type = rec.recurring_type
      AND (cleaner_id = rec.cleaner_id OR (cleaner_id IS NULL AND rec.cleaner_id IS NULL))
      AND schedule_id IS NULL;
  END LOOP;
END $$;
