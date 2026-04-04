import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectCronAPI } from '@/lib/auth'
import { sendSMS } from '@/lib/sms'
import { notify } from '@/lib/notify'
import { getActiveMoments, pickMessage, qualifiesForMoment } from '@/lib/outreach'

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
    const moments = getActiveMoments()
    if (moments.length === 0) {
      return NextResponse.json({ success: true, message: 'No active outreach moment today', sent: 0 })
    }

    // Get all clients — exclude DNS, archived, SMS opted out
    const { data: allClients } = await supabaseAdmin
      .from('clients')
      .select('id, name, phone, pet_name, pet_type, do_not_service, sms_marketing_opt_out, sms_consent, outreach_count')
      .neq('active', false)
      .neq('do_not_service', true)
      .order('created_at', { ascending: false })
      .limit(10000)

    if (!allClients || allClients.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No eligible clients' })
    }

    // Get clients who are currently scheduled (upcoming bookings)
    const now = new Date()
    const { data: scheduledBookings } = await supabaseAdmin
      .from('bookings')
      .select('client_id')
      .gte('start_time', now.toISOString())
      .in('status', ['scheduled', 'confirmed', 'pending', 'in_progress'])

    const scheduledClientIds = new Set((scheduledBookings || []).map(b => b.client_id))

    // Get clients with active recurring schedules
    const { data: recurringSchedules } = await supabaseAdmin
      .from('recurring_schedules')
      .select('client_id')
      .eq('status', 'active')

    const recurringClientIds = new Set((recurringSchedules || []).map(r => r.client_id))

    // Get clients on the live follow-ups board (sales board)
    const { data: activeDeals } = await supabaseAdmin
      .from('deals')
      .select('client_id')
      .eq('stage', 'active')

    const onSalesBoard = new Set((activeDeals || []).map(d => d.client_id))

    // Eligible = not scheduled, not recurring, not on sales board, has phone, not opted out
    const eligible = allClients.filter(c =>
      c.phone &&
      !c.sms_marketing_opt_out &&
      c.sms_consent !== false &&
      !scheduledClientIds.has(c.id) &&
      !recurringClientIds.has(c.id) &&
      !onSalesBoard.has(c.id)
    )

    let totalSent = 0

    for (const moment of moments) {
      // Get already-sent log entries for this moment
      const { data: alreadySent } = await supabaseAdmin
        .from('outreach_log')
        .select('client_id')
        .eq('moment_id', moment.id)

      const sentIds = new Set((alreadySent || []).map(l => l.client_id))

      // Filter to clients not yet texted for this moment
      const toSend = eligible.filter(c => {
        if (sentIds.has(c.id)) return false
        return qualifiesForMoment(moment, c.pet_type, c.pet_name)
      })

      for (const client of toSend) {
        const message = pickMessage(moment, client.id, client.name, client.pet_name)

        const result = await sendSMS(client.phone, message, {
          skipConsent: false,
          recipientType: 'client',
          recipientId: client.id,
          smsType: 'outreach',
        })

        if (result.success) {
          // Log to outreach_log (dedup)
          await supabaseAdmin.from('outreach_log').insert({
            client_id: client.id,
            moment_id: moment.id,
            message,
          }).then(() => {}, () => {}) // Ignore unique constraint errors

          // Log to client SMS transcript
          await supabaseAdmin.from('client_sms_messages').insert({
            client_id: client.id,
            direction: 'outbound',
            message,
          }).then(() => {}, () => {})

          // Update outreach tracking on client
          await supabaseAdmin
            .from('clients')
            .update({
              last_outreach_at: new Date().toISOString(),
              outreach_count: (client.outreach_count || 0) + 1,
            })
            .eq('id', client.id)

          totalSent++
        }
      }

      // Notify admin once per moment
      if (toSend.length > 0) {
        await notify({
          type: 'sales_follow_up',
          title: `Selena Outreach: ${moment.name}`,
          message: `Sent ${toSend.length} check-in texts for ${moment.name}`,
        })
      }
    }

    return NextResponse.json({ success: true, sent: totalSent, moments: moments.map(m => m.name) })
  } catch (err) {
    console.error('Outreach cron error:', err)
    return NextResponse.json({ error: 'Outreach cron failed' }, { status: 500 })
  }
}
