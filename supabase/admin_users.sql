-- Admin Users & Role-Based Access Control
-- Run this in Supabase SQL Editor

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phone for SMS notifications (optional, used for 15-min alerts etc)
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for login lookups
CREATE INDEX idx_admin_users_email ON admin_users(email);

-- Seed the owner account (password will be set via API)
-- Do NOT run this insert — use the /api/admin/users setup endpoint instead
