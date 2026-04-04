-- Service zones, transportation, and travel preferences
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS service_zones TEXT[] DEFAULT '{}';
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS has_car BOOLEAN DEFAULT false;
ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS max_travel_minutes INTEGER;

ALTER TABLE cleaner_applications ADD COLUMN IF NOT EXISTS service_zones TEXT[] DEFAULT '{}';
ALTER TABLE cleaner_applications ADD COLUMN IF NOT EXISTS has_car BOOLEAN DEFAULT false;
ALTER TABLE cleaner_applications ADD COLUMN IF NOT EXISTS max_travel_minutes INTEGER;
