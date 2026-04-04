import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { cleanerDailySummaryEmail } from '@/lib/email-templates'
import { smsDailySummary } from '@/lib/sms-templates'
import { notifyCleaner } from '@/lib/notify-cleaner'
import { protectCronAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'

export async function GET(request: Request) {
  // Protect cron route
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
  // TZ=America/New_York set globally via instrumentation.ts
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const threeDaysEnd = new Date(now)
  threeDaysEnd.setDate(threeDaysEnd.getDate() + 3)
  threeDaysEnd.setHours(23, 59, 59, 999)

  const { data: cleaners } = await supabaseAdmin.from('cleaners').select('*').eq('active', true)
  const results = []

  for (const cleaner of cleaners || []) {
    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*)')
      .eq('cleaner_id', cleaner.id)
      .gte('start_time', tomorrow.toISOString())
      .lte('start_time', threeDaysEnd.toISOString())
      .in('status', ['scheduled', 'pending'])
      .order('start_time')

    if (bookings && bookings.length > 0) {
      const emailContent = cleanerDailySummaryEmail(cleaner.name, bookings)
      const report = await notifyCleaner({
        cleanerId: cleaner.id,
        type: 'daily_summary',
        title: `Next 3 Days: ${bookings.length} job${bookings.length === 1 ? '' : 's'}`,
        message: `${bookings.length} job${bookings.length === 1 ? '' : 's'} scheduled`,
        smsMessage: smsDailySummary(cleaner.name, bookings.length, cleaner.pin, bookings),
        emailSubject: emailContent.subject,
        emailHtml: emailContent.html
      })
      results.push({ cleaner: cleaner.name, jobs: bookings.length, push: report.push, email: report.email, sms: report.sms })
    }
  }

  // Admin notification with delivery confirmations
  if (results.length > 0) {
    const summary = results.map((r: any) => `${r.cleaner}: ${r.jobs} jobs — push ${r.push ? '✓' : '✗'} email ${r.email ? '✓' : '✗'} sms ${r.sms ? '✓' : '✗'}`).join(', ')
    await supabaseAdmin.from('notifications').insert({
      type: 'daily_summary_sent',
      title: 'Daily Summary Sent',
      message: `Sent to ${results.length} cleaner${results.length !== 1 ? 's' : ''}. ${summary}`
    })
  }

  // Check for recurring bookings ending soon (within 30 days)
  const expiringRecurring = await checkExpiringRecurring()

  return NextResponse.json({ sent: results.length, details: results, expiringRecurring })
  } catch (err) {
    await trackError(err, { source: 'cron/daily-summary', severity: 'critical' })
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}

async function checkExpiringRecurring() {
  const now = new Date()
  const thirtyDaysOut = new Date()
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)

  // Use recurring_schedules table for precise series tracking
  const { data: schedules } = await supabaseAdmin
    .from('recurring_schedules')
    .select('id, client_id, recurring_type, clients(name, email)')
    .eq('status', 'active')

  const expiringSeries = []

  for (const schedule of schedules || []) {
    // Find the latest scheduled booking for this schedule
    const { data: latestBooking } = await supabaseAdmin
      .from('bookings')
      .select('start_time')
      .eq('schedule_id', schedule.id)
      .in('status', ['scheduled', 'pending'])
      .order('start_time', { ascending: false })
      .limit(1)
      .single()

    if (!latestBooking) continue

    const lastDate = new Date(latestBooking.start_time)

    // Check if last booking is within 30 days
    if (lastDate <= thirtyDaysOut && lastDate >= now) {
      const clientName = (schedule.clients as any)?.name || 'Unknown'

      // Check if we already notified about this schedule recently (within 7 days)
      const { data: existingNotif } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('type', 'recurring_expiring')
        .like('message', `%${clientName}%${schedule.recurring_type}%`)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(1)

      if (!existingNotif || existingNotif.length === 0) {
        const lastDateStr = lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

        // Create dashboard notification
        await supabaseAdmin.from('notifications').insert({
          type: 'recurring_expiring',
          title: 'Recurring Booking Ending Soon',
          message: `${clientName} - ${schedule.recurring_type} ends ${lastDateStr}`
        })

        // Send admin email
        if (process.env.ADMIN_EMAIL) {
          const html = `
            <div style="font-family: sans-serif; max-width: 500px;">
              <h2 style="color: #000;">Recurring Booking Ending Soon</h2>
              <p><strong>Client:</strong> ${clientName}</p>
              <p><strong>Schedule:</strong> ${schedule.recurring_type}</p>
              <p><strong>Last Booking:</strong> ${lastDateStr}</p>
              <p style="margin-top: 20px;">
                <a href="https://www.washandfoldnyc.com/admin/bookings" style="background: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Extend in Dashboard</a>
              </p>
            </div>
          `
          await sendEmail(process.env.ADMIN_EMAIL, `Recurring ending: ${clientName} (${schedule.recurring_type})`, html)
        }

        expiringSeries.push({ client: clientName, type: schedule.recurring_type, lastBooking: lastDateStr })
      }
    }
  }

  return expiringSeries
}
