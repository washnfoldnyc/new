import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { notify } from '@/lib/notify'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cleanerId = searchParams.get('cleaner_id')

  if (!cleanerId) {
    return NextResponse.json({ error: 'Missing cleaner_id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cleaners')
    .select('working_days, schedule, unavailable_dates, photo_url, max_jobs_per_day')
    .eq('id', cleanerId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Cleaner not found' }, { status: 404 })
  }

  return NextResponse.json({
    working_days: data.working_days || [],
    schedule: data.schedule || {},
    unavailable_dates: data.unavailable_dates || [],
    photo_url: data.photo_url || null,
    max_jobs_per_day: data.max_jobs_per_day || null
  })
}

export async function PUT(request: Request) {
  const body = await request.json()
  const { cleaner_id, working_days, schedule, unavailable_dates, max_jobs_per_day } = body

  if (!cleaner_id) {
    return NextResponse.json({ error: 'Missing cleaner_id' }, { status: 400 })
  }

  // Strip past dates from unavailable_dates
  const today = new Date().toISOString().split('T')[0]
  const futureDates = (unavailable_dates || []).filter((d: string) => d >= today)

  // Get current unavailable_dates to detect NEW dates being added
  const { data: current } = await supabaseAdmin
    .from('cleaners')
    .select('name, unavailable_dates')
    .eq('id', cleaner_id)
    .single()

  const currentDates = new Set(current?.unavailable_dates || [])
  const newDatesRequested = futureDates.filter((d: string) => !currentDates.has(d))

  // Check if cleaner has bookings on any newly requested dates
  if (newDatesRequested.length > 0) {
    const blockedDates: string[] = []

    for (const date of newDatesRequested) {
      const dayStart = `${date}T00:00:00`
      const dayEnd = `${date}T23:59:59`

      const { data: bookings } = await supabaseAdmin
        .from('bookings')
        .select('id, start_time, clients(name)')
        .eq('cleaner_id', cleaner_id)
        .in('status', ['scheduled', 'pending', 'in_progress'])
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .limit(1)

      if (bookings && bookings.length > 0) {
        const clientName = (bookings[0].clients as any)?.name || 'a client'
        blockedDates.push(`${date} (booked with ${clientName})`)
      }
    }

    if (blockedDates.length > 0) {
      return NextResponse.json({
        error: `Cannot request time off on dates with existing bookings: ${blockedDates.join(', ')}. Contact admin to reschedule first.`,
        blocked_dates: blockedDates,
      }, { status: 409 })
    }
  }

  const { error } = await supabaseAdmin
    .from('cleaners')
    .update({
      working_days: working_days || [],
      schedule: schedule || {},
      unavailable_dates: futureDates,
      max_jobs_per_day: max_jobs_per_day || null
    })
    .eq('id', cleaner_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Notify admin about new time-off requests
  if (newDatesRequested.length > 0) {
    const cleanerName = current?.name || 'A cleaner'
    const dateList = newDatesRequested.map((d: string) => {
      const date = new Date(d + 'T12:00:00')
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }).join(', ')

    await notify({
      type: 'time_off_request',
      title: `Time Off — ${cleanerName}`,
      message: `${cleanerName} requested time off: ${dateList}`,
    })
  }

  return NextResponse.json({ success: true })
}
