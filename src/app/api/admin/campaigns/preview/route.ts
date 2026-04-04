import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { emailWrapper } from '@/lib/email-templates'

export async function POST(request: Request) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  try {
    const { audience_filter, email_body, channel, contact_filter } = await request.json()

    // Base query — all non-DNS clients
    let query = supabaseAdmin
      .from('clients')
      .select('id, name, email, phone, email_marketing_opt_out, sms_marketing_opt_out, active, created_at', { count: 'exact', head: false })
      .eq('do_not_service', false)
      .limit(10000)

    if (audience_filter === 'active') {
      query = query.eq('active', true)
    }

    const { data: allClients, count, error: clientsError } = await query

    if (clientsError || !allClients) {
      console.error('Campaign preview clients error:', clientsError)
      return NextResponse.json({ totalClients: 0, emailCount: 0, smsCount: 0, previewHtml: null, clients: [], error: 'Failed to fetch clients' })
    }

    // Apply contact filter by joining with bookings data
    let filteredClients = allClients

    if (contact_filter && contact_filter !== 'all') {
      const { data: bookings, error: bookingsError } = await supabaseAdmin
        .from('bookings')
        .select('client_id, status, start_time, recurring_type, price')
        .in('status', ['completed', 'scheduled', 'in_progress'])
        .limit(10000)

      if (bookingsError) {
        console.error('Campaign preview bookings error:', bookingsError)
        return NextResponse.json({ error: `Bookings query failed: ${bookingsError.message}` }, { status: 500 })
      }

      const bookingsByClient = new Map<string, NonNullable<typeof bookings>>()
      if (bookings) {
        for (const b of bookings) {
          if (!bookingsByClient.has(b.client_id)) bookingsByClient.set(b.client_id, [])
          bookingsByClient.get(b.client_id)!.push(b)
        }
      }

      const now = Date.now()
      const DAY_MS = 1000 * 60 * 60 * 24

      filteredClients = allClients.filter(client => {
        const cb = bookingsByClient.get(client.id) || []

        switch (contact_filter) {
          case 'on_schedule': {
            // Has active recurring bookings
            return cb.some(b =>
              b.recurring_type &&
              ['scheduled', 'in_progress'].includes(b.status)
            )
          }
          case 'not_scheduled': {
            // No active recurring bookings
            return !cb.some(b =>
              b.recurring_type &&
              ['scheduled', 'in_progress'].includes(b.status)
            )
          }
          case 'never_booked': {
            return cb.length === 0
          }
          case 'inactive_30d': {
            if (cb.length === 0) return true // never booked = inactive
            const completed = cb.filter(b => b.status === 'completed')
            if (completed.length === 0) return false // has bookings but none completed = not inactive (probably upcoming)
            const lastDate = Math.max(...completed.map(b => new Date(b.start_time).getTime()))
            return (now - lastDate) > 30 * DAY_MS
          }
          case 'inactive_60d': {
            if (cb.length === 0) return true
            const completed = cb.filter(b => b.status === 'completed')
            if (completed.length === 0) return false
            const lastDate = Math.max(...completed.map(b => new Date(b.start_time).getTime()))
            return (now - lastDate) > 60 * DAY_MS
          }
          case 'inactive_90d': {
            if (cb.length === 0) return true
            const completed = cb.filter(b => b.status === 'completed')
            if (completed.length === 0) return false
            const lastDate = Math.max(...completed.map(b => new Date(b.start_time).getTime()))
            return (now - lastDate) > 90 * DAY_MS
          }
          case 'has_upcoming': {
            return cb.some(b =>
              ['scheduled'].includes(b.status) &&
              new Date(b.start_time).getTime() > now
            )
          }
          case 'no_upcoming': {
            return !cb.some(b =>
              ['scheduled'].includes(b.status) &&
              new Date(b.start_time).getTime() > now
            )
          }
          case 'vip': {
            const totalSpent = cb
              .filter(b => b.status === 'completed')
              .reduce((sum, b) => sum + (b.price || 0), 0)
            return totalSpent > 100000 // cents
          }
          default:
            return true
        }
      })
    }

    let emailCount = 0
    let smsCount = 0
    for (const c of filteredClients) {
      if ((channel === 'email' || channel === 'both') && c.email) emailCount++
      if ((channel === 'sms' || channel === 'both') && c.phone) smsCount++
    }

    const previewHtml = email_body ? emailWrapper(email_body) : null

    return NextResponse.json({
      totalClients: count || 0,
      emailCount,
      smsCount,
      previewHtml,
      clients: filteredClients,
      filter: contact_filter || 'all',
    })
  } catch (err) {
    console.error('Campaign preview error:', err)
    return NextResponse.json({ error: 'Preview failed' }, { status: 500 })
  }
}
