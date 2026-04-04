import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id, field, value } = await request.json()

  if (!id || !field) {
    return NextResponse.json({ error: 'Missing id or field' }, { status: 400 })
  }

  if (field !== 'true_conversion' && field !== 'true_close') {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('lead_clicks')
    .update({ [field]: !!value })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
