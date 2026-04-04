import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { generateToken } from '@/lib/tokens'
import { generateScheduleDates } from '@/lib/recurring'
import { sendEmail } from '@/lib/email'
import { clientConfirmationEmail, cleanerAssignmentEmail } from '@/lib/email-templates'
import { trackError } from '@/lib/error-tracking'
import { autoAttributeBooking } from '@/lib/attribution'
import { sendSMS } from '@/lib/sms'
import { smsBookingConfirmation, smsJobAssignment } from '@/lib/sms-templates'
import { sendPushToClient } from '@/lib/push'
import { notifyCleaner, formatDeliveryReport } from '@/lib/notify-cleaner'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { data, error } = await supabaseAdmin
    .from('recurring_schedules')
    .select('*, clients(id, name, phone, address), cleaners(id, name)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each schedule, get the next upcoming booking date
  const schedulesWithNext = await Promise.all(
    (data || []).map(async (schedule: any) => {
      const { data: nextBooking } = await supabaseAdmin
        .from('bookings')
        .select('start_time')
        .eq('schedule_id', schedule.id)
        .in('status', ['scheduled', 'pending'])
        .gte('start_time', new Date().toISOString())
        .order('start_time')
        .limit(1)
        .single()

      return {
        ...schedule,
        next_booking_date: nextBooking?.start_time || null
      }
    })
  )

  return NextResponse.json(schedulesWithNext)
}

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const body = await request.json()

  const {
    client_id,
    cleaner_id,
    recurring_type,
    day_of_week,
    preferred_time,
    duration_hours,
    hourly_rate,
    cleaner_pay_rate,
    notes,
    special_instructions,
    start_date, // YYYY-MM-DD — first booking date
    price, // pre-calculated price in cents
    service_type,
    status: bookingStatus, // status for generated bookings
  } = body

  if (!client_id || !recurring_type || !start_date) {
    return NextResponse.json({ error: 'client_id, recurring_type, and start_date are required' }, { status: 400 })
  }

  // Set next_generate_after to the last date in the initial batch (or 6 weeks from start)
  const dates = body.dates as string[] | undefined
  const lastInitialDate = dates && dates.length > 0 ? dates[dates.length - 1] : null
  const sixWeeksOut = new Date(start_date + 'T12:00:00')
  sixWeeksOut.setDate(sixWeeksOut.getDate() + 42)
  const nextGenerateAfter = lastInitialDate || sixWeeksOut.toISOString().split('T')[0]

  // Create the schedule
  const { data: schedule, error } = await supabaseAdmin
    .from('recurring_schedules')
    .insert({
      client_id,
      cleaner_id: cleaner_id || null,
      recurring_type,
      day_of_week: day_of_week ?? new Date(start_date + 'T12:00:00').getDay(),
      preferred_time: preferred_time || null,
      duration_hours: duration_hours || 3,
      hourly_rate: hourly_rate || null,
      cleaner_pay_rate: cleaner_pay_rate || null,
      notes: notes || null,
      special_instructions: special_instructions || null,
      status: 'active',
      next_generate_after: nextGenerateAfter,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generate initial bookings using the provided dates or generate them
  if (dates && dates.length > 0) {
    // Dates were provided by the frontend (from generateRecurringDates)
    const rows = dates.map((date: string) => {
      const token = generateToken()
      const normalizedTime = (preferred_time || '09:00').split(':').slice(0, 2).join(':')
      const startTime = `${date}T${normalizedTime}:00`
      const sH = parseInt(normalizedTime.split(':')[0])
      const sM = parseInt(normalizedTime.split(':')[1])
      const totalEnd = (sH + (duration_hours || 3)) * 60 + sM
      const endTime = `${date}T${String(Math.floor(totalEnd / 60) % 24).padStart(2, '0')}:${String(totalEnd % 60).padStart(2, '0')}:00`
      const tokenExpires = new Date(startTime)
      tokenExpires.setHours(tokenExpires.getHours() + 24)

      return {
        client_id,
        cleaner_id: cleaner_id || null,
        start_time: startTime,
        end_time: endTime,
        service_type: service_type || 'Standard Cleaning',
        price: price || 0,
        hourly_rate: hourly_rate || null,
        notes: notes || null,
        recurring_type,
        cleaner_token: token,
        token_expires_at: tokenExpires.toISOString(),
        status: bookingStatus || 'scheduled',
        cleaner_pay_rate: cleaner_pay_rate || null,
        schedule_id: schedule.id,
      }
    })

    const { data: bookings, error: batchError } = await supabaseAdmin
      .from('bookings')
      .insert(rows)
      .select('*, clients(*), cleaners(*)')

    if (batchError) {
      return NextResponse.json({ error: batchError.message, schedule }, { status: 500 })
    }

    // Send notifications for first booking only (rest are recurring, client already knows)
    const first = bookings?.[0]
    if (first && first.status !== 'pending') {
      try {
        // Client email
        if (first.clients?.email) {
          const email = clientConfirmationEmail(first)
          await sendEmail(first.clients.email, email.subject, email.html)
          await supabaseAdmin.from('email_logs').insert({ booking_id: first.id, email_type: 'confirmation', recipient: first.clients.email })
        }
        // Client SMS
        if (first.clients?.phone && first.client_id) {
          sendSMS(first.clients.phone, smsBookingConfirmation(first), {
            recipientType: 'client',
            recipientId: first.client_id,
            smsType: 'confirmation',
            bookingId: first.id,
          }).catch(err => console.error('Schedule confirmation SMS error:', err))
        }
        // Client push
        const bookingDate = new Date(first.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        if (first.client_id) {
          sendPushToClient(first.client_id, 'Booking Confirmed', `Your ${recurring_type} cleaning starts ${bookingDate}`, '/book/dashboard').catch(() => {})
        }
        // Cleaner email
        if (first.cleaners?.email) {
          const email = cleanerAssignmentEmail(first)
          await sendEmail(first.cleaners.email, email.subject, email.html)
          await supabaseAdmin.from('email_logs').insert({ booking_id: first.id, email_type: 'assignment', recipient: first.cleaners.email })
        }
        // Cleaner SMS + push via unified dispatch
        if (first.cleaner_id) {
          const report = await notifyCleaner({
            cleanerId: first.cleaner_id,
            type: 'job_assignment',
            title: 'New Recurring Job',
            message: `${first.clients?.name} — ${recurring_type} starting ${bookingDate}`,
            bookingId: first.id,
            smsMessage: smsJobAssignment(first),
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
        console.error('Schedule batch notification error:', emailError)
        await trackError(emailError, { source: 'api/recurring-schedules/create', severity: 'high', extra: 'Schedule creation notification failed' })
      }
    }

    // Auto-attribute first booking
    if (first) {
      try {
        await autoAttributeBooking(first.id, first.client_id, first.created_at)
      } catch (attrErr) {
        console.error('Attribution error:', attrErr)
      }
    }

    return NextResponse.json({ schedule, bookings_created: bookings?.length || 0 })
  }

  return NextResponse.json({ schedule, bookings_created: 0 })
}
