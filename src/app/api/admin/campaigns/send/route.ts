import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { emailWrapper } from '@/lib/email-templates'

export const maxDuration = 300

export async function POST(request: Request) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { campaign_id, client_ids } = await request.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: 'Campaign already sent' }, { status: 400 })
  }

  // Mark as sending
  await supabaseAdmin
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaign_id)

  // Fetch audience — use specific client_ids if provided, otherwise query by filter
  let clients: { id: string; name: string; email: string | null; phone: string | null; email_marketing_opt_out: boolean; sms_marketing_opt_out: boolean }[] | null = null
  if (client_ids && Array.isArray(client_ids) && client_ids.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .select('id, name, email, phone, email_marketing_opt_out, sms_marketing_opt_out')
      .in('id', client_ids)
    if (error || !data) {
      await supabaseAdmin.from('campaigns').update({ status: 'draft' }).eq('id', campaign_id)
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }
    clients = data
  } else {
    let query = supabaseAdmin
      .from('clients')
      .select('id, name, email, phone, email_marketing_opt_out, sms_marketing_opt_out')
      .eq('do_not_service', false)
    if (campaign.audience_filter === 'active') {
      query = query.eq('active', true)
    }
    const { data, error } = await query.limit(10000)
    if (error || !data) {
      await supabaseAdmin.from('campaigns').update({ status: 'draft' }).eq('id', campaign_id)
      return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
    }
    clients = data
  }

  // Build recipient rows — respect per-channel opt-outs
  const recipientRows: any[] = []
  for (const client of clients) {
    if ((campaign.channel === 'email' || campaign.channel === 'both') && client.email && !client.email_marketing_opt_out) {
      recipientRows.push({
        campaign_id,
        client_id: client.id,
        channel: 'email',
        recipient: client.email,
        status: 'pending',
      })
    }
    if ((campaign.channel === 'sms' || campaign.channel === 'both') && client.phone && !client.sms_marketing_opt_out) {
      recipientRows.push({
        campaign_id,
        client_id: client.id,
        channel: 'sms',
        recipient: client.phone,
        status: 'pending',
      })
    }
  }

  if (recipientRows.length === 0) {
    await supabaseAdmin.from('campaigns').update({ status: 'draft' }).eq('id', campaign_id)
    return NextResponse.json({ error: 'No eligible recipients' }, { status: 400 })
  }

  // Insert recipient rows
  const { data: recipients, error: insertError } = await supabaseAdmin
    .from('campaign_recipients')
    .insert(recipientRows)
    .select('id, client_id, channel, recipient')

  if (insertError || !recipients) {
    await supabaseAdmin.from('campaigns').update({ status: 'draft' }).eq('id', campaign_id)
    return NextResponse.json({ error: 'Failed to create recipients' }, { status: 500 })
  }

  // Send emails first (fast via Resend), then SMS
  let sentCount = 0
  let failedCount = 0
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.thenycmaid.com'
  const emailRecipients = recipients.filter(r => r.channel === 'email')
  const smsRecipients = recipients.filter(r => r.channel === 'sms')

  for (const recipient of emailRecipients) {
    try {
      if (campaign.email_body) {
        const unsubLink = `${baseUrl}/api/unsubscribe?id=${recipient.client_id}`
        const bodyWithUnsub = campaign.email_body + `<p style="color: #999; font-size: 11px; margin: 32px 0 0 0; text-align: center;"><a href="${unsubLink}" style="color: #999; text-decoration: underline;">Unsubscribe from marketing emails</a></p>`
        const wrappedHtml = emailWrapper(bodyWithUnsub)
        const result = await sendEmail(recipient.recipient, campaign.subject || campaign.name, wrappedHtml)
        if (result.success && result.data?.id) {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'sent', resend_email_id: result.data.id, sent_at: new Date().toISOString() }).eq('id', recipient.id)
          sentCount++
        } else {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
          failedCount++
        }
      }
    } catch (err) {
      console.error('Campaign email error:', recipient.id, err)
      await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
      failedCount++
    }
    await new Promise(r => setTimeout(r, 100))
  }

  for (const recipient of smsRecipients) {
    try {
      if (campaign.sms_body) {
        const unsubSmsLink = `${baseUrl}/unsubscribe?id=${recipient.client_id}&channel=sms`
        const smsWithOptOut = campaign.sms_body + `\n\nOpt out of promos: ${unsubSmsLink}`
        // skipConsent: true for marketing campaigns (opt-out handled by sms_marketing_opt_out filter above)
        const result = await sendSMS(recipient.recipient, smsWithOptOut, { skipConsent: true, recipientType: 'client', recipientId: recipient.client_id, smsType: 'campaign' })
        if (result.success && result.id) {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'sent', telnyx_message_id: result.id, sent_at: new Date().toISOString() }).eq('id', recipient.id)
          sentCount++
        } else {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
          failedCount++
        }
      }
    } catch (err) {
      console.error('Campaign SMS error:', recipient.id, err)
      await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
      failedCount++
    }
    await new Promise(r => setTimeout(r, 200))
  }

  // Update campaign stats
  await supabaseAdmin
    .from('campaigns')
    .update({
      status: 'sent',
      total_recipients: recipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      sent_at: new Date().toISOString(),
    })
    .eq('id', campaign_id)

  return NextResponse.json({
    ok: true,
    total: recipients.length,
    sent: sentCount,
    failed: failedCount,
  })
}

