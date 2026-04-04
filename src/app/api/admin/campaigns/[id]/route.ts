import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { id } = await params

  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from('campaign_recipients')
    .select('*, clients(name)')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  if (recipientsError) {
    return NextResponse.json({ error: recipientsError.message }, { status: 500 })
  }

  return NextResponse.json({ campaign, recipients: recipients || [] })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { id } = await params
  const body = await request.json()

  const { data: existing } = await supabaseAdmin
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .single()

  if (!existing || existing.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft campaigns can be edited' }, { status: 400 })
  }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .update({
      name: body.name,
      channel: body.channel,
      subject: body.subject,
      email_body: body.email_body,
      sms_body: body.sms_body,
      audience_filter: body.audience_filter,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ campaign })
}
