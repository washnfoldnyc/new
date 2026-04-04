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

export async function GET(request: Request) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  let query = supabaseAdmin
    .from('bookings')
    .select('*, clients(*), cleaners(*)')
    .order('start_time', { ascending: true })

  if (from) query = query.gte('start_time', from + 'T00:00:00')
  if (to) query = query.lte('start_time', to + 'T23:59:59')
  if (!from && !to) query = query.limit(10000)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  const body = await request.json()

  // Block "do not service" clients
  if (body.client_id && !body.force) {
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('name, do_not_service')
      .eq('id', body.client_id)
      .single()
    if (client?.do_not_service) {
      return NextResponse.json({
        error: `${client.name} is marked "Do Not Service". Cannot create booking.`,
        blocked: true,
      }, { status: 409 })
    }
  }

  // Block holidays
  if (body.start_time && !body.force) {
    const { isHoliday } = await import('@/lib/holidays')
    const holidayName = isHoliday(body.start_time.split('T')[0])
    if (holidayName) {
      return NextResponse.json({ error: `Cannot schedule on ${holidayName}. We're closed for the holiday.` }, { status: 400 })
    }
  }

  // Validate cleaner availability before assignment
  if (body.cleaner_id && body.start_time && !body.force) {
    const bookingDate = body.start_time.split('T')[0]
    const dayOfWeek = new Date(bookingDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })

    const { data: cleaner } = await supabaseAdmin
      .from('cleaners')
      .select('name, unavailable_dates, working_days, schedule, max_jobs_per_day')
      .eq('id', body.cleaner_id)
      .single()

    if (cleaner) {
      if (cleaner.unavailable_dates && Array.isArray(cleaner.unavailable_dates) && cleaner.unavailable_dates.includes(bookingDate)) {
        return NextResponse.json({
          error: `${cleaner.name} has requested ${bookingDate} off. Cannot assign.`,
          unavailable: true, reason: 'day_off'
        }, { status: 409 })
      }
      if (cleaner.working_days && Array.isArray(cleaner.working_days) && cleaner.working_days.length > 0 && !cleaner.working_days.includes(dayOfWeek)) {
        return NextResponse.json({
          error: `${cleaner.name} does not work on ${dayOfWeek}s.`,
          unavailable: true, reason: 'not_working_day'
        }, { status: 409 })
      }
      if (cleaner.schedule && typeof cleaner.schedule === 'object' && Object.keys(cleaner.schedule).length > 0) {
        const daySchedule = cleaner.schedule[dayOfWeek] as { start?: string; end?: string } | null | undefined
        if (daySchedule === null || daySchedule === undefined) {
          return NextResponse.json({
            error: `${cleaner.name} is not scheduled to work on ${dayOfWeek}s.`,
            unavailable: true, reason: 'not_scheduled'
          }, { status: 409 })
        }
        // Check if booking falls within cleaner's working hours
        if (daySchedule.start && daySchedule.end) {
          const parseSchedTime = (t: string): number => {
            const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
            if (!m) return 0
            let h = parseInt(m[1]); const min = parseInt(m[2]); const ap = m[3]?.toUpperCase()
            if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
            return h * 60 + min
          }
          const schedStart = parseSchedTime(daySchedule.start)
          const schedEnd = parseSchedTime(daySchedule.end)
          const bookingTime = body.start_time.split('T')[1]?.substring(0, 5) || '09:00'
          const [bh, bm] = bookingTime.split(':').map(Number)
          const bookStart = bh * 60 + bm
          const bookEnd = bookStart + (body.estimated_hours || 2) * 60
          if (bookStart < schedStart) {
            return NextResponse.json({
              error: `${cleaner.name} doesn't start until ${daySchedule.start} on ${dayOfWeek}s.`,
              unavailable: true, reason: 'before_schedule'
            }, { status: 409 })
          }
          if (bookEnd > schedEnd) {
            return NextResponse.json({
              error: `${cleaner.name} is off by ${daySchedule.end} on ${dayOfWeek}s. Booking would end at ${Math.floor(bookEnd / 60)}:${String(bookEnd % 60).padStart(2, '0')}.`,
              unavailable: true, reason: 'after_schedule'
            }, { status: 409 })
          }
        }
      }

      // Check max jobs per day
      if (cleaner.max_jobs_per_day) {
        const { count } = await supabaseAdmin
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('cleaner_id', body.cleaner_id)
          .gte('start_time', bookingDate + 'T00:00:00')
          .lte('start_time', bookingDate + 'T23:59:59')
          .in('status', ['scheduled', 'pending', 'in_progress'])
        if ((count || 0) >= cleaner.max_jobs_per_day) {
          return NextResponse.json({
            error: `${cleaner.name} already has ${count} jobs on ${bookingDate} (max ${cleaner.max_jobs_per_day}/day).`,
            unavailable: true, reason: 'max_jobs'
          }, { status: 409 })
        }
      }
    }
  }

  // Prevent duplicate client booking on same date
  if (body.client_id && body.start_time) {
    const bookingDate = body.start_time.split('T')[0]
    const { count } = await supabaseAdmin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', body.client_id)
      .gte('start_time', bookingDate + 'T00:00:00')
      .lte('start_time', bookingDate + 'T23:59:59')
      .in('status', ['scheduled', 'pending', 'confirmed', 'in_progress'])
    if ((count || 0) > 0) {
      return NextResponse.json({
        error: 'This client already has a booking on ' + bookingDate,
        duplicate: true,
      }, { status: 409 })
    }
  }

  const cleanerToken = generateToken()
  const tokenExpiresAt = new Date(body.start_time)
  tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24)

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .insert({
      client_id: body.client_id,
      cleaner_id: body.cleaner_id || null,
      start_time: body.start_time,
      end_time: body.end_time,
      service_type: body.service_type,
      price: body.price,
      hourly_rate: body.hourly_rate || null,
      notes: body.notes,
      recurring_type: body.recurring_type,
      cleaner_token: cleanerToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      status: body.status || 'scheduled',
      cleaner_pay_rate: body.cleaner_pay_rate || null,
      schedule_id: body.schedule_id || null
    })
    .select('*, clients(*), cleaners(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send notifications (skip for recurring bookings after the first, and skip for pending bookings)
  if (!body.skip_email && data.status !== 'pending') {
    try {
      // Client email
      if (data.clients?.email) {
        const clientEmail = clientConfirmationEmail(data)
        await sendEmail(data.clients.email, clientEmail.subject, clientEmail.html)
        await supabaseAdmin.from('email_logs').insert({ booking_id: data.id, email_type: 'confirmation', recipient: data.clients.email })
      }
      // Client SMS
      if (data.clients?.phone && data.client_id) {
        sendSMS(data.clients.phone, smsBookingConfirmation(data), {
          recipientType: 'client',
          recipientId: data.client_id,
          smsType: 'confirmation',
          bookingId: data.id,
        }).catch(err => console.error('Client confirmation SMS error:', err))
      }
      // Client push
      const bookingDate = new Date(data.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      if (data.client_id) {
        sendPushToClient(data.client_id, 'Booking Confirmed', `Your cleaning on ${bookingDate} is confirmed`, '/book/dashboard').catch(() => {})
      }
      // Cleaner email + SMS + push via unified dispatch
      if (data.cleaners?.email) {
        const cleanerEmail = cleanerAssignmentEmail(data)
        await sendEmail(data.cleaners.email, cleanerEmail.subject, cleanerEmail.html)
        await supabaseAdmin.from('email_logs').insert({ booking_id: data.id, email_type: 'assignment', recipient: data.cleaners.email })
      }
      if (data.cleaner_id) {
        const report = await notifyCleaner({
          cleanerId: data.cleaner_id,
          type: 'job_assignment',
          title: 'New Job Assigned',
          message: `${data.clients?.name} on ${bookingDate}`,
          bookingId: data.id,
          smsMessage: smsJobAssignment(data),
          skipEmail: true
        })
        await supabaseAdmin.from('notifications').insert({
          type: 'cleaner_notified',
          title: 'Cleaner Notified',
          message: `${report.cleanerName}: ${formatDeliveryReport(report)}`,
          booking_id: data.id
        })
      }
    } catch (emailError) {
      console.error('Booking notification error:', emailError)
      await trackError(emailError, { source: 'api/bookings', severity: 'high', extra: `Booking ${data.id} notification failed` })
    }
  }

  // Auto-attribute booking to lead source
  try {
    await autoAttributeBooking(data.id, data.client_id, data.created_at)
  } catch (attrErr) {
    console.error('Attribution error:', attrErr)
  }

  return NextResponse.json(data)
}
