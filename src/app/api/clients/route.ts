import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { emailAdmins } from '@/lib/admin-contacts'
import { adminNewClientEmail } from '@/lib/email-templates'

export async function GET(request: Request) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const { searchParams } = new URL(request.url)
    const includeStats = searchParams.get('include_stats') === 'true'
    const includeArchived = searchParams.get('include_archived') === 'true'

    const { data: clients, error } = includeArchived
      ? await supabaseAdmin
          .from('clients')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10000)
      : await supabaseAdmin
          .from('clients')
          .select('*')
          .neq('active', false)
          .order('created_at', { ascending: false })
          .limit(10000)

    if (error) throw error

    if (!includeStats) {
      return NextResponse.json(clients)
    }

    // Get booking stats for each client (include scheduled)
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('client_id, price, status, start_time')
      .in('status', ['completed', 'scheduled', 'in_progress'])
      .limit(10000)

    const clientsWithStats = clients?.map(client => {
      const clientBookings = bookings?.filter(b => b.client_id === client.id) || []
      const completedBookings = clientBookings.filter(b => b.status === 'completed')

      // Total spent = completed bookings only
      const totalSpent = completedBookings.reduce((sum, b) => sum + (b.price || 0), 0)
      // Total bookings = all non-cancelled bookings
      const totalBookings = clientBookings.length

      // Last/next booking - find most recent past or upcoming
      const now = new Date()
      const pastBookings = clientBookings
        .filter(b => b.start_time && new Date(b.start_time) <= now)
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      const futureBookings = clientBookings
        .filter(b => b.start_time && new Date(b.start_time) > now)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

      // Use most recent past booking, or if none, the next upcoming
      const lastBooking = pastBookings[0]?.start_time || futureBookings[0]?.start_time || null

      let daysSinceLastBooking = null
      if (pastBookings[0]?.start_time) {
        const lastDate = new Date(pastBookings[0].start_time)
        daysSinceLastBooking = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
      }

      return {
        ...client,
        totalBookings,
        totalSpent,
        lastBooking,
        daysSinceLastBooking
      }
    })

    return NextResponse.json(clientsWithStats)
  } catch (err) {
    console.error('Clients GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const body = await request.json()
    const { name, email, phone, address, notes, referrer_id, ref_code, pet_name, pet_type } = body

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    let finalReferrerId = referrer_id || null
    
    if (!finalReferrerId && ref_code) {
      const { data: referrer } = await supabaseAdmin
        .from('referrers')
        .select('id')
        .eq('ref_code', ref_code.toUpperCase())
        .eq('active', true)
        .single()
      
      if (referrer) {
        finalReferrerId = referrer.id
      }
    }

    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert({
        name,
        email: email || null,
        phone: phone || null,
        address: address || null,
        notes: notes || null,
        referrer_id: finalReferrerId,
        pet_name: pet_name || null,
        pet_type: pet_type || null,
        pin: Math.floor(100000 + Math.random() * 900000).toString()
      })
      .select()
      .single()

    if (error) throw error

    // Auto-geocode address
    if (data?.id && address) {
      import('@/lib/geo').then(({ geocodeClient }) => geocodeClient(data.id, address).catch(() => {}))
    }

    // Dashboard notification
    await supabaseAdmin.from('notifications').insert({
      type: 'new_client',
      message: 'New client added: ' + name + ' • by Admin'
    })

    // Admin email
    try {
      const clientEmail = adminNewClientEmail({ name, phone, email, address })
      await emailAdmins(clientEmail.subject, clientEmail.html)
    } catch (emailErr) {
      console.error('Client add email error:', emailErr)
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Clients POST error:', err)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
