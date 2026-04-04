import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    const { data, error } = await supabaseAdmin
      .from('deal_activities')
      .select('*')
      .eq('deal_id', id)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json(data)
  } catch (err) {
    console.error('GET /api/deals/[id]/activities error:', err)
    return NextResponse.json({ error: 'Failed to fetch activities' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  try {
    const body = await request.json()
    const { type, description } = body

    if (!type || !description) {
      return NextResponse.json({ error: 'type and description are required' }, { status: 400 })
    }

    const allowed = ['note', 'call', 'text', 'email', 'quote_sent']
    if (!allowed.includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${allowed.join(', ')}` }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('deal_activities')
      .insert({ deal_id: id, type, description })
      .select()
      .single()

    if (error) throw error

    // Update deal's updated_at
    await supabaseAdmin
      .from('deals')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json(data)
  } catch (err) {
    console.error('POST /api/deals/[id]/activities error:', err)
    return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 })
  }
}
