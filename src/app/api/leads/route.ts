import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ALL_DOMAINS } from '@/lib/domains'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const allVariants = ALL_DOMAINS.flatMap(d => [d, `www.${d}`])
  const ownedSet = new Set(ALL_DOMAINS.map(d => d.toLowerCase()))
  const VALID_ACTIONS = ['visit', 'call', 'text', 'book']

  // Load blocked referrers from DB
  const { data: blockedRows } = await supabaseAdmin
    .from('blocked_referrers')
    .select('domain')

  const blockedSet = new Set((blockedRows || []).map(r => r.domain.toLowerCase()))

  // Pages that are NOT potential clients — job seekers, team, existing clients, legal, admin
  const NON_LEAD_PREFIXES = [
    '/careers', '/available-nyc-maid-jobs', '/apply',
    '/team', '/admin',
    '/book/collect', '/book/dashboard',
    '/privacy-policy', '/terms-conditions', '/refund-policy',
    '/unsubscribe',
  ]
  const isLeadPage = (page: string | null) => {
    if (!page) return true // no page recorded = assume lead
    const p = page.toLowerCase()
    return !NON_LEAD_PREFIXES.some(prefix => p.startsWith(prefix))
  }

  const isCleanVisit = (ref: string | null) => {
    if (!ref || ref === 'direct') return false
    const r = ref.toLowerCase()
    for (const d of ownedSet) { if (r.includes(d)) return false }
    for (const d of blockedSet) { if (r.includes(d)) return false }
    return true
  }

  // Site list stats — visits only from clean sources
  const { data: clicks } = await supabaseAdmin
    .from('lead_clicks')
    .select('domain, action, referrer, final_time, device, final_scroll, engaged_30s, load_time_ms, utm_source, utm_medium, utm_campaign, active_time, cta_clicked, session_id, page')
    .in('domain', allVariants)
    .in('action', VALID_ACTIONS)
    .limit(50000)

  // Build set of clean visit session_ids first (clean referrer + lead page)
  const cleanSessionIds = new Set<string>()
  for (const c of (clicks || [])) {
    if (c.action === 'visit' && c.session_id && isCleanVisit(c.referrer) && isLeadPage(c.page)) {
      cleanSessionIds.add(c.session_id)
    }
  }

  // Now filter: visits must be clean + lead page, CTAs keep their own filter
  const cleanClicks = (clicks || []).filter(c => {
    if (c.action === 'visit') return isCleanVisit(c.referrer) && isLeadPage(c.page)
    return c.session_id && cleanSessionIds.has(c.session_id)
  })

  const stats: Record<string, {
    visits: number; calls: number; texts: number; books: number
    mobile: number; desktop: number
    scrollSum: number; scrollCount: number
    timeSum: number; timeCount: number
    activeSum: number; activeCount: number
    engaged: number
    loadSum: number; loadCount: number
    ctaClicked: number
    sources: Record<string, number>
    utmSources: Record<string, number>
    utmMediums: Record<string, number>
    utmCampaigns: Record<string, number>
  }> = {}

  for (const d of ALL_DOMAINS) {
    stats[d] = {
      visits: 0, calls: 0, texts: 0, books: 0,
      mobile: 0, desktop: 0,
      scrollSum: 0, scrollCount: 0,
      timeSum: 0, timeCount: 0,
      activeSum: 0, activeCount: 0,
      engaged: 0,
      loadSum: 0, loadCount: 0,
      ctaClicked: 0,
      sources: {}, utmSources: {}, utmMediums: {}, utmCampaigns: {},
    }
  }

  // Track seen session:domain:action combos to dedup visits and CTAs per session
  const seenDomainSessions = new Set<string>()

  for (const c of cleanClicks) {
    const bare = c.domain?.replace(/^www\./, '') || ''
    const s = stats[bare]
    if (!s) continue

    // Dedup visits and CTAs by session_id per domain
    const dedupKey = `${c.session_id || ''}:${bare}:${c.action}`
    if (c.session_id && seenDomainSessions.has(dedupKey)) continue
    if (c.session_id) seenDomainSessions.add(dedupKey)

    if (c.action === 'visit') s.visits++
    if (c.action === 'call') s.calls++
    if (c.action === 'text') s.texts++
    if (c.action === 'book') s.books++

    if (c.device === 'mobile') s.mobile++
    else if (c.device === 'desktop') s.desktop++

    if (c.final_scroll > 0) { s.scrollSum += c.final_scroll; s.scrollCount++ }
    if (c.final_time > 0) { s.timeSum += c.final_time; s.timeCount++ }
    if (c.active_time > 0) { s.activeSum += c.active_time; s.activeCount++ }
    if (c.engaged_30s) s.engaged++
    if (c.load_time_ms > 0) { s.loadSum += c.load_time_ms; s.loadCount++ }
    if (c.cta_clicked) s.ctaClicked++

    if (c.referrer) s.sources[c.referrer] = (s.sources[c.referrer] || 0) + 1
    if (c.utm_source) s.utmSources[c.utm_source] = (s.utmSources[c.utm_source] || 0) + 1
    if (c.utm_medium) s.utmMediums[c.utm_medium] = (s.utmMediums[c.utm_medium] || 0) + 1
    if (c.utm_campaign) s.utmCampaigns[c.utm_campaign] = (s.utmCampaigns[c.utm_campaign] || 0) + 1
  }

  const topEntry = (obj: Record<string, number>) => {
    const sorted = Object.entries(obj).sort((a, b) => b[1] - a[1])
    return sorted.length > 0 ? sorted[0][0] : '—'
  }

  const domains = ALL_DOMAINS.map(d => {
    const s = stats[d]
    return {
      domain: d,
      visits: s.visits,
      calls: s.calls,
      texts: s.texts,
      books: s.books,
      mobile: s.mobile,
      desktop: s.desktop,
      avgScroll: s.scrollCount > 0 ? Math.round(s.scrollSum / s.scrollCount) : 0,
      avgTime: s.timeCount > 0 ? Math.round(s.timeSum / s.timeCount) : 0,
      avgActive: s.activeCount > 0 ? Math.round(s.activeSum / s.activeCount) : 0,
      engaged: s.engaged,
      avgLoad: s.loadCount > 0 ? Math.round(s.loadSum / s.loadCount) : 0,
      ctaClicked: s.ctaClicked,
      topSource: topEntry(s.sources),
      topUtmSource: topEntry(s.utmSources),
      topUtmMedium: topEntry(s.utmMediums),
      topUtmCampaign: topEntry(s.utmCampaigns),
    }
  })

  // Live feed — all valid visits, newest first (include id + manual overrides)
  const { data: feedRaw } = await supabaseAdmin
    .from('lead_clicks')
    .select('id, domain, device, referrer, final_scroll, final_time, active_time, engaged_30s, load_time_ms, cta_clicked, utm_source, utm_medium, utm_campaign, created_at, session_id, manual_conversion, manual_sale, page')
    .in('domain', allVariants)
    .eq('action', 'visit')
    .order('created_at', { ascending: false })
    .limit(50000)

  // CTA events — only from clean sessions
  const { data: ctaRaw } = await supabaseAdmin
    .from('lead_clicks')
    .select('session_id, action, domain, referrer, device, created_at')
    .in('domain', allVariants)
    .in('action', ['call', 'text', 'book'])
    .limit(50000)

  // Build session_id → CTA actions map (all sessions — a CTA is real regardless of referrer)
  const ctaMap: Record<string, string[]> = {}
  for (const c of (ctaRaw || [])) {
    if (!c.session_id) continue
    if (!ctaMap[c.session_id]) ctaMap[c.session_id] = []
    if (!ctaMap[c.session_id].includes(c.action)) ctaMap[c.session_id].push(c.action)
  }

  // Build ctaDetails — one record per unique session_id:action pair
  const ctaSeenKeys = new Set<string>()
  const ctaDetails: { session_id: string; action: string; domain: string; referrer: string | null; device: string; created_at: string }[] = []
  for (const c of (ctaRaw || [])) {
    if (!c.session_id) continue
    const key = `${c.session_id}:${c.action}`
    if (ctaSeenKeys.has(key)) continue
    ctaSeenKeys.add(key)
    ctaDetails.push({
      session_id: c.session_id,
      action: c.action,
      domain: c.domain?.replace(/^www\./, '') || '',
      referrer: c.referrer || null,
      device: c.device || '',
      created_at: c.created_at,
    })
  }

  // Auto-sale detection: bookings attributed to a domain by address match
  const { data: attributedBookings } = await supabaseAdmin
    .from('bookings')
    .select('attributed_domain, created_at, status')
    .not('attributed_domain', 'is', null)

  // Build domain → attributed booking dates (for matching visits to sales)
  const saleDomains: Record<string, string[]> = {}
  for (const b of (attributedBookings || [])) {
    const d = b.attributed_domain?.toLowerCase().replace(/^www\./, '')
    if (!d) continue
    if (!saleDomains[d]) saleDomains[d] = []
    saleDomains[d].push(b.created_at)
  }

  // Build liveFeed — deduplicate by session_id so 1 session = 1 visitor
  // feedRaw is ordered newest-first, so first hit per session has the best engagement data
  const seenSessions = new Set<string>()
  const liveFeed: {
    id: string; domain: string; device: string; referrer: string | null
    final_scroll: number; final_time: number; active_time: number
    engaged_30s: boolean; load_time_ms: number; cta_clicked: boolean
    cta_actions: string[]; manual_conversion: boolean; manual_sale: boolean
    auto_sale: boolean; utm_source: string | null; utm_medium: string | null
    utm_campaign: string | null; created_at: string; session_id: string | null
    visits: number; calls: number; texts: number; books: number
    mobile: number; desktop: number
  }[] = []

  for (const e of (feedRaw || [])) {
    if (!isCleanVisit(e.referrer) || !isLeadPage(e.page)) continue
    const sid = e.session_id || e.id
    if (seenSessions.has(sid)) continue
    seenSessions.add(sid)

    const bare = e.domain?.replace(/^www\./, '') || ''
    const s = stats[bare]
    const sessionCtas = e.session_id ? (ctaMap[e.session_id] || []) : []

    const visitTime = new Date(e.created_at).getTime()
    let autoSale = false
    if (sessionCtas.length > 0 && saleDomains[bare]) {
      autoSale = saleDomains[bare].some(bDate => new Date(bDate).getTime() >= visitTime)
    }

    liveFeed.push({
      id: e.id,
      domain: bare,
      device: e.device,
      referrer: e.referrer || null,
      final_scroll: e.final_scroll || 0,
      final_time: e.final_time || 0,
      active_time: e.active_time || 0,
      engaged_30s: e.engaged_30s || false,
      load_time_ms: e.load_time_ms || 0,
      cta_clicked: e.cta_clicked || false,
      cta_actions: sessionCtas,
      manual_conversion: e.manual_conversion || false,
      manual_sale: e.manual_sale || false,
      auto_sale: autoSale,
      utm_source: e.utm_source || null,
      utm_medium: e.utm_medium || null,
      utm_campaign: e.utm_campaign || null,
      created_at: e.created_at,
      session_id: e.session_id || null,
      visits: s?.visits || 0,
      calls: s?.calls || 0,
      texts: s?.texts || 0,
      books: s?.books || 0,
      mobile: s?.mobile || 0,
      desktop: s?.desktop || 0,
    })
  }

  const blocked = Array.from(blockedSet).sort()

  const totalVisitors = liveFeed.length
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime()

  // Previous period boundaries for comparison
  const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime()
  const startOfLastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7).getTime()
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1).getTime()
  const endOfLastYear = new Date(now.getFullYear(), 0, 1).getTime()

  let today = 0, thisWeek = 0, thisMonth = 0, thisYear = 0
  let yesterday = 0, lastWeek = 0, lastMonth = 0, lastYear = 0
  for (const e of liveFeed) {
    const t = new Date(e.created_at).getTime()
    if (t >= startOfToday) today++
    if (t >= startOfWeek) thisWeek++
    if (t >= startOfMonth) thisMonth++
    if (t >= startOfYear) thisYear++
    // Previous periods
    if (t >= startOfYesterday && t < startOfToday) yesterday++
    if (t >= startOfLastWeek && t < startOfWeek) lastWeek++
    if (t >= startOfLastMonth && t < startOfMonth) lastMonth++
    if (t >= startOfLastYear && t < endOfLastYear) lastYear++
  }

  // CTA stats — ALL unique sessions (a call is a call regardless of referrer)
  const allCtaEvents = (ctaRaw || []).filter(c => c.session_id)
  const callSessions = new Set(allCtaEvents.filter(c => c.action === 'call').map(c => c.session_id))
  const textSessions = new Set(allCtaEvents.filter(c => c.action === 'text').map(c => c.session_id))
  const totalCalls = callSessions.size
  const totalTexts = textSessions.size
  // Bookings = real form submissions via /book/new only (must have session + referrer)
  const { data: formBookings } = await supabaseAdmin
    .from('lead_clicks')
    .select('id, referrer, session_id, domain, device, created_at')
    .in('domain', allVariants)
    .eq('action', 'form_success')
    .eq('page', '/book/new')
  const validBookings = (formBookings || []).filter(b => b.session_id && b.referrer && b.referrer !== 'direct')
  const totalBooks = validBookings.length
  const bookingDetails = validBookings.map(b => ({
    id: b.id,
    domain: b.domain?.replace(/^www\./, '') || '',
    referrer: b.referrer,
    device: b.device || '',
    session_id: b.session_id,
    created_at: b.created_at,
  }))
  // Count manual conversion overrides not already counted via tracked CTAs
  const manualConvLeads = liveFeed.filter(e => e.manual_conversion && e.cta_actions.length === 0)
  const totalCtas = totalCalls + totalTexts + totalBooks + manualConvLeads.length

  // Conversion % = total CTAs / total visitors
  const conversionPct = totalVisitors > 0 ? parseFloat(((totalCtas / totalVisitors) * 100).toFixed(1)) : 0

  // New Sales = every client is a real sale
  const { data: allClients } = await supabaseAdmin
    .from('clients')
    .select('id, name, email, phone, created_at')
    .order('created_at', { ascending: false })
  const salesDetails = (allClients || []).map(c => ({
    client_id: c.id,
    name: c.name || '—',
    email: c.email || '—',
    phone: c.phone || '—',
    service: '—',
    price: 0,
    date: c.created_at || '',
  }))
  const totalSales = salesDetails.length
  // Close % = sales / total CTAs
  const closePct = totalCtas > 0 ? parseFloat(((totalSales / totalCtas) * 100).toFixed(1)) : 0

  const dashboard = {
    today, thisWeek, thisMonth, thisYear, allTime: totalVisitors,
    yesterday, lastWeek, lastMonth, lastYear,
    conversionPct, totalTexts, totalCalls, totalBooks, totalCtas,
    totalSales, closePct,
  }

  return NextResponse.json({ domains, totalVisitors, liveFeed, blocked, dashboard, ctaDetails, bookingDetails, salesDetails })
}
