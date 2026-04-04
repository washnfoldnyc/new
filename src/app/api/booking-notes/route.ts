import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectClientAPI, isAdminAuthenticated } from '@/lib/auth'
import { notifyCleaner } from '@/lib/notify-cleaner'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bookingId = searchParams.get('booking_id')
  if (!bookingId) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

  const isAdmin = await isAdminAuthenticated()
  if (!isAdmin) {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('client_id')
      .eq('id', bookingId)
      .single()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const auth = await protectClientAPI(booking.client_id)
    if (auth instanceof NextResponse) return auth
  }

  const { data, error } = await supabaseAdmin
    .from('booking_notes')
    .select('*')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

async function notifyCleanerOfNote(bookingId: string, authorType: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('cleaner_id, start_time, clients(name), cleaners(name, pin)')
    .eq('id', bookingId)
    .single()

  if (!booking?.cleaner_id) return

  const clientName = (booking.clients as any)?.name || 'Client'
  const pin = (booking.cleaners as any)?.pin || ''
  const date = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const updatedBy = authorType === 'client' ? clientName : 'Admin'

  notifyCleaner({
    cleanerId: booking.cleaner_id,
    type: 'job_reminder',
    title: 'Job Notes Updated',
    message: `${updatedBy} updated notes for ${clientName} on ${date}`,
    bookingId,
    smsMessage: `Wash and Fold NYC: ${updatedBy} updated notes for your ${date} job (${clientName}). Check portal: washandfoldnyc.com/team PIN: ${pin}\n${updatedBy} actualizó las notas para tu trabajo del ${date} (${clientName}). Portal: washandfoldnyc.com/team PIN: ${pin}`,
    skipEmail: true,
  }).catch(() => {})
}

export async function POST(request: Request) {
  const body = await request.json()
  const { booking_id, content, author_type, author_name, client_id } = body

  if (!booking_id) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }
  if (content.length > 2000) {
    return NextResponse.json({ error: 'Content too long (max 2000 chars)' }, { status: 400 })
  }

  const isAdmin = await isAdminAuthenticated()
  if (!isAdmin) {
    const { data: booking } = await supabaseAdmin
      .from('bookings')
      .select('client_id')
      .eq('id', booking_id)
      .single()
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    const auth = await protectClientAPI(booking.client_id)
    if (auth instanceof NextResponse) return auth
  }

  const resolvedAuthorType = isAdmin ? 'admin' : (author_type || 'client')

  const { data, error } = await supabaseAdmin
    .from('booking_notes')
    .insert({
      booking_id,
      client_id: client_id || null,
      author_type: resolvedAuthorType,
      author_name: author_name || (isAdmin ? 'Admin' : 'Client'),
      content: content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify cleaner
  notifyCleanerOfNote(booking_id, resolvedAuthorType)

  return NextResponse.json(data)
}
