import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress, calculateDistance, MAX_DISTANCE_MILES } from '@/lib/geo'
import { notify } from '@/lib/notify'
import { sendPushToClient } from '@/lib/push'
import { sendSMS } from '@/lib/sms'

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await request.json()

  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('*, clients(*), cleaners(*)')
    .eq('cleaner_token', token)
    .single()

  if (!booking) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  // Prevent check-in on future bookings (must be today or earlier)
  const bookingDate = booking.start_time.split('T')[0]
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  if (bookingDate > today) {
    return NextResponse.json({ error: 'Cannot check in for a future booking. This job is scheduled for ' + bookingDate }, { status: 400 })
  }

  // Prevent double check-in
  if (booking.check_in_time) {
    return NextResponse.json({ error: 'Already checked in' }, { status: 400 })
  }

  // GPS verification
  let enrichedLocation = body.location || null
  let distanceInfo = ''
  let flagged = false

  if (body.location?.lat && body.location?.lng && booking.clients?.address) {
    try {
      const addressCoords = await geocodeAddress(booking.clients.address)
      if (addressCoords) {
        const distance = calculateDistance(
          body.location.lat, body.location.lng,
          addressCoords.lat, addressCoords.lng
        )
        flagged = distance > MAX_DISTANCE_MILES
        enrichedLocation = {
          ...body.location,
          distance_miles: Math.round(distance * 100) / 100,
          address_lat: addressCoords.lat,
          address_lng: addressCoords.lng,
          flagged
        }
        distanceInfo = ` • ${distance.toFixed(2)} mi from address`
        if (flagged) distanceInfo += ' ⚠️'
      }
    } catch (e) {
      console.error('GPS verification error:', e)
    }
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .update({
      status: 'in_progress',
      check_in_time: new Date().toISOString(),
      check_in_location: enrichedLocation
    })
    .eq('id', booking.id)
    .select('*, clients(*), cleaners(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Create notification + push
  const checkInTitle = flagged ? 'WARNING: Job Started (GPS Mismatch)' : 'Job Started'
  await notify({ type: 'check_in', title: checkInTitle, message: `${data.cleaners?.name} checked in at ${data.clients?.name}${distanceInfo}`, booking_id: data.id })

  // Push to client
  if (data.client_id) {
    sendPushToClient(data.client_id, 'Your cleaner has arrived!', `${data.cleaners?.name} has checked in`, '/book/dashboard').catch(() => {})
  }

  // Auto-text client: cleaner has arrived (DISABLED — enable when ready)
  // if (data.clients?.phone) {
  //   const cleanerFirst = data.cleaners?.name?.split(' ')[0] || 'Your cleaner'
  //   sendSMS(
  //     data.clients.phone.startsWith('+') ? data.clients.phone : `+1${data.clients.phone.replace(/\D/g, '')}`,
  //     `Hi ${data.clients.name?.split(' ')[0] || 'there'}! ${cleanerFirst} has arrived and is getting started. If you have any questions, text or call (212) 202-8400. Thank you for choosing The NYC Maid!`,
  //     { skipConsent: false, smsType: 'check_in' }
  //   ).catch(() => {})
  // }

  return NextResponse.json(data)
}
