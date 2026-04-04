import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateToken } from '@/lib/tokens'
import { sendEmail } from '@/lib/email'
import { clientConfirmationEmail, cleanerAssignmentEmail } from '@/lib/email-templates'
import { protectAdminAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'
import { autoAttributeBooking } from '@/lib/attribution'
import { sendSMS } from '@/lib/sms'
import { smsBookingConfirmation, smsJobAssignment } from '@/lib/sms-templates'
import { sendPushToClient } from '@/lib/push'
import { notifyCleaner, formatDeliveryReport } from '@/lib/notify-cleaner'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { bookings: bookingInputs, schedule_id } = await request.json()

  if (!Array.isArray(bookingInputs) || bookingInputs.length === 0) {
    return NextResponse.json({ error: 'bookings array required' }, { status: 400 })
  }

  // Build all rows with tokens
  const rows = bookingInputs.map((b: Record<string, unknown>) => {
    const token = generateToken()
    const tokenExpires = new Date(b.start_time as string)
    tokenExpires.setHours(tokenExpires.getHours() + 24)

    return {
      client_id: b.client_id,
      cleaner_id: b.cleaner_id || null,
      start_time: b.start_time,
      end_time: b.end_time,
      service_type: b.service_type,
      price: b.price,
      hourly_rate: b.hourly_rate || null,
      notes: b.notes || null,
      recurring_type: b.recurring_type || null,
      cleaner_token: token,
      token_expires_at: tokenExpires.toISOString(),
      status: (b.status as string) || 'scheduled',
      cleaner_pay_rate: b.cleaner_pay_rate || null,
      schedule_id: (b.schedule_id as string) || schedule_id || null,
    }
  })

  // Single batch insert
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .insert(rows)
    .select('*, clients(*), cleaners(*)')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notifications only for the FIRST booking (the rest are recurring copies)
  const first = data[0]
  if (first && first.status !== 'pending') {
    try {
      // Email notifications
      if (first.clients?.email) {
        const email = clientConfirmationEmail(first)
        await sendEmail(first.clients.email, email.subject, email.html)
        await supabaseAdmin.from('email_logs').insert({ booking_id: first.id, email_type: 'confirmation', recipient: first.clients.email })
      }
      if (first.cleaners?.email) {
        const email = cleanerAssignmentEmail(first)
        await sendEmail(first.cleaners.email, email.subject, email.html)
        await supabaseAdmin.from('email_logs').insert({ booking_id: first.id, email_type: 'assignment', recipient: first.cleaners.email })
      }
      // SMS confirmation to client
      if (first.clients?.phone && first.client_id) {
        sendSMS(first.clients.phone, smsBookingConfirmation(first), {
          recipientType: 'client',
          recipientId: first.client_id,
          smsType: 'confirmation',
          bookingId: first.id,
        }).catch(err => console.error('Batch client confirmation SMS error:', err))
      }
      // Push notification to client
      const bookingDate = new Date(first.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      if (first.client_id) {
        sendPushToClient(first.client_id, 'Booking Confirmed', `Your cleaning on ${bookingDate} is confirmed`, '/book/dashboard').catch(() => {})
      }
      // Cleaner notification via unified dispatch
      if (first.cleaner_id) {
        const report = await notifyCleaner({
          cleanerId: first.cleaner_id,
          type: 'job_assignment',
          title: 'New Job Assigned',
          message: `${first.clients?.name} on ${bookingDate}`,
          bookingId: first.id,
          smsMessage: smsJobAssignment(first),
          skipEmail: true // already sent above
        })
        await supabaseAdmin.from('notifications').insert({
          type: 'cleaner_notified',
          title: 'Cleaner Notified',
          message: `${report.cleanerName}: ${formatDeliveryReport(report)}`,
          booking_id: first.id
        })
      }
    } catch (emailError) {
      console.error('Batch notification error:', emailError)
      await trackError(emailError, { source: 'api/bookings/batch', severity: 'high', extra: `Batch booking notification failed` })
    }
  }

  // Auto-attribute first booking
  try {
    await autoAttributeBooking(first.id, first.client_id, first.created_at)
  } catch (attrErr) {
    console.error('Attribution error:', attrErr)
  }

  return NextResponse.json({ created: data.length, bookings: data })
}