// Retry failed recipients
export async function PUT(request: Request) {
  const denied = await protectAdminAPI()
  if (denied) return denied

  const { campaign_id } = await request.json()
  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Get failed + pending recipients
  const { data: failedRecipients } = await supabaseAdmin
    .from('campaign_recipients')
    .select('id, client_id, channel, recipient')
    .eq('campaign_id', campaign_id)
    .in('status', ['failed', 'pending'])
    .limit(10000)

  if (!failedRecipients || failedRecipients.length === 0) {
    return NextResponse.json({ error: 'No failed recipients to retry' }, { status: 400 })
  }

  let sentCount = 0
  let failedCount = 0
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.thenycmaid.com'

  for (const recipient of failedRecipients) {
    try {
      if (recipient.channel === 'email' && campaign.email_body) {
        const unsubLink = `${baseUrl}/api/unsubscribe?id=${recipient.client_id}`
        const bodyWithUnsub = campaign.email_body + `<p style="color: #999; font-size: 11px; margin: 32px 0 0 0; text-align: center;"><a href="${unsubLink}" style="color: #999; text-decoration: underline;">Unsubscribe from marketing emails</a></p>`
        const wrappedHtml = emailWrapper(bodyWithUnsub)
        const result = await sendEmail(recipient.recipient, campaign.subject || campaign.name, wrappedHtml)
        if (result.success && result.data?.id) {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'sent', resend_email_id: result.data.id, sent_at: new Date().toISOString() }).eq('id', recipient.id)
          sentCount++
        } else {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
          failedCount++
        }
      } else if (recipient.channel === 'sms' && campaign.sms_body) {
        const unsubSmsLink = `${baseUrl}/unsubscribe?id=${recipient.client_id}&channel=sms`
        const smsWithOptOut = campaign.sms_body + `\n\nOpt out of promos: ${unsubSmsLink}`
        const result = await sendSMS(recipient.recipient, smsWithOptOut, { skipConsent: true, recipientType: 'client', recipientId: recipient.client_id, smsType: 'campaign' })
        if (result.success && result.id) {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'sent', telnyx_message_id: result.id, sent_at: new Date().toISOString() }).eq('id', recipient.id)
          sentCount++
        } else {
          await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
          failedCount++
        }
      }
    } catch (err) {
      console.error('Campaign retry error:', recipient.id, err)
      await supabaseAdmin.from('campaign_recipients').update({ status: 'failed' }).eq('id', recipient.id)
      failedCount++
    }
    await new Promise(r => setTimeout(r, 200))
  }

  // Update campaign stats
  const { data: allRecipients } = await supabaseAdmin
    .from('campaign_recipients')
    .select('status')
    .eq('campaign_id', campaign_id)
    .limit(10000)

  const totalSent = allRecipients?.filter(r => r.status === 'sent').length || 0
  const totalFailed = allRecipients?.filter(r => r.status === 'failed').length || 0

  await supabaseAdmin
    .from('campaigns')
    .update({ sent_count: totalSent, failed_count: totalFailed })
    .eq('id', campaign_id)

  return NextResponse.json({
    ok: true,
    retried: failedRecipients.length,
    sent: sentCount,
    failed: failedCount,
  })
}
