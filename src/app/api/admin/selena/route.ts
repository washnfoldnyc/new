import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendSMS } from '@/lib/sms'
import { EMPTY_CHECKLIST, getClientProfile } from '@/lib/selena'

// Order matches the actual booking flow: name → phone → service → bedrooms → rate → day → time → address → email
const CHECKLIST_FIELDS = ['name', 'phone', 'service_type', 'bedrooms', 'bathrooms', 'rate', 'day', 'time', 'address', 'email']

export async function GET(req: NextRequest) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const convoId = searchParams.get('convoId')
  const since = searchParams.get('since')

  // If convoId provided, return messages for that conversation
  if (convoId) {
    const { data: messages } = await supabaseAdmin
      .from('sms_conversation_messages')
      .select('direction, message, created_at')
      .eq('conversation_id', convoId)
      .order('created_at', { ascending: true })
    return NextResponse.json({ messages: messages || [] })
  }

  // Otherwise return dashboard data — filter by since date for stats
  let query = supabaseAdmin
    .from('sms_conversations')
    .select('id, phone, name, client_id, state, created_at, updated_at, completed_at, expired, outcome, summary, booking_checklist, booking_id')
    .not('booking_checklist', 'is', null)
  if (since) query = query.gte('created_at', since)
  const { data: allConvos } = await query
    .order('updated_at', { ascending: false })
    .limit(100)

  const conversations = (allConvos || []).slice(0, 20)
  const all = allConvos || []

  // Compute stats
  let confirmed = 0
  let abandoned = 0
  let active = 0
  let leadsCapture = 0
  let totalRating = 0
  let ratingCount = 0
  let escalations = 0
  const byChannel: Record<string, number> = { sms: 0, web: 0, other: 0 }
  const byStatus: Record<string, number> = {}
  const missingFields: Record<string, number> = {}
  const checklistCounts: number[] = []
  // Drop-off funnel: count how many reached each step
  const funnel: Record<string, number> = {}
  for (const f of CHECKLIST_FIELDS) funnel[f] = 0
  funnel['recap'] = 0
  funnel['booked'] = 0

  for (const c of all) {
    const cl = c.booking_checklist || {}
    const status = (cl.status as string) || (c.expired ? 'expired' : 'unknown')

    // Outcome
    if (c.outcome === 'booked' || status === 'confirmed' || status === 'closed') confirmed++
    else if (c.expired || c.outcome === 'abandoned') abandoned++
    else if (!c.completed_at && !c.expired) active++

    // Rating
    if (cl.rating && typeof cl.rating === 'number') {
      totalRating += cl.rating
      ratingCount++
    }

    // Channel
    const channel = cl.channel || (c.phone?.startsWith('web-') ? 'web' : 'sms')
    if (channel === 'sms') byChannel.sms++
    else if (channel === 'web') byChannel.web++
    else byChannel.other++

    // Status
    byStatus[status] = (byStatus[status] || 0) + 1

    // Checklist completion + funnel tracking
    let filled = 0
    for (const f of CHECKLIST_FIELDS) {
      if (cl[f] !== null && cl[f] !== undefined) {
        filled++
        funnel[f]++
      } else {
        missingFields[f] = (missingFields[f] || 0) + 1
      }
    }
    if (status === 'recap' || status === 'confirmed' || status === 'closed' || status === 'rating') funnel['recap']++
    if (c.outcome === 'booked' || status === 'confirmed' || status === 'closed') funnel['booked']++
    checklistCounts.push(filled)

    // Leads captured (has name + phone but didn't book)
    if (cl.name && cl.phone && c.outcome !== 'booked' && status !== 'confirmed' && status !== 'closed') {
      leadsCapture++
    }

    // Escalations
    if (c.outcome === 'escalated' || c.summary?.includes('escalat')) escalations++
  }

  // Average messages per conversation (sample from recent 20)
  let totalMessages = 0
  for (const c of conversations) {
    const { count } = await supabaseAdmin
      .from('sms_conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id)
    totalMessages += count || 0
  }

  const stats = {
    total: all.length,
    confirmed,
    abandoned,
    active,
    leadsCapture,
    avgRating: ratingCount > 0 ? totalRating / ratingCount : null,
    ratingCount,
    avgMessages: conversations.length > 0 ? Math.round(totalMessages / conversations.length) : 0,
    avgChecklist: checklistCounts.length > 0 ? checklistCounts.reduce((a, b) => a + b, 0) / checklistCounts.length : 0,
    byChannel,
    byStatus,
    missingFields,
    funnel,
    escalations,
  }

  // Fetch Selena error/escalation log
  const { data: errorLog } = await supabaseAdmin
    .from('notifications')
    .select('id, type, title, message, created_at')
    .or('type.eq.selena_error,type.eq.escalation')
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({ conversations, stats, errorLog: errorLog || [] })
}

// ── Reset a stuck conversation ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { conversationId } = await req.json()
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  // 1. Load the conversation
  const { data: convo } = await supabaseAdmin
    .from('sms_conversations')
    .select('id, phone, client_id, booking_checklist')
    .eq('id', conversationId)
    .single()
  if (!convo) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  // 2. Expire the stuck conversation
  await supabaseAdmin.from('sms_conversations').update({
    expired: true,
    outcome: 'reset',
    summary: 'Admin reset — conversation was stuck',
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId)

  // 3. If SMS, create a fresh conversation and send recovery text
  const isSMS = convo.phone && !convo.phone.startsWith('web-')
  let newConvoId: string | null = null

  if (isSMS) {
    const cleanPhone = convo.phone.replace(/\D/g, '').slice(-10)

    // Pre-fill from client profile if returning
    const prefilled: Record<string, unknown> = { ...EMPTY_CHECKLIST, status: 'collecting', phone: `+1${cleanPhone}`, channel: 'sms' }
    if (convo.client_id) {
      try {
        const profile = JSON.parse(await getClientProfile(cleanPhone))
        if (profile.name) prefilled.name = profile.name
        if (profile.address) prefilled.address = profile.address
        if (profile.email) prefilled.email = profile.email
        if (profile.last_rate) prefilled.rate = profile.last_rate
      } catch {}
    }

    const { data: newConvo } = await supabaseAdmin.from('sms_conversations')
      .insert({ phone: cleanPhone, state: 'active', client_id: convo.client_id, booking_checklist: prefilled })
      .select('id').single()
    newConvoId = newConvo?.id || null

    // Send recovery text
    await sendSMS(`+1${cleanPhone}`, "Hey! Sorry about that — we had a hiccup on our end. Let's start fresh. What can I help you with? 😊", {
      skipConsent: true,
      smsType: 'chatbot',
    })

    // Log the outbound
    if (newConvoId) {
      await supabaseAdmin.from('sms_conversation_messages').insert({
        conversation_id: newConvoId,
        direction: 'outbound',
        message: "Hey! Sorry about that — we had a hiccup on our end. Let's start fresh. What can I help you with? 😊",
      })
    }
  }

  return NextResponse.json({ success: true, expired: conversationId, newConversation: newConvoId })
}
