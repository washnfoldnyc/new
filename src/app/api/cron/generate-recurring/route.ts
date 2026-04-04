import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateToken } from '@/lib/tokens'
import { generateScheduleDates } from '@/lib/recurring'
import { protectCronAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const results: { schedule_id: string; client: string; bookings_created: number }[] = []

    // 1. Auto-resume paused schedules past their resume date
    const { data: resumable } = await supabaseAdmin
      .from('recurring_schedules')
      .select('id, clients(name)')
      .eq('status', 'paused')
      .lte('paused_until', todayStr)

    for (const schedule of resumable || []) {
      await supabaseAdmin
        .from('recurring_schedules')
        .update({ status: 'active', paused_until: null, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)

      await supabaseAdmin.from('notifications').insert({
        type: 'recurring_auto_resumed',
        title: 'Schedule Auto-Resumed',
        message: `${(schedule.clients as any)?.name} - auto-resumed after pause`
      })
    }

    // 2. Get all active schedules that need bookings generated
    const { data: schedules, error } = await supabaseAdmin
      .from('recurring_schedules')
      .select('*, clients(id, name, email), cleaners(id, name, email)')
      .eq('status', 'active')

    if (error) {
      await trackError(error, { source: 'cron/generate-recurring', severity: 'critical' })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    for (const schedule of schedules || []) {
      // Check if we need to generate more bookings
      // Generate from next_generate_after or today, whichever is later
      const generateFrom = schedule.next_generate_after
        ? (schedule.next_generate_after > todayStr ? schedule.next_generate_after : todayStr)
        : todayStr

      // Check how many future bookings exist for this schedule
      const { count } = await supabaseAdmin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', schedule.id)
        .in('status', ['scheduled', 'pending'])
        .gte('start_time', today.toISOString())

      // Only generate if fewer than 6 future bookings
      if ((count || 0) >= 6) continue

      // Generate dates — look further ahead for monthly patterns
      const isMonthly = schedule.recurring_type?.toLowerCase().includes('monthly') ||
                        schedule.recurring_type?.match(/^\d(st|nd|rd|th)\s/)
      const weeksOut = isMonthly ? 16 : 6
      const dates = generateScheduleDates(
        generateFrom,
        schedule.recurring_type,
        schedule.day_of_week,
        weeksOut
      )

      if (dates.length === 0) continue

      // Check for existing bookings on these dates to avoid duplicates
      const { data: existingBookings } = await supabaseAdmin
        .from('bookings')
        .select('start_time')
        .eq('schedule_id', schedule.id)
        .in('status', ['scheduled', 'pending'])

      const existingDates = new Set(
        (existingBookings || []).map((b: any) => b.start_time.split('T')[0])
      )

      const newDates = dates.filter(d => !existingDates.has(d))
      if (newDates.length === 0) continue

      // Build booking rows
      const rawTime = schedule.preferred_time || '09:00'
      // Normalize to HH:MM — some rows store HH:MM:SS
      const timeStr = rawTime.split(':').slice(0, 2).join(':')
      const hours = Number(schedule.duration_hours) || 3
      const startH = parseInt(timeStr.split(':')[0])
      const startM = parseInt(timeStr.split(':')[1])
      const totalEndMinutes = (startH + hours) * 60 + startM
      const endH = Math.floor(totalEndMinutes / 60) % 24
      const endM = totalEndMinutes % 60

      const rows = newDates.map((date: string) => {
        const token = generateToken()
        const startTime = `${date}T${timeStr}:00`
        const endTime = `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`
        const tokenExpires = new Date(date + 'T' + timeStr)
        tokenExpires.setHours(tokenExpires.getHours() + 24)

        return {
          client_id: schedule.client_id,
          cleaner_id: schedule.cleaner_id,
          start_time: startTime,
          end_time: endTime,
          service_type: 'Standard Cleaning',
          price: Math.round((schedule.hourly_rate || 75) * hours * 100),
          hourly_rate: schedule.hourly_rate || null,
          notes: schedule.notes || null,
          recurring_type: schedule.recurring_type,
          cleaner_token: token,
          token_expires_at: tokenExpires.toISOString(),
          status: 'scheduled',
          cleaner_pay_rate: schedule.cleaner_pay_rate || null,
          schedule_id: schedule.id,
        }
      })

      const { error: insertError } = await supabaseAdmin
        .from('bookings')
        .insert(rows)

      if (insertError) {
        console.error(`Failed to generate bookings for schedule ${schedule.id}:`, insertError)
        await trackError(insertError, { source: 'cron/generate-recurring', severity: 'high', extra: `Schedule ${schedule.id} booking generation failed` })
        continue
      }

      // Update next_generate_after
      const lastDate = newDates[newDates.length - 1]
      await supabaseAdmin
        .from('recurring_schedules')
        .update({ next_generate_after: lastDate, updated_at: new Date().toISOString() })
        .eq('id', schedule.id)

      results.push({
        schedule_id: schedule.id,
        client: (schedule.clients as any)?.name || 'Unknown',
        bookings_created: newDates.length
      })
    }

    // Admin notification if any bookings were generated
    if (results.length > 0) {
      const totalCreated = results.reduce((sum, r) => sum + r.bookings_created, 0)
      const summary = results.map(r => `${r.client}: ${r.bookings_created}`).join(', ')
      await supabaseAdmin.from('notifications').insert({
        type: 'recurring_generated',
        title: 'Recurring Bookings Generated',
        message: `${totalCreated} bookings created for ${results.length} schedule${results.length !== 1 ? 's' : ''}. ${summary}`
      })
    }

    return NextResponse.json({
      generated: results.length,
      resumed: resumable?.length || 0,
      details: results
    })
  } catch (err) {
    await trackError(err, { source: 'cron/generate-recurring', severity: 'critical' })
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
