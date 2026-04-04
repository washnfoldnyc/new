import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cleanerId = searchParams.get('cleaner_id')

  if (!cleanerId) {
    return NextResponse.json({ error: 'Missing cleaner_id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cleaners')
    .select('notification_preferences, sms_consent')
    .eq('id', cleanerId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    notification_preferences: data?.notification_preferences || {
      job_assignment: { push: true, email: true, sms: true },
      job_reminder: { push: true, email: true, sms: true },
      daily_summary: { push: true, email: true, sms: true },
      job_cancelled: { push: true, email: true, sms: true },
      job_rescheduled: { push: true, email: true, sms: true },
      broadcast: { push: true, email: true, sms: true },
      quiet_start: '22:00',
      quiet_end: '07:00'
    },
    sms_consent: data?.sms_consent !== false
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { cleaner_id } = body

  if (!cleaner_id) {
    return NextResponse.json({ error: 'Missing cleaner_id' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (body.notification_preferences !== undefined) {
    update.notification_preferences = body.notification_preferences
  }
  if (body.sms_consent !== undefined) {
    update.sms_consent = body.sms_consent
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('cleaners')
    .update(update)
    .eq('id', cleaner_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
