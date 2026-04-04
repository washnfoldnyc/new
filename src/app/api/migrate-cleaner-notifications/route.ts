import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const results: string[] = []

  // Create cleaner_notifications table
  const { error: tableError } = await supabaseAdmin.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS cleaner_notifications (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        cleaner_id UUID NOT NULL REFERENCES cleaners(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `
  })
  if (tableError) {
    const { error: directError } = await supabaseAdmin.from('cleaner_notifications').select('id').limit(1)
    if (directError?.code === '42P01') {
      results.push('Table does not exist - run SQL manually in Supabase dashboard')
    } else {
      results.push('cleaner_notifications table already exists')
    }
  } else {
    results.push('Created cleaner_notifications table')
  }

  // Create index
  try {
    const { error: idxError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `CREATE INDEX IF NOT EXISTS idx_cleaner_notifs_cleaner ON cleaner_notifications(cleaner_id, created_at DESC);`
    })
    if (idxError) results.push('Index may need manual creation')
    else results.push('Created index')
  } catch {
    results.push('Index may need manual creation')
  }

  // Enable RLS
  try {
    const { error: rlsError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `ALTER TABLE cleaner_notifications ENABLE ROW LEVEL SECURITY;`
    })
    if (rlsError) results.push('RLS may need manual enabling')
    else results.push('Enabled RLS')
  } catch {
    results.push('RLS may need manual enabling')
  }

  // Add notification_preferences column
  const { error: colError } = await supabaseAdmin.rpc('exec_sql', {
    sql: `
      ALTER TABLE cleaners ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
        "job_assignment": {"push": true, "email": true, "sms": true},
        "job_reminder": {"push": true, "email": true, "sms": true},
        "daily_summary": {"push": true, "email": true, "sms": true},
        "job_cancelled": {"push": true, "email": true, "sms": true},
        "job_rescheduled": {"push": true, "email": true, "sms": true},
        "broadcast": {"push": true, "email": true, "sms": true},
        "quiet_start": "22:00",
        "quiet_end": "07:00"
      }'::jsonb;
    `
  })
  if (colError) {
    results.push('notification_preferences column may need manual addition')
  } else {
    results.push('Added notification_preferences column to cleaners')
  }

  return NextResponse.json({ success: true, results, note: 'If any steps failed, run create-cleaner-notifications.sql manually in Supabase SQL editor' })
}
