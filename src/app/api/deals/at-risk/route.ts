import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

// GET: Full workable client list for outreach
// Excludes: do_not_service, clients with future scheduled bookings
export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    // All active clients (not archived, not DNS)
    const { data: allClients } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, phone, address, status, created_at, do_not_service, last_outreach_at, outreach_count, outreach_status')
      .neq('active', false)
      .neq('do_not_service', true)
      .order('created_at', { ascending: false })
      .limit(10000)

    // All bookings for stats
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('client_id, start_time, status, price')
      .in('status', ['completed', 'scheduled', 'in_progress'])
      .limit(10000)

    // Clients already on sales board
    const { data: activeDeals } = await supabaseAdmin
      .from('deals')
      .select('client_id')
      .eq('stage', 'active')

    const onSalesBoard = new Set((activeDeals || []).map(d => d.client_id))
    const now = new Date()

    const clients = (allClients || []).map(client => {
      const clientBookings = (bookings || []).filter(b => b.client_id === client.id)
      const completed = clientBookings.filter(b => b.status === 'completed')
      const totalSpent = completed.reduce((sum, b) => sum + (b.price || 0), 0)
      const totalBookings = completed.length

      // Future scheduled bookings
      const futureBookings = clientBookings.filter(b =>
        b.start_time && new Date(b.start_time) > now && b.status !== 'completed'
      )
      const hasUpcoming = futureBookings.length > 0

      // Last completed booking
      const lastCompleted = completed
        .filter(b => b.start_time)
        .map(b => new Date(b.start_time))
        .sort((a, b) => b.getTime() - a.getTime())[0]

      const daysSinceLastBooking = lastCompleted
        ? Math.floor((now.getTime() - lastCompleted.getTime()) / (24 * 60 * 60 * 1000))
        : null

      return {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        status: client.status,
        created_at: client.created_at,
        totalBookings,
        totalSpent,
        daysSinceLastBooking,
        lastBookingDate: lastCompleted?.toISOString() || null,
        hasUpcoming,
        onSalesBoard: onSalesBoard.has(client.id),
        lastOutreachAt: client.last_outreach_at,
        outreachCount: client.outreach_count || 0,
        outreachStatus: client.outreach_status || 'none',
      }
    })

    // Split into segments
    const withUpcoming = clients.filter(c => c.hasUpcoming)
    const workable = clients.filter(c => !c.hasUpcoming && !c.onSalesBoard)
    const onBoard = clients.filter(c => c.onSalesBoard)

    return NextResponse.json({
      workable,       // Clients available for outreach (no upcoming, not on board)
      withUpcoming,   // Currently scheduled (excluded from outreach)
      onBoard,        // Already on sales board
      totalClients: clients.length,
    })
  } catch (err) {
    console.error('GET /api/deals/at-risk error:', err)
    return NextResponse.json({ error: 'Failed to fetch client list' }, { status: 500 })
  }
}

// POST: Log outreach touch on a client
export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const body = await request.json()
    const { client_id, action } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    // Update outreach tracking on client
    if (action === 'touch') {
      const { error } = await supabaseAdmin.rpc('increment_outreach', { cid: client_id })
      if (error) {
        // Fallback if RPC doesn't exist yet
        await supabaseAdmin
          .from('clients')
          .update({
            last_outreach_at: new Date().toISOString(),
            outreach_count: (body.current_count || 0) + 1,
            outreach_status: 'active',
          })
          .eq('id', client_id)
      }
    } else if (action === 'not_interested') {
      await supabaseAdmin
        .from('clients')
        .update({ outreach_status: 'not_interested' })
        .eq('id', client_id)
    } else if (action === 'pause') {
      await supabaseAdmin
        .from('clients')
        .update({ outreach_status: 'paused' })
        .eq('id', client_id)
    } else if (action === 'reset') {
      await supabaseAdmin
        .from('clients')
        .update({ outreach_status: 'none', outreach_count: 0, last_outreach_at: null })
        .eq('id', client_id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('POST /api/deals/at-risk error:', err)
    return NextResponse.json({ error: 'Failed to update outreach' }, { status: 500 })
  }
}
