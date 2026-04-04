import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { notify } from '@/lib/notify'

// Step 1: Show confirmation page (link from email)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('id')

  if (!clientId) {
    return NextResponse.json({ error: 'Missing client ID' }, { status: 400 })
  }

  // Redirect to the confirmation page where they must click confirm
  return NextResponse.redirect(new URL(`/unsubscribe?id=${clientId}`, request.url))
}

// Step 2: Actually opt out (called when user confirms)
export async function POST(request: Request) {
  const { client_id, channel } = await request.json()

  if (!client_id) {
    return NextResponse.json({ error: 'Missing client ID' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  if (channel === 'sms') {
    updates.sms_marketing_opt_out = true
    updates.sms_marketing_opted_out_at = new Date().toISOString()
  } else {
    // Default to email opt-out (email links)
    updates.email_marketing_opt_out = true
    updates.email_marketing_opted_out_at = new Date().toISOString()
  }

  const { error } = await supabaseAdmin
    .from('clients')
    .update(updates)
    .eq('id', client_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }

  // Log the opt-out for proof
  await supabaseAdmin
    .from('marketing_opt_out_log')
    .insert({
      client_id,
      channel: channel === 'sms' ? 'sms' : 'email',
      method: channel === 'sms' ? 'sms_stop' : 'email_link',
    })
    .then(() => {}, () => {})

  // Check if now opted out of both — mark DNC
  const { data: client } = await supabaseAdmin.from('clients').select('name, notes, email_marketing_opt_out, sms_marketing_opt_out').eq('id', client_id).single()
  const clientName = client?.name || 'Unknown'
  const ch = channel === 'sms' ? 'SMS' : 'Email'

  if (client?.email_marketing_opt_out && client?.sms_marketing_opt_out) {
    const existingNotes = client.notes || ''
    const dncNote = 'UNSUB — no contact'
    if (!existingNotes.includes(dncNote)) {
      await supabaseAdmin.from('clients').update({
        do_not_service: true,
        notes: existingNotes ? `${existingNotes}\n${dncNote}` : dncNote,
      }).eq('id', client_id)
    }
    await notify({
      type: 'unsubscribe',
      title: 'DNC — Both Channels',
      message: `${clientName} unsubscribed from both email & SMS — marked Do Not Contact`,
    }).catch(() => {})
  } else {
    await notify({
      type: 'unsubscribe',
      title: `${ch} Unsubscribe`,
      message: `${clientName} unsubscribed from ${ch.toLowerCase()} marketing`,
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
