import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

// GET — list open/acknowledged issues
export async function GET(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || 'open,acknowledged'
  const statuses = status.split(',')

  const { data, error } = await supabaseAdmin
    .from('schedule_issues')
    .select('*')
    .in('status', statuses)
    .order('severity', { ascending: true }) // critical first
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// PUT — update issue status (acknowledge, resolve, dismiss)
export async function PUT(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const body = await request.json()
  const { id, status, resolution_note } = body

  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })
  if (!['acknowledged', 'resolved', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  if (status === 'resolved' || status === 'dismissed') {
    update.resolved_at = new Date().toISOString()
    update.resolved_by = 'admin'
    if (resolution_note) update.resolution_note = resolution_note
  }

  const { data, error } = await supabaseAdmin
    .from('schedule_issues')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
