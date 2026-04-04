-- Backfill outcome/summary for existing conversations that have bookings
UPDATE sms_conversations
SET
  outcome = 'booked',
  summary = 'Booking created via SMS'
WHERE booking_id IS NOT NULL
  AND outcome IS NULL;

-- Tag expired conversations without bookings as abandoned
UPDATE sms_conversations
SET
  outcome = 'abandoned',
  summary = 'Conversation expired — no booking'
WHERE expired = true
  AND booking_id IS NULL
  AND outcome IS NULL;

-- Tag completed conversations without bookings as question_answered
UPDATE sms_conversations
SET
  outcome = 'question_answered',
  summary = 'Conversation completed — no booking'
WHERE completed_at IS NOT NULL
  AND booking_id IS NULL
  AND outcome IS NULL;
