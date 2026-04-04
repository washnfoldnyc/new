import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { domain } = await request.json()
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('blocked_referrers')
    .upsert({ domain: domain.toLowerCase() }, { onConflict: 'domain' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { domain } = await request.json()
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 })

  await supabaseAdmin
    .from('blocked_referrers')
    .delete()
    .eq('domain', domain.toLowerCase())

  return NextResponse.json({ success: true })
}
