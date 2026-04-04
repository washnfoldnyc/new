import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectCronAPI } from '@/lib/auth'
import { notify } from '@/lib/notify'
import { smsAdmins } from '@/lib/admin-contacts'

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const { data: deals, error } = await supabaseAdmin
      .from('deals')
      .select('id, follow_up_at, follow_up_note, clients(name, phone)')
      .eq('stage', 'active')
      .lte('follow_up_at', now.toISOString())
      .gte('follow_up_at', oneHourAgo.toISOString())

    if (error) throw error
    if (!deals || deals.length === 0) {
      return NextResponse.json({ success: true, reminded: 0 })
    }

    // Dedup — skip deals already notified this hour
    const dealIds = deals.map(d => d.id)
    const { data: existingNotifs } = await supabaseAdmin
      .from('notifications')
      .select('deal_id')
      .in('deal_id', dealIds)
      .eq('type', 'sales_follow_up')
      .gte('created_at', oneHourAgo.toISOString())

    const notifiedIds = new Set((existingNotifs || []).map(n => n.deal_id))
    const toNotify = deals.filter(d => !notifiedIds.has(d.id))

    let reminded = 0
    for (const deal of toNotify) {
      const clientName = (deal.clients as any)?.name || 'Unknown'
      const note = deal.follow_up_note || 'Follow up now'
      const message = `${clientName} — ${note}`

      await notify({
        type: 'sales_follow_up',
        title: 'Sales Follow-Up Due',
        message,
        url: '/admin/sales',
      })

      // Tag notification with deal_id for dedup
      await supabaseAdmin
        .from('notifications')
        .update({ deal_id: deal.id })
        .eq('type', 'sales_follow_up')
        .eq('message', message)
        .is('deal_id', null)
        .order('created_at', { ascending: false })
        .limit(1)

      await smsAdmins(`Sales follow-up: ${message}`)
      reminded++
    }

    return NextResponse.json({ success: true, reminded })
  } catch (err) {
    console.error('Sales follow-ups cron error:', err)
    return NextResponse.json({ error: 'Failed to process follow-ups' }, { status: 500 })
  }
}
