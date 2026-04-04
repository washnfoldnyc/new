import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { notify } from '@/lib/notify'
import { smsAdmins } from '@/lib/admin-contacts'
import { parseTimestamp, formatET } from '@/lib/dates'

export async function POST(req: NextRequest) {
  try {
    const { bookingId } = await req.json()
    if (!bookingId) return NextResponse.json({ error: 'bookingId required' }, { status: 400 })

    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('id, start_time, end_time, check_in_time, service_type, hourly_rate, cleaner_pay_rate, price, clients(name, phone), cleaners(name, hourly_rate)')
      .eq('id', bookingId)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    const now = new Date()

    // Calculate ACTUAL hours worked: check_in_time → now
    const workStart = parseTimestamp(booking.check_in_time as string) || parseTimestamp(booking.start_time) || now
    const rawMinutes = Math.max(0, (now.getTime() - workStart.getTime()) / (1000 * 60))
    const actualHours = Math.max(0.5, Math.round(rawMinutes / 30) * 0.5)

    // Estimated total = actual hours + 15 min remaining (round up to next half hour)
    const estimatedTotalHours = Math.max(0.5, Math.ceil((rawMinutes + 15) / 30) * 0.5)

    const clientRate = booking.hourly_rate || 75
    const clientOwes = Math.round(estimatedTotalHours * clientRate)

    const cleanerRate = (booking.cleaners as unknown as { name: string; hourly_rate: number | null })?.hourly_rate || booking.cleaner_pay_rate || 25
    const cleanerOwed = Math.round(estimatedTotalHours * cleanerRate)

    const clientName = (booking.clients as unknown as { name: string; phone: string })?.name || 'Client'
    const clientPhone = (booking.clients as unknown as { name: string; phone: string })?.phone || ''
    const cleanerName = (booking.cleaners as unknown as { name: string })?.name || 'Unassigned'
    const serviceLabel = booking.service_type === 'regular' ? 'Standard' : booking.service_type === 'deep' ? 'Deep' : booking.service_type === 'move_in_out' ? 'Move-in/out' : booking.service_type || 'Cleaning'

    const checkedInAt = formatET(workStart, { hour: 'numeric', minute: '2-digit', hour12: true })

    const smsLines = [
      `15-MIN HEADS UP`,
      `${clientName} — ${serviceLabel}`,
      `Cleaner: ${cleanerName}`,
      `Checked in: ${checkedInAt} (${actualHours}hrs so far)`,
      `Est. total: ${estimatedTotalHours}hrs`,
      ``,
      `Collect $${clientOwes} (${estimatedTotalHours}hrs × $${clientRate}/hr)`,
      `Pay ${cleanerName}: $${cleanerOwed} (${estimatedTotalHours}hrs × $${cleanerRate}/hr)`,
    ]

    if (clientPhone) {
      const cleanPhone = clientPhone.replace(/\D/g, '')
      smsLines.push(``, `Client #: ${clientPhone}`)
    }

    const smsMessage = smsLines.join('\n')

    // Record the 15-min alert timestamp on the booking
    await supabaseAdmin
      .from('bookings')
      .update({ fifteen_min_alert_time: now.toISOString() })
      .eq('id', bookingId)

    // Send SMS to all admin-role users + owner
    await smsAdmins(smsMessage).catch(err => console.error('15min SMS failed:', err))

    // Also send admin notification
    await notify({
      type: '15min_warning',
      title: '15-Min Heads Up',
      message: smsMessage,
      booking_id: bookingId,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      smsSent: true,
      actualHours,
      estimatedTotalHours,
      clientOwes,
      cleanerOwed,
    })
  } catch (err) {
    console.error('15min-alert error:', err)
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 })
  }
}
