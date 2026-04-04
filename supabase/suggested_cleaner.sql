ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suggested_cleaner_id UUID REFERENCES cleaners(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suggested_reason TEXT;
