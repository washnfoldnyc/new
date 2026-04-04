import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'
import { smsAdmins } from '@/lib/admin-contacts'
import { notify } from '@/lib/notify'
import { askSelena, getClientProfile, EMPTY_CHECKLIST } from '@/lib/selena'
import type { BookingChecklist } from '@/lib/selena'

export const maxDuration = 60

function typingDelay(text: string): Promise<void> {
  if (text.length > 500) return Promise.resolve()
  const ms = Math.min(Math.max(text.length * 40, 1500), 6000)
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function POST(request: Request) {
  try {
    // ── Signature verification ──
    const telnyxPublicKey = process.env.TELNYX_PUBLIC_KEY
    if (telnyxPublicKey) {
      const signature = request.headers.get('telnyx-signature-ed25519')
      const timestamp = request.headers.get('telnyx-timestamp')
      if (!signature || !timestamp) return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
      const age = Math.abs(Date.now() / 1000 - Number(timestamp))
      if (age > 300) return NextResponse.json({ error: 'Stale webhook' }, { status: 401 })
    }

    // ── Parse body ──
    const body = await request.json()
    const event = body.data
    const eventType = event?.event_type
    if (!eventType) return NextResponse.json({ ok: true })

    // ── Delivery status updates ──
    if (eventType === 'message.sent' || eventType === 'message.delivered' || eventType === 'message.failed') {
      const messageId = event.payload?.id
      const status = eventType === 'message.delivered' ? 'delivered' : eventType === 'message.failed' ? 'failed' : 'sent'
      if (messageId) {
        await supabaseAdmin.from('sms_logs').update({ status }).eq('telnyx_message_id', messageId)
        await supabaseAdmin.from('campaign_recipients').update({
          status, ...(status === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
        }).eq('telnyx_message_id', messageId)

        if (status === 'delivered' || status === 'failed') {
          const { data: cr } = await supabaseAdmin.from('campaign_recipients').select('campaign_id').eq('telnyx_message_id', messageId).single()
          if (cr?.campaign_id) {
            const { data: counts } = await supabaseAdmin.from('campaign_recipients').select('status').eq('campaign_id', cr.campaign_id)
            if (counts) {
              await supabaseAdmin.from('campaigns').update({
                delivered_count: counts.filter(r => r.status === 'delivered' || r.status === 'opened').length,
                failed_count: counts.filter(r => r.status === 'failed' || r.status === 'bounced').length,
              }).eq('id', cr.campaign_id)
            }
          }
        }
      }
      return NextResponse.json({ ok: true })
    }

    // ── Inbound messages ──
    if (eventType !== 'message.received') return NextResponse.json({ ok: true })

    const from = event.payload?.from?.phone_number
    const rawText = (event.payload?.text || '').trim()
    if (!from || !rawText) return NextResponse.json({ ok: true })

    const cleanPhone = from.replace(/\D/g, '').slice(-10)
    const text = rawText.toUpperCase()
    const ADMIN_PHONE = process.env.ADMIN_FORWARD_PHONE || '2122029220' // fallback for dedup check
    const telnyxMessageId = event.payload?.id

    // ── Dedup ──
    if (telnyxMessageId) {
      const { data: existing } = await supabaseAdmin.from('sms_logs').select('id').eq('telnyx_message_id', telnyxMessageId).limit(1)
      if (existing && existing.length > 0) return NextResponse.json({ ok: true })
      await supabaseAdmin.from('sms_logs')
        .insert({ telnyx_message_id: telnyxMessageId, recipient: cleanPhone, sms_type: 'inbound', status: 'received' })
        .then(() => {}, () => {})
    }

    // ── Admin forwarding ──
    if (cleanPhone !== ADMIN_PHONE) {
      const { data: sender } = await supabaseAdmin.from('clients').select('name').ilike('phone', `%${cleanPhone}%`).limit(1).single()
      await smsAdmins(`SMS from ${sender?.name || from}: ${rawText}`).catch(() => {})
    }

    // ── Commands ──
    if (text === 'STOP' || text === 'UNSUBSCRIBE' || text === 'QUIT') {
      await supabaseAdmin.from('clients').update({ sms_consent: false, sms_marketing_opt_out: true, sms_marketing_opted_out_at: new Date().toISOString() }).ilike('phone', `%${cleanPhone}%`)
      await supabaseAdmin.from('cleaners').update({ sms_consent: false }).ilike('phone', `%${cleanPhone}%`)
      await supabaseAdmin.from('sms_conversations').update({ expired: true, updated_at: new Date().toISOString() }).ilike('phone', `%${cleanPhone}%`).is('completed_at', null).eq('expired', false)
      const { data: stopClient } = await supabaseAdmin.from('clients').select('id, name, email_marketing_opt_out, sms_marketing_opt_out, notes').ilike('phone', `%${cleanPhone}%`).limit(1).single()
      if (stopClient) {
        await supabaseAdmin.from('marketing_opt_out_log').insert({ client_id: stopClient.id, channel: 'sms', method: 'sms_stop' }).then(() => {}, () => {})
        if (stopClient.email_marketing_opt_out && stopClient.sms_marketing_opt_out) {
          const dncNote = 'UNSUB — no contact'
          if (!(stopClient.notes || '').includes(dncNote)) {
            await supabaseAdmin.from('clients').update({ do_not_service: true, notes: stopClient.notes ? `${stopClient.notes}\n${dncNote}` : dncNote }).eq('id', stopClient.id)
          }
          await notify({ type: 'unsubscribe', title: 'DNC — Both Channels', message: `${stopClient.name || from} unsubscribed from both email & SMS — marked Do Not Contact` }).catch(() => {})
        } else {
          await notify({ type: 'unsubscribe', title: 'SMS Unsubscribe', message: `${stopClient.name || from} texted STOP — opted out of SMS marketing` }).catch(() => {})
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (text === 'START' || text === 'UNSTOP') {
      await supabaseAdmin.from('clients').update({ sms_consent: true, sms_marketing_opt_out: false, sms_marketing_opted_out_at: null }).ilike('phone', `%${cleanPhone}%`)
      await supabaseAdmin.from('cleaners').update({ sms_consent: true }).ilike('phone', `%${cleanPhone}%`)
      return NextResponse.json({ ok: true })
    }

    if (text === 'START OVER' || text === 'RESET') {
      await supabaseAdmin.from('sms_conversations').update({ expired: true, updated_at: new Date().toISOString() }).ilike('phone', `%${cleanPhone}%`).is('completed_at', null).eq('expired', false)
      return NextResponse.json({ ok: true })
    }

    // ── Expire stale conversations (4 hours) ──
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    await supabaseAdmin.from('sms_conversations').update({
      expired: true, updated_at: new Date().toISOString(), outcome: 'abandoned', summary: 'Conversation expired — no booking',
    }).ilike('phone', `%${cleanPhone}%`).is('completed_at', null).eq('expired', false).lt('updated_at', fourHoursAgo)

    // ── Post-job rating intercept ──
    // If the message is a single digit 1-5, check for a recently completed booking
    const ratingMatch = rawText.match(/^([1-5])$/)
    if (ratingMatch) {
      const ratingValue = parseInt(ratingMatch[1])
      const { data: ratingClient } = await supabaseAdmin
        .from('clients').select('id, name').ilike('phone', `%${cleanPhone}%`).limit(1).single()

      if (ratingClient) {
        // Look for a completed booking with followup sent in the last 48 hours
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const { data: recentBooking } = await supabaseAdmin
          .from('bookings')
          .select('id, notes')
          .eq('client_id', ratingClient.id)
          .eq('status', 'completed')
          .gte('check_out_time', twoDaysAgo)
          .limit(1)
          .order('check_out_time', { ascending: false })

        const hasFollowup = recentBooking && recentBooking.length > 0 && recentBooking[0].notes?.includes('[FOLLOWUP_SENT]')

        if (hasFollowup) {
          const booking = recentBooking[0]

          // Store rating on booking
          const ratingNote = booking.notes ? `${booking.notes}\n[RATING:${ratingValue}]` : `[RATING:${ratingValue}]`
          await supabaseAdmin.from('bookings').update({ notes: ratingNote }).eq('id', booking.id)

          // Send appropriate reply based on rating
          let replyText: string
          if (ratingValue === 5) {
            replyText = "That means a lot! Would you mind leaving us a review? https://share.google/fQ6FBdrblIqKSAq0q \u{1F60A}"
          } else if (ratingValue >= 3) {
            replyText = "Thanks for the feedback! We're always looking to improve \u{1F60A}"
          } else {
            replyText = "We're sorry to hear that. Your feedback has been shared with our team.\n\nIf you'd like to share more details: thenycmaid.com/feedback"
            // Notify admin of low rating
            await notify({
              type: 'low_rating',
              title: `Low Rating (${ratingValue}/5)`,
              message: `${ratingClient.name || from} rated their cleaning ${ratingValue}/5`,
              booking_id: booking.id,
            }).catch(() => {})
          }

          await sendSMS(from, replyText, { skipConsent: true, smsType: 'rating_reply' })

          // Log to sms_logs
          await supabaseAdmin.from('sms_logs')
            .insert({ booking_id: booking.id, sms_type: 'rating_reply', recipient: cleanPhone, status: 'sent' })
            .then(() => {}, () => {})

          return NextResponse.json({ ok: true })
        }
      }
    }

    // ── Client lookup ──
    const { data: client } = await supabaseAdmin.from('clients').select('id, name').ilike('phone', `%${cleanPhone}%`).limit(1).single()
    const label = client?.name || from

    // ── Log helper ──
    async function logMsg(convoId: string, direction: 'inbound' | 'outbound', message: string, clientId?: string | null) {
      await supabaseAdmin.from('sms_conversation_messages').insert({ conversation_id: convoId, direction, message })
      if (clientId) {
        await supabaseAdmin.from('client_sms_messages').insert({ client_id: clientId, direction, message }).then(() => {}, () => {})
      }
    }

    // ── Find or create conversation ──
    const { data: activeConvo } = await supabaseAdmin.from('sms_conversations')
      .select('id, client_id').ilike('phone', `%${cleanPhone}%`)
      .is('completed_at', null).eq('expired', false)
      .order('created_at', { ascending: false }).limit(1)

    let convoId: string
    let clientId: string | null

    if (activeConvo && activeConvo.length > 0) {
      convoId = activeConvo[0].id
      clientId = activeConvo[0].client_id || client?.id || null
    } else {
      // New conversation — pre-fill checklist for returning clients
      const prefilled: Record<string, unknown> = { ...EMPTY_CHECKLIST, status: 'collecting', phone: from, channel: 'sms' }
      if (client) {
        try {
          const profile = JSON.parse(await getClientProfile(from))
          if (profile.name) prefilled.name = profile.name
          if (profile.address) prefilled.address = profile.address
          if (profile.email) prefilled.email = profile.email
          if (profile.last_rate) prefilled.rate = profile.last_rate
        } catch {}

        // Notify admin of returning client
        await notify({ type: 'sms_reply', title: 'Returning Client SMS', message: `${client.name} texted: ${rawText.slice(0, 200)}` }).catch(() => {})
      } else {
        // Notify admin of new lead
        await notify({ type: 'new_lead', title: 'New SMS Lead', message: `New lead from ${from}: ${rawText.slice(0, 200)}` }).catch(() => {})
      }

      const { data: newConvo } = await supabaseAdmin.from('sms_conversations')
        .insert({ phone: cleanPhone, state: 'active', client_id: client?.id || null, booking_checklist: prefilled })
        .select('id').single()
      if (!newConvo) return NextResponse.json({ ok: true })
      convoId = newConvo.id
      clientId = client?.id || null
    }

    // ── Update timestamp ──
    await supabaseAdmin.from('sms_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convoId)

    // ── Log inbound ──
    await logMsg(convoId, 'inbound', rawText, clientId)

    // ── Message buffer (1.5s) ──
    await new Promise(resolve => setTimeout(resolve, 1500))

    const { data: recentExchange } = await supabaseAdmin.from('sms_conversation_messages')
      .select('direction, message').eq('conversation_id', convoId)
      .order('created_at', { ascending: false }).limit(10)

    const pendingInbound: string[] = []
    for (const msg of (recentExchange || [])) {
      if (msg.direction === 'inbound') pendingInbound.unshift(msg.message)
      else break
    }

    const combinedMessage = pendingInbound.length > 1 ? pendingInbound.join('\n') : rawText

    // Skip if not the latest inbound
    const { data: latestInbound } = await supabaseAdmin.from('sms_conversation_messages')
      .select('message').eq('conversation_id', convoId).eq('direction', 'inbound')
      .order('created_at', { ascending: false }).limit(1)
    if (latestInbound && latestInbound.length > 0 && latestInbound[0].message !== rawText) {
      return NextResponse.json({ ok: true })
    }

    // ── Ask Selena ──
    const result = await askSelena('sms', combinedMessage, convoId)

    // ── Client backfill ──
    if (result.clientCreated && !clientId) {
      const { data: convoData } = await supabaseAdmin.from('sms_conversations').select('client_id').eq('id', convoId).single()
      clientId = convoData?.client_id || null
      if (clientId) {
        const { data: allMsgs } = await supabaseAdmin.from('sms_conversation_messages')
          .select('direction, message').eq('conversation_id', convoId).order('created_at', { ascending: true })
        if (allMsgs && allMsgs.length > 0) {
          await supabaseAdmin.from('client_sms_messages')
            .insert(allMsgs.map(m => ({ client_id: clientId!, direction: m.direction, message: m.message })))
            .then(() => {}, () => {})
        }
      }
    }

    // ── Send response ──
    if (!result.text) result.text = "Sorry, nothing came through on my end! Could you resend that? 😊"
    if (result.text) {
      const escalateRegex = /\[ESCALATE[^\]]*\]/gi
      const hadEscalate = escalateRegex.test(result.text)
      const clientText = result.text.replace(/\[ESCALATE[^\]]*\]/gi, '').trim()

      if (hadEscalate) {
        const { data: recentMsgs } = await supabaseAdmin.from('sms_conversation_messages')
          .select('direction, message').eq('conversation_id', convoId)
          .order('created_at', { ascending: false }).limit(10)
        const context = (recentMsgs || []).reverse().map(m => `${m.direction === 'inbound' ? 'Client' : 'Selena'}: ${m.message}`).join('\n')
        const escalateMatch = result.text.match(/\[ESCALATE:?\s*([^\]]*)\]/i)
        await notify({ type: 'escalation', title: `Escalation — SMS (${escalateMatch?.[1]?.trim() || 'general'})`, message: `${label} needs attention.\n\n${context}\n\nClient: ${rawText}` }).catch(() => {})
      }

      if (clientText) {
        await typingDelay(clientText)
        await sendSMS(from, clientText, { skipConsent: true, smsType: 'chatbot' })
        await logMsg(convoId, 'outbound', clientText, clientId)
      }
    }

    // ── Notifications ──
    if (result.bookingCreated) {
      await notify({ type: 'new_booking', title: 'New SMS Booking', message: `${label} confirmed a booking via SMS` }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telnyx webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
