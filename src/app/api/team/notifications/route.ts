import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cleanerId = searchParams.get('cleaner_id')

  if (!cleanerId) {
    return NextResponse.json({ error: 'Missing cleaner_id' }, { status: 400 })
  }

  // Get last 50 notifications
  const { data: notifications, error } = await supabaseAdmin
    .from('cleaner_notifications')
    .select('*')
    .eq('cleaner_id', cleanerId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get unread count
  const { count } = await supabaseAdmin
    .from('cleaner_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('cleaner_id', cleanerId)
    .eq('read', false)

  return NextResponse.json({ notifications: notifications || [], unreadCount: count || 0 })
}

export async function PUT(request: Request) {
  const body = await request.json()

  // Mark all read
  if (body.markAllRead && body.cleaner_id) {
    const { error } = await supabaseAdmin
      .from('cleaner_notifications')
      .update({ read: true })
      .eq('cleaner_id', body.cleaner_id)
      .eq('read', false)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Mark single read
  if (body.id && body.read !== undefined) {
    const { error } = await supabaseAdmin
      .from('cleaner_notifications')
      .update({ read: body.read })
      .eq('id', body.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
