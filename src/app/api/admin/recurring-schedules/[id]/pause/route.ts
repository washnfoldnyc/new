import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { clientCancellationEmail } from '@/lib/email-templates'
import { sendSMS } from '@/lib/sms'
import { smsCancellation } from '@/lib/sms-templates'
import { sendPushToClient } from '@/lib/push'

// POST: Pause schedule until a date
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params
  const body = await request.json()
  const { paused_until } = body

  if (!paused_until) {
    return NextResponse.json({ error: 'paused_until date is required' }, { status: 400 })
  }

  // Update schedule status to paused
  const { data: schedule, error } = await supabaseAdmin
    .from('recurring_schedules')
    .update({
      status: 'paused',
      paused_until,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*, clients(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Cancel bookings that fall within the pause window
  const now = new Date().toISOString()
  const pauseEnd = paused_until + 'T23:59:59'

  const { data: cancelled } = await supabaseAdmin
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('schedule_id', id)
    .in('status', ['scheduled', 'pending'])
    .gte('start_time', now)
    .lte('start_time', pauseEnd)
    .select('id')

  await supabaseAdmin.from('notifications').insert({
    type: 'recurring_paused',
    title: 'Schedule Paused',
    message: `${schedule.clients?.name} - ${schedule.recurring_type} paused until ${paused_until} (${cancelled?.length || 0} bookings cancelled)`
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
        .gte('start_time', now)
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
          sendPushToClient(booking.client_id, 'Schedule Paused', `Your recurring cleaning has been paused until ${paused_until}`, '/book/dashboard').catch(() => {})
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

// DELETE: Resume schedule early (un-pause)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  const { data: schedule, error } = await supabaseAdmin
    .from('recurring_schedules')
    .update({
      status: 'active',
      paused_until: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*, clients(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabaseAdmin.from('notifications').insert({
    type: 'recurring_resumed',
    title: 'Schedule Resumed',
    message: `${schedule.clients?.name} - ${schedule.recurring_type} resumed`
  })

  return NextResponse.json({ success: true, schedule })
}
