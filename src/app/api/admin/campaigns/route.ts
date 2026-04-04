import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaigns: data })
}

export async function POST(request: Request) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const body = await request.json()
  const { name, channel, subject, email_body, sms_body, audience_filter } = body

  if (!name || !channel) {
    return NextResponse.json({ error: 'Name and channel are required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('campaigns')
    .insert({
      name,
      channel,
      subject: subject || null,
      email_body: email_body || null,
      sms_body: sms_body || null,
      audience_filter: audience_filter || 'active',
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaign: data })
}

export async function DELETE(request: Request) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 })
  }

  // Only allow deleting drafts
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: 'Can only delete draft campaigns' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
