import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectCronAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'
import { notifyCleaner } from '@/lib/notify-cleaner'
import { smsLateCheckInCleaner, smsLateCheckInAdmin, smsLateCheckOutCleaner, smsLateCheckOutAdmin } from '@/lib/sms-templates'
import { smsAdmins } from '@/lib/admin-contacts'
import { sendPushToAll } from '@/lib/push'

function toNaive(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
    const now = new Date()
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000)
    const results: string[] = []

    // Find scheduled bookings where start_time is 10+ min ago and no check-in
    const { data: lateBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*), cleaners(*)')
      .eq('status', 'scheduled')
      .lte('start_time', toNaive(tenMinAgo))
      .gte('start_time', toNaive(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)))
      .is('check_in_time', null)

    for (const booking of lateBookings || []) {
      // Dedup: check if we already sent a late_check_in alert for this booking
      const { data: existing } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('email_type', 'late_check_in')
        .limit(1)
      if (existing && existing.length > 0) continue

      // Log dedup entry
      await supabaseAdmin.from('email_logs').insert({
        booking_id: booking.id,
        email_type: 'late_check_in',
        recipient: booking.cleaners?.phone || 'no-phone'
      })

      // SMS + push to cleaner
      if (booking.cleaner_id) {
        notifyCleaner({
          cleanerId: booking.cleaner_id,
          type: 'job_reminder',
          title: 'Late Check-In',
          message: `You haven't checked in for your ${new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} job (${booking.clients?.name || 'Client'})`,
          bookingId: booking.id,
          smsMessage: smsLateCheckInCleaner(booking),
          skipEmail: true
        }).catch(() => {})
      }

      // SMS + push to admins
      smsAdmins(smsLateCheckInAdmin(booking)).catch(() => {})
      sendPushToAll(
        'Late Check-In',
        `${booking.cleaners?.name || 'Unassigned'} — ${booking.clients?.name || 'Client'} at ${new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
        '/admin/bookings'
      ).catch(() => {})

      // Dashboard notification
      await supabaseAdmin.from('notifications').insert({
        type: 'late_check_in',
        title: 'Late Check-In',
        message: `${booking.cleaners?.name || 'Unassigned'} hasn't checked in for ${booking.clients?.name || 'Client'} (${new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})`,
        booking_id: booking.id
      })

      results.push(booking.id)
    }

    // ---- Late Check-Out: 30 min after 15-min alert with no check-out ----
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000)
    const checkoutResults: string[] = []

    const { data: lateCheckouts } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*), cleaners(*)')
      .eq('status', 'in_progress')
      .not('fifteen_min_alert_time', 'is', null)
      .lte('fifteen_min_alert_time', thirtyMinAgo.toISOString())
      .is('check_out_time', null)

    for (const booking of lateCheckouts || []) {
      // Dedup
      const { data: existing } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('email_type', 'late_check_out')
        .limit(1)
      if (existing && existing.length > 0) continue

      await supabaseAdmin.from('email_logs').insert({
        booking_id: booking.id,
        email_type: 'late_check_out',
        recipient: booking.cleaners?.phone || 'no-phone'
      })

      // SMS + push to cleaner
      if (booking.cleaner_id) {
        notifyCleaner({
          cleanerId: booking.cleaner_id,
          type: 'job_reminder',
          title: 'Check Out Now',
          message: `Please check out for your ${booking.clients?.name || 'Client'} job — 15-min alert was 30+ min ago`,
          bookingId: booking.id,
          smsMessage: smsLateCheckOutCleaner(booking),
          skipEmail: true
        }).catch(() => {})
      }

      // SMS + push to admins
      smsAdmins(smsLateCheckOutAdmin(booking)).catch(() => {})
      sendPushToAll(
        'Late Check-Out',
        `${booking.cleaners?.name || 'Unassigned'} — ${booking.clients?.name || 'Client'} still on site`,
        '/admin/bookings'
      ).catch(() => {})

      await supabaseAdmin.from('notifications').insert({
        type: 'late_check_out',
        title: 'Late Check-Out',
        message: `${booking.cleaners?.name || 'Unassigned'} hasn't checked out for ${booking.clients?.name || 'Client'} — 30+ min since 15-min alert`,
        booking_id: booking.id
      })

      checkoutResults.push(booking.id)
    }

    return NextResponse.json({
      success: true,
      late_check_ins: results.length,
      late_check_outs: checkoutResults.length,
      bookings: [...results, ...checkoutResults]
    })
  } catch (err) {
    await trackError(err, { source: 'cron/late-check-in', severity: 'high' })
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
