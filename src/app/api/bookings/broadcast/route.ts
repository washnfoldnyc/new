import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { protectAdminAPI } from '@/lib/auth'
import { sendPushToAllCleaners } from '@/lib/push'
import { notifyCleaner, formatDeliveryReport } from '@/lib/notify-cleaner'
import { smsUrgentBroadcast } from '@/lib/sms-templates'

// POST - Broadcast an available job to all active cleaners
export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const body = await request.json()
  const { booking_id } = body

  if (!booking_id) {
    return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
  }

  // Get the booking
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*, clients(*)')
    .eq('id', booking_id)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // Get all active cleaners with email
  const { data: cleaners } = await supabaseAdmin
    .from('cleaners')
    .select('*')
    .eq('active', true)
    .not('email', 'is', null)

  if (!cleaners || cleaners.length === 0) {
    return NextResponse.json({ error: 'No active cleaners with email' }, { status: 400 })
  }

  const jobDate = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const jobTime = new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = new Date(booking.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const hours = Math.round((new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / (1000 * 60 * 60))
  const payRate = booking.cleaner_pay_rate || 40

  // Build the email HTML for broadcast
  const broadcastHtml = `
    <div style="font-family: sans-serif; max-width: 500px;">
      <div style="background: #dc2626; color: white; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">URGENT JOB AVAILABLE</h1>
        <p style="margin: 5px 0 0 0; opacity: 0.9;">First to claim gets it!</p>
      </div>
      <div style="background: #fef2f2; padding: 20px; border: 2px solid #fecaca;">
        <p style="font-size: 28px; font-weight: bold; color: #16a34a; margin: 0 0 10px 0;">$${payRate}/hr</p>
        <p style="margin: 5px 0;"><strong>Date:</strong> ${jobDate}</p>
        <p style="margin: 5px 0;"><strong>Time:</strong> ${jobTime} - ${endTime} (~${hours}hrs)</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> ${booking.clients?.address || 'TBD'}</p>
        <p style="margin: 5px 0;"><strong>Service:</strong> ${booking.service_type}</p>
        ${booking.notes ? `<p style="margin: 10px 0; padding: 10px; background: #fef9c3; border-radius: 6px;"><strong>Notes:</strong> ${booking.notes}</p>` : ''}
      </div>
      <div style="padding: 20px; text-align: center;">
        <a href="https://www.thenycmaid.com/team" style="display: inline-block; background: #dc2626; color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px;">
          CLAIM NOW / RECLAMAR
        </a>
        <p style="margin-top: 15px; color: #666; font-size: 14px;">
          Log in to your team portal to claim this job<br/>
          Inicia sesion en tu portal para reclamar
        </p>
      </div>
    </div>
  `

  // Send via unified dispatch to each cleaner
  const reports = []
  for (const cleaner of cleaners) {
    const report = await notifyCleaner({
      cleanerId: cleaner.id,
      type: 'broadcast',
      title: `Urgent: $${payRate}/hr Job Available`,
      message: `${jobDate} ${jobTime} - ${endTime}`,
      bookingId: booking_id,
      smsMessage: smsUrgentBroadcast(booking),
      emailSubject: `URGENT: $${payRate}/hr Job Available - ${jobDate}`,
      emailHtml: broadcastHtml
    })
    reports.push(report)
  }

  // Also send push to all cleaners (covers any without individual subscriptions)
  sendPushToAllCleaners(
    `Urgent: $${payRate}/hr Job Available`,
    `${jobDate} ${jobTime} - ${endTime}`,
    '/team/dashboard'
  ).catch(() => {})

  const sentCount = reports.filter(r => r.push || r.email || r.sms).length

  // Create admin notification with delivery summary
  const deliverySummary = reports.map(r => `${r.cleanerName}: push ${r.push ? '\u2713' : '\u2717'} email ${r.email ? '\u2713' : '\u2717'} sms ${r.sms ? '\u2713' : '\u2717'}`).join(', ')
  await supabaseAdmin.from('notifications').insert({
    type: 'job_broadcast',
    title: 'Job Broadcast Sent',
    message: `Sent to ${sentCount} team members. ${deliverySummary}`
  })

  return NextResponse.json({ success: true, sentTo: sentCount, reports })
}
