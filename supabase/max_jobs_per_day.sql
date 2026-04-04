-- Add max_jobs_per_day to cleaners table
-- Run this in Supabase SQL Editor

ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS max_jobs_per_day INTEGER DEFAULT NULL;

-- NULL = unlimited, set a number to cap daily bookings per cleaner
-- Example: UPDATE cleaners SET max_jobs_per_day = 3 WHERE name = 'Karina';
