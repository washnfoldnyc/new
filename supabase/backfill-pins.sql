-- Backfill 6-digit PINs for all existing clients that don't have one
UPDATE clients SET pin = LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0') WHERE pin IS NULL;
