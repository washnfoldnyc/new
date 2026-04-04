import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'
import { notify } from '@/lib/notify'
import { protectCronAPI } from '@/lib/auth'

export const maxDuration = 60

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Find eligible clients:
  // - active, sms_consent, not opted out, not do_not_service
  const { data: clients, error } = await supabaseAdmin
    .from('clients')
    .select('id, name, phone')
    .eq('active', true)
    .eq('sms_consent', true)
    .eq('sms_marketing_opt_out', false)
    .eq('do_not_service', false)
    .not('phone', 'is', null)
    .limit(500)

  if (error) {
    console.error('Retention cron query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  let skipped = 0

  for (const client of clients || []) {
    if (!client.phone) { skipped++; continue }

    const cleanPhone = client.phone.replace(/\D/g, '').slice(-10)
    if (cleanPhone.length < 10) { skipped++; continue }

    // Check last completed booking
    const { data: lastCompleted } = await supabaseAdmin
      .from('bookings')
      .select('id, start_time')
      .eq('client_id', client.id)
      .eq('status', 'completed')
      .order('start_time', { ascending: false })
      .limit(1)

    if (!lastCompleted || lastCompleted.length === 0) { skipped++; continue }

    const lastBookingDate = lastCompleted[0].start_time
    // Must be 30+ days ago
    if (lastBookingDate > thirtyDaysAgo) { skipped++; continue }

    // Stop after 90 days (3 texts max)
    if (lastBookingDate < ninetyDaysAgo) { skipped++; continue }

    // Check for upcoming bookings
    const { data: upcoming } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('client_id', client.id)
      .in('status', ['scheduled', 'pending'])
      .limit(1)

    if (upcoming && upcoming.length > 0) { skipped++; continue }

    // Check if we already sent a retention text in the last 30 days
    const { data: recentRetention } = await supabaseAdmin
      .from('sms_logs')
      .select('id')
      .eq('recipient', cleanPhone)
      .eq('sms_type', 'retention')
      .gte('created_at', thirtyDaysAgo)
      .limit(1)

    if (recentRetention && recentRetention.length > 0) { skipped++; continue }

    // Send retention text
    const firstName = (client.name || '').split(' ')[0] || 'there'
    const message = `Hey ${firstName}! It's been a while \u{2014} need a cleaning? We'd love to help \u{1F60A} Reply to this text or call (212) 202-8400 to schedule.`

    const result = await sendSMS(`+1${cleanPhone}`, message, {
      smsType: 'retention',
      recipientType: 'client',
      recipientId: client.id,
    })

    if (result.success) {
      sent++
    } else {
      skipped++
    }
  }

  if (sent > 0) {
    await notify({
      type: 'retention',
      title: 'Retention Texts Sent',
      message: `Sent ${sent} retention texts (${skipped} skipped)`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, sent, skipped })
}
