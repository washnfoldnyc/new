import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { clientCancellationEmail } from '@/lib/email-templates'
import { sendSMS } from '@/lib/sms'
import { smsCancellation, smsJobAssignment } from '@/lib/sms-templates'
import { sendPushToClient } from '@/lib/push'
import { notifyCleaner } from '@/lib/notify-cleaner'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  const { data: schedule, error } = await supabaseAdmin
    .from('recurring_schedules')
    .select('*, clients(id, name, phone, address, email), cleaners(id, name)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Get upcoming bookings for this schedule
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('id, start_time, end_time, status, cleaner_id, cleaners(name)')
    .eq('schedule_id', id)
    .gte('start_time', new Date().toISOString())
    .in('status', ['scheduled', 'pending'])
    .order('start_time')

  return NextResponse.json({ ...schedule, upcoming_bookings: bookings || [] })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params
  const body = await request.json()

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.cleaner_id !== undefined) updatePayload.cleaner_id = body.cleaner_id || null
  if (body.recurring_type !== undefined) updatePayload.recurring_type = body.recurring_type
  if (body.day_of_week !== undefined) updatePayload.day_of_week = body.day_of_week
  if (body.preferred_time !== undefined) updatePayload.preferred_time = body.preferred_time
  if (body.duration_hours !== undefined) updatePayload.duration_hours = body.duration_hours
  if (body.hourly_rate !== undefined) updatePayload.hourly_rate = body.hourly_rate
  if (body.cleaner_pay_rate !== undefined) updatePayload.cleaner_pay_rate = body.cleaner_pay_rate
  if (body.notes !== undefined) updatePayload.notes = body.notes
  if (body.special_instructions !== undefined) updatePayload.special_instructions = body.special_instructions
  if (body.status !== undefined) updatePayload.status = body.status

  const { data, error } = await supabaseAdmin
    .from('recurring_schedules')
    .update(updatePayload)
    .eq('id', id)
    .select('*, clients(id, name), cleaners(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If cleaner changed, update all future scheduled bookings in this series
  if (body.cleaner_id !== undefined) {
    await supabaseAdmin
      .from('bookings')
      .update({ cleaner_id: body.cleaner_id || null })
      .eq('schedule_id', id)
      .in('status', ['scheduled', 'pending'])
      .gte('start_time', new Date().toISOString())

    // Notify the new cleaner about the assignment
    if (body.cleaner_id) {
      try {
        // Fetch the first upcoming booking with client + cleaner data for templates
        const { data: booking } = await supabaseAdmin
          .from('bookings')
          .select('*, clients(*), cleaners(*)')
          .eq('schedule_id', id)
          .eq('cleaner_id', body.cleaner_id)
          .in('status', ['scheduled', 'pending'])
          .gte('start_time', new Date().toISOString())
          .order('start_time')
          .limit(1)
          .single()

        if (booking) {
          const clientName = booking.clients?.name || 'Client'
          const bookingDate = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          await notifyCleaner({
            cleanerId: body.cleaner_id,
            type: 'job_assignment',
            title: 'New Recurring Assignment',
            message: `You've been assigned to ${clientName}'s recurring schedule starting ${bookingDate}`,
            bookingId: booking.id,
            smsMessage: smsJobAssignment(booking),
          })
        }
      } catch {
        // Don't fail the response if notification errors
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  // Cancel the schedule
  const { data: schedule, error } = await supabaseAdmin
    .from('recurring_schedules')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, clients(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cancel all future scheduled bookings in this series
  const { data: cancelled } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('schedule_id', id)
    .in('status', ['scheduled', 'pending'])
    .gte('start_time', new Date().toISOString())
    .select('id')

  // Create notification
  await supabaseAdmin.from('notifications').insert({
    type: 'recurring_cancelled',
    title: 'Recurring Schedule Cancelled',
    message: `${schedule.clients?.name} - ${schedule.recurring_type} cancelled (${cancelled?.length || 0} future bookings)`
  })

  // Notify the client about the series cancellation
  if (cancelled && cancelled.length > 0) {
    try {
      // Fetch first affected booking with client + cleaner data for notification templates
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('*, clients(*), cleaners(*)')
        .eq('schedule_id', id)
        .eq('status', 'cancelled')
        .gte('start_time', new Date().toISOString())
        .order('start_time')
        .limit(1)
        .single()

      if (booking) {
        // Client email
        if (booking.clients?.email) {
          const emailContent = clientCancellationEmail(booking)
          sendEmail(booking.clients.email, emailContent.subject, emailContent.html).catch(() => {})
        }
        // Client SMS
        if (booking.clients?.phone && booking.client_id) {
          sendSMS(booking.clients.phone, smsCancellation(booking), {
            recipientType: 'client',
            recipientId: booking.client_id,
            smsType: 'cancellation',
            bookingId: booking.id,
          }).catch(() => {})
        }
        // Client push notification
        if (booking.client_id) {
          sendPushToClient(booking.client_id, 'Schedule Cancelled', 'Your recurring cleaning schedule has been cancelled', '/book/dashboard').catch(() => {})
        }
      }
    } catch {
      // Don't fail the response if notifications error
    }
  }

  return NextResponse.json({
    success: true,
    schedule,
    bookings_cancelled: cancelled?.length || 0
  })
}
