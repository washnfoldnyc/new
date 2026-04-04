import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { scoreCleanersForBooking } from '@/lib/smart-schedule'

export async function GET(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const startTime = searchParams.get('start_time')
  const duration = searchParams.get('duration')
  const clientAddress = searchParams.get('address')
  const clientId = searchParams.get('client_id')
  const excludeBookingId = searchParams.get('exclude_booking')

  if (!date || !startTime || !clientAddress) {
    return NextResponse.json({ error: 'date, start_time, and address required' }, { status: 400 })
  }

  const scores = await scoreCleanersForBooking({
    date,
    startTime,
    durationHours: duration ? parseFloat(duration) : 2,
    clientAddress,
    clientId: clientId || undefined,
    excludeBookingId: excludeBookingId || undefined,
  })

  return NextResponse.json({ cleaners: scores })
}
