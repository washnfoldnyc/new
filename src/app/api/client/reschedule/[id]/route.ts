import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { emailAdmins } from '@/lib/admin-contacts'
import { clientRescheduleEmail, adminRescheduleEmail, cleanerRescheduleEmail } from '@/lib/email-templates'
import { notifyCleaner } from '@/lib/notify-cleaner'
import { smsJobRescheduled, smsReschedule } from '@/lib/sms-templates'
import { sendSMS } from '@/lib/sms'
import { sendPushToClient } from '@/lib/push'
import { protectClientAPI, isAdminAuthenticated } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  // Get the current booking before updating (for old date/time in emails)
  const { data: oldBooking } = await supabaseAdmin
    .from('bookings')
    .select('*, clients(*), cleaners(*)')
    .eq('id', id)
    .single()

  // Allow admin or authenticated client who owns this booking
  if (oldBooking) {
    const isAdmin = await isAdminAuthenticated()
    if (!isAdmin) {
      const auth = await protectClientAPI(oldBooking.client_id)
      if (auth instanceof NextResponse) return auth
    }
  }

  const oldDate = oldBooking ? new Date(oldBooking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
  const oldTime = oldBooking ? new Date(oldBooking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      start_time: body.start_time,
      end_time: body.end_time,
      cleaner_id: body.cleaner_id
    })
    .eq('id', id)
    .select('*, clients(*), cleaners(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add notification
  await supabaseAdmin.from('notifications').insert({
    booking_id: id,
    type: 'reschedule',
    message: 'Booking rescheduled for ' + (data.clients?.name || 'Unknown') + ' to ' + new Date(body.start_time).toLocaleDateString() + ' • by Client'
  })

  // Send emails, SMS, and push notifications
  try {
    // 1. Client confirmation email
    if (data.clients?.email) {
      const email = clientRescheduleEmail(data, oldDate, oldTime)
      await sendEmail(data.clients.email, email.subject, email.html)
      await supabaseAdmin.from('email_logs').insert({ booking_id: id, email_type: 'client_reschedule', recipient: data.clients.email })
    }

    // 2. Client SMS
    if (data.clients?.phone) {
      await sendSMS(data.clients.phone, smsReschedule(data), { recipientType: 'client', recipientId: data.client_id, smsType: 'reschedule', bookingId: id })
    }

    // 3. Client push notification
    if (data.client_id) {
      const newDate = new Date(body.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      await sendPushToClient(data.client_id, 'Booking Rescheduled', `Your cleaning has been moved to ${newDate}`, '/book/dashboard')
    }

    // 4. Admin notification email
    const adminEmail = adminRescheduleEmail(data, oldDate, oldTime)
    await emailAdmins(adminEmail.subject, adminEmail.html)

    // 5. Cleaner notification email
    if (data.cleaners?.email) {
      const email = cleanerRescheduleEmail(data, oldDate, oldTime)
      await sendEmail(data.cleaners.email, email.subject, email.html)
      await supabaseAdmin.from('email_logs').insert({ booking_id: id, email_type: 'cleaner_reschedule', recipient: data.cleaners.email })
    }
    // Cleaner notification via unified dispatch
    if (data.cleaner_id) {
      const newDate = new Date(body.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      await notifyCleaner({
        cleanerId: data.cleaner_id,
        type: 'job_rescheduled',
        title: 'Job Rescheduled',
        message: `${data.clients?.name} moved to ${newDate}`,
        bookingId: id,
        smsMessage: smsJobRescheduled(data),
        skipEmail: true // already sent above
      })
    }
  } catch (emailError) {
    console.error('Reschedule notification error:', emailError)
  }

  return NextResponse.json(data)
}
