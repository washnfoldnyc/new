-- Smart scheduling: add lat/lng to clients and cleaners, home_by_time for cleaners

-- Clients: cache geocoded coordinates
ALTER TABLE clients ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

-- Cleaners: cache home coordinates + must-be-home-by time
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS home_latitude DECIMAL(10,8);
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS home_longitude DECIMAL(11,8);
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS home_by_time TEXT DEFAULT '18:00'; -- e.g. "17:30", per cleaner
