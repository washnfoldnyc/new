-- Booking notes: chat-style entries with optional image attachments
CREATE TABLE IF NOT EXISTS booking_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'client', 'system')),
  author_name TEXT,
  content TEXT,
  images JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT content_or_images CHECK (content IS NOT NULL OR images != '[]'::jsonb)
);

CREATE INDEX idx_booking_notes_booking_id ON booking_notes(booking_id);

-- If migrating from image_url to images:
-- ALTER TABLE booking_notes ADD COLUMN images JSONB DEFAULT '[]';
-- UPDATE booking_notes SET images = jsonb_build_array(image_url) WHERE image_url IS NOT NULL;
-- ALTER TABLE booking_notes DROP COLUMN image_url;
