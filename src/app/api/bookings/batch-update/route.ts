import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { clientConfirmationEmail, cleanerAssignmentEmail, cleanerRescheduleEmail } from '@/lib/email-templates'
import { protectAdminAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'
import { notifyCleaner, formatDeliveryReport } from '@/lib/notify-cleaner'
import { smsJobRescheduled } from '@/lib/sms-templates'

/**
 * Batch update multiple bookings in parallel.
 * Sends ONE notification + ONE set of emails (for the first booking only).
 * Used for "all future bookings" edits on recurring series.
 */
export async function PUT(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { updates, notify_type } = await request.json()

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates array required' }, { status: 400 })
  }

  // Run all updates in parallel
  const results = await Promise.all(
    updates.map(async (u: { id: string; data: Record<string, unknown> }) => {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .update(u.data)
        .eq('id', u.id)
        .select('*, clients(*), cleaners(*)')
        .maybeSingle()
      if (!data && !error) return { id: u.id, data: null, error: { message: `Booking ${u.id} not found` } }
      return { id: u.id, data, error }
    })
  )

  const failed = results.filter(r => r.error)
  if (failed.length > 0) {
    return NextResponse.json({
      error: `${failed.length}/${results.length} updates failed`,
      details: failed.map(f => ({ id: f.id, error: f.error?.message }))
    }, { status: 500 })
  }

  // Send ONE notification for the batch
  const first = results[0].data
  if (first) {
    const bookingDate = (() => {
      const [dp, tp] = first.start_time.split('T')
      const [y, m, d] = dp.split('-').map(Number)
      const [h, min] = (tp || '00:00').split(':').map(Number)
      return new Date(y, m - 1, d, h, min).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    })()

    await supabaseAdmin.from('notifications').insert({
      type: notify_type || 'booking_updated',
      title: 'Series Updated',
      message: `${first.clients?.name} - ${results.length} bookings updated from ${bookingDate}`,
      booking_id: first.id
    })

    // Send ONE email to client + cleaner (for the first booking only)
    try {
      if (notify_type === 'rescheduled' && first.cleaners?.email) {
        const [dp, tp] = first.start_time.split('T')
        const [y, m, d] = dp.split('-').map(Number)
        const [h, min] = (tp || '00:00').split(':').map(Number)
        const dateObj = new Date(y, m - 1, d, h, min)
        const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const email = cleanerRescheduleEmail(first, dateStr, timeStr)
        await sendEmail(first.cleaners.email, email.subject, email.html)
      }

      if (first.cleaner_id && notify_type === 'rescheduled') {
        const report = await notifyCleaner({
          cleanerId: first.cleaner_id,
          type: 'job_rescheduled',
          title: 'Schedule Updated',
          message: `${first.clients?.name} - ${results.length} bookings updated`,
          bookingId: first.id,
          smsMessage: smsJobRescheduled(first),
          skipEmail: true
        })
        await supabaseAdmin.from('notifications').insert({
          type: 'cleaner_notified',
          title: 'Cleaner Notified',
          message: `${report.cleanerName}: ${formatDeliveryReport(report)}`,
          booking_id: first.id
        })
      }
    } catch (emailError) {
      console.error('Batch update email error:', emailError)
      await trackError(emailError, { source: 'api/bookings/batch-update', severity: 'high', extra: `Batch update email failed` })
    }
  }

  return NextResponse.json({ updated: results.length })
}
