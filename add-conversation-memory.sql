-- Add memory columns to sms_conversations for Selena's client memory system
-- outcome: what happened (booked, rescheduled, question_answered, escalated, abandoned)
-- summary: one-line description of the conversation result

ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE sms_conversations ADD COLUMN IF NOT EXISTS summary TEXT;
