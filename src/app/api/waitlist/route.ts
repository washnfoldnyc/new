import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { data, error } = await supabaseAdmin
    .from('sms_conversations')
    .select('id, name, phone, service_type, booking_checklist, created_at, client_id')
    .eq('outcome', 'waitlisted')
    .eq('expired', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const entries = (data || []).map((row) => {
    const checklist = (row.booking_checklist as Record<string, unknown>) || {}
    return {
      id: row.id,
      name: row.name || (checklist.name as string) || null,
      phone: row.phone,
      service_type: row.service_type || (checklist.service_type as string) || null,
      preferred_date: (checklist.waitlist_preferred_date as string) || (checklist.date as string) || null,
      preferred_time: (checklist.waitlist_preferred_time as string) || (checklist.time as string) || null,
      created_at: row.created_at,
      client_id: row.client_id,
    }
  })

  return NextResponse.json(entries)
}
