import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { smsAdmins } from '@/lib/admin-contacts'
import { sendPushToAll } from '@/lib/push'
import { sendPushToClient } from '@/lib/push'
import { notify } from '@/lib/notify'
import { sendSMS } from '@/lib/sms'

export async function POST(request: Request) {
  try {
    const { bookingId, cleanerId, eta } = await request.json()

    if (!bookingId || !cleanerId) {
      return NextResponse.json({ error: 'bookingId and cleanerId required' }, { status: 400 })
    }

    // Verify booking belongs to this cleaner
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('id, start_time, cleaner_id, client_id, clients(name, phone), cleaners(name)')
      .eq('id', bookingId)
      .eq('cleaner_id', cleanerId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const cleanerName = (booking.cleaners as any)?.name || 'Cleaner'
    const clientName = (booking.clients as any)?.name || 'Client'
    const time = new Date(booking.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const etaText = eta ? ` — ETA ${eta} min` : ''

    // Record on the booking
    await supabaseAdmin
      .from('bookings')
      .update({ running_late_at: new Date().toISOString(), running_late_eta: eta || null })
      .eq('id', bookingId)

    // Dashboard notification
    await notify({
      type: 'late_check_in' as any,
      title: 'Running Late',
      message: `${cleanerName} is running late for ${clientName} (${time})${etaText}`,
      booking_id: bookingId,
      url: '/admin/bookings',
    })

    // SMS to admins
    smsAdmins(`Wash and Fold NYC: ${cleanerName} running late for ${time} job (${clientName})${etaText}`).catch(() => {})

    // Push to admins
    sendPushToAll('Running Late', `${cleanerName} — ${clientName} at ${time}${etaText}`, '/admin/bookings').catch(() => {})

    // SMS to client — professional, no blame, with ETA
    const clientPhone = (booking.clients as any)?.phone
    const clientId = booking.client_id
    if (clientPhone && clientId) {
      const cleanerFirst = cleanerName.split(' ')[0]
      const clientSms = eta
        ? `Wash and Fold NYC: Hi! ${cleanerFirst} is running a few minutes behind and will arrive in approximately ${eta} minutes. We apologize for the delay. Questions? (917) 970-6002`
        : `Wash and Fold NYC: Hi! ${cleanerFirst} is running a few minutes behind schedule. They'll be there shortly. We apologize for the delay. Questions? (917) 970-6002`
      sendSMS(clientPhone, clientSms, {
        recipientType: 'client',
        recipientId: clientId,
        smsType: 'running_late',
        bookingId,
      }).catch(() => {})
      sendPushToClient(clientId, 'Cleaner Running Late', `${cleanerFirst} is running a few minutes behind — they'll be there shortly`, '/book/dashboard').catch(() => {})
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Running late error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
