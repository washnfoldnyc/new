import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { clientReminderEmail, clientThankYouEmail, adminPendingRemindersEmail, adminDailyNotificationDigestEmail, adminDailyOpsRecapEmail } from '@/lib/email-templates'
import type { DailyOpsJob } from '@/lib/email-templates'
import { protectCronAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'
import { sendPushToClient, sendPushToAll } from '@/lib/push'
import { notifyCleaner } from '@/lib/notify-cleaner'
import { getSettings } from '@/lib/settings'
import { sendSMS } from '@/lib/sms'
import { smsReminder } from '@/lib/sms-templates'

// TZ=America/New_York is set globally via instrumentation.ts
// All Date operations use Eastern Time automatically

function toNaive(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
  const now = new Date()
  const results: { type: string; booking_id: string }[] = []
  const settings = await getSettings()

  async function sendReminders(daysOut: number, type: string, label: string) {
    const target = new Date(now)
    target.setDate(target.getDate() + daysOut)
    target.setHours(0, 0, 0, 0)
    const targetEnd = new Date(target)
    targetEnd.setHours(23, 59, 59, 999)

    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*), cleaners(*)')
      .gte('start_time', toNaive(target))
      .lte('start_time', toNaive(targetEnd))
      .eq('status', 'scheduled')

    for (const booking of bookings || []) {
      const { data: existing } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('email_type', type)
        .limit(1)
      if (existing && existing.length > 0) continue

      // Email
      if (settings.client_reminder_email && booking.clients?.email) {
        const email = clientReminderEmail(booking, label)
        await sendEmail(booking.clients.email, email.subject, email.html)
      }

      // SMS
      if (settings.client_reminder_sms && booking.clients?.phone && booking.client_id) {
        sendSMS(booking.clients.phone, smsReminder(booking, label), {
          recipientType: 'client',
          recipientId: booking.client_id,
          smsType: type,
          bookingId: booking.id,
        }).catch(() => {})
      }

      await supabaseAdmin.from('email_logs').insert({ booking_id: booking.id, email_type: type, recipient: booking.clients?.email || 'sms-only' })
      results.push({ type, booking_id: booking.id })

      // Push alongside 1-day reminders
      if (type === 'reminder_1day') {
        const reminderDate = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        if (booking.client_id) {
          sendPushToClient(booking.client_id, 'Cleaning Tomorrow', `Your cleaning is ${label} - ${reminderDate}`, '/book/dashboard').catch(() => {})
        }
        if (booking.cleaner_id) {
          notifyCleaner({
            cleanerId: booking.cleaner_id,
            type: 'job_reminder',
            title: 'Job Tomorrow',
            message: `${booking.clients?.name} - ${label}`,
            bookingId: booking.id,
            skipEmail: true,
            skipSms: true
          }).catch(() => {})
        }
      }
    }
  }

  // Daily reminders — send between 8-9am ET
  if (now.getHours() === 8) {
    for (const days of settings.reminder_days) {
      const label = days === 1 ? 'tomorrow' : `in ${days} days`
      await sendReminders(days, `reminder_${days}day`, label)
    }
  }

  // Hours-before reminders — runs every hour, looks ahead by each configured hour value
  for (const hours of settings.reminder_hours_before) {
    const ahead = new Date(now.getTime() + hours * 60 * 60 * 1000)
    const windowStart = new Date(ahead)
    windowStart.setMinutes(0, 0, 0)
    const windowEnd = new Date(windowStart)
    windowEnd.setMinutes(59, 59, 999)

    const emailType = `reminder_${hours}hour`
    const label = `in ${hours} hour${hours === 1 ? '' : 's'}`

    const { data: hourBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*), cleaners(*)')
      .gte('start_time', toNaive(windowStart))
      .lte('start_time', toNaive(windowEnd))
      .eq('status', 'scheduled')

    for (const booking of hourBookings || []) {
      const { data: existing } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('booking_id', booking.id)
        .eq('email_type', emailType)
        .limit(1)
      if (existing && existing.length > 0) continue

      // Email
      if (settings.client_reminder_email && booking.clients?.email) {
        const email = clientReminderEmail(booking, label)
        await sendEmail(booking.clients.email, email.subject, email.html)
      }

      // SMS
      if (settings.client_reminder_sms && booking.clients?.phone && booking.client_id) {
        sendSMS(booking.clients.phone, smsReminder(booking, label), {
          recipientType: 'client',
          recipientId: booking.client_id,
          smsType: emailType,
          bookingId: booking.id,
        }).catch(() => {})
      }

      await supabaseAdmin.from('email_logs').insert({ booking_id: booking.id, email_type: emailType, recipient: booking.clients?.email || 'sms-only' })
      results.push({ type: emailType, booking_id: booking.id })

      // Push notification
      if (booking.client_id) {
        sendPushToClient(booking.client_id, `Cleaning in ${hours} Hour${hours === 1 ? '' : 's'}`, `Your cleaner ${booking.cleaners?.name || ''} arrives soon`, '/book/dashboard').catch(() => {})
      }
      if (booking.cleaner_id) {
        notifyCleaner({
          cleanerId: booking.cleaner_id,
          type: 'job_reminder',
          title: `Job in ${hours} Hour${hours === 1 ? '' : 's'}`,
          message: `${booking.clients?.name} - starting soon`,
          bookingId: booking.id,
          skipEmail: true,
          skipSms: true
        }).catch(() => {})
      }
    }
  }

  // ---- 15-min before done: Payment notification ----
  const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000)
  const payWindowStart = new Date(now.getTime() + 10 * 60 * 1000)
  const payWindowEnd = new Date(now.getTime() + 20 * 60 * 1000)

  const { data: endingSoonBookings } = await supabaseAdmin
    .from('bookings')
    .select('*, clients(*), cleaners(*)')
    .eq('status', 'in_progress')
    .gte('end_time', toNaive(payWindowStart))
    .lte('end_time', toNaive(payWindowEnd))

  for (const booking of endingSoonBookings || []) {
    const { data: existing } = await supabaseAdmin
      .from('email_logs')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('email_type', 'payment_15min')
      .limit(1)
    if (existing && existing.length > 0) continue

    const durationMs = new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()
    const hours = durationMs / (1000 * 60 * 60)
    const hourlyRate = booking.hourly_rate || 75
    const amount = (hours * hourlyRate).toFixed(0)
    const clientName = booking.clients?.name || 'Client'
    const cleanerName = booking.cleaners?.name || 'Cleaner'

    // Dedup log
    await supabaseAdmin.from('email_logs').insert({ booking_id: booking.id, email_type: 'payment_15min', recipient: 'admin-only' })
    results.push({ type: 'payment_15min', booking_id: booking.id })

    // NOTE: Client payment email/SMS removed — clients should not receive amount owed

    // Push to admin
    sendPushToAll('Collect Payment', `${clientName} — $${amount} due in 15 min`, '/admin/bookings').catch(() => {})

    // Dashboard notification
    await supabaseAdmin.from('notifications').insert({
      type: 'payment_due',
      title: 'Payment Due Soon',
      message: `${clientName} — $${amount} due in 15 min (${cleanerName})`
    })
  }

  // ---- Thank You Email: 3 days after first-time client's completed booking ----
  if (now.getHours() === 8) {
    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    threeDaysAgo.setHours(0, 0, 0, 0)
    const threeDaysAgoEnd = new Date(threeDaysAgo)
    threeDaysAgoEnd.setHours(23, 59, 59, 999)

    // Find bookings completed ~3 days ago
    const { data: completedBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*)')
      .eq('status', 'completed')
      .gte('end_time', toNaive(threeDaysAgo))
      .lte('end_time', toNaive(threeDaysAgoEnd))

    for (const booking of completedBookings || []) {
      if (!booking.clients?.email || !booking.client_id) continue

      // Check if we already sent a thank you for this client (within last year)
      const oneYearAgo = new Date(now)
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const { data: alreadySent } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('email_type', 'thank_you')
        .eq('recipient', booking.clients.email)
        .gte('created_at', oneYearAgo.toISOString())
        .limit(1)
      if (alreadySent && alreadySent.length > 0) continue

      // Check this was their first booking (no earlier completed bookings)
      const { count } = await supabaseAdmin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', booking.client_id)
        .eq('status', 'completed')
        .lt('end_time', toNaive(threeDaysAgo))

      if ((count || 0) === 0) {
        const email = clientThankYouEmail(booking.clients.name || '')
        await sendEmail(booking.clients.email, email.subject, email.html)
        await supabaseAdmin.from('email_logs').insert({ booking_id: booking.id, email_type: 'thank_you', recipient: booking.clients.email })
        results.push({ type: 'thank_you', booking_id: booking.id })

      }
    }
  }

  // ---- Unpaid Team Notification: Notify admin at 8am about completed jobs where team hasn't been paid ----
  if (now.getHours() === 8) {
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

    const { data: unpaidBookings } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('status', 'completed')
      .lt('end_time', toNaive(twoDaysAgo))
      .or('cleaner_paid.is.null,cleaner_paid.eq.false')

    if (unpaidBookings && unpaidBookings.length > 0) {
      await supabaseAdmin.from('notifications').insert({
        type: 'unpaid_team',
        title: 'Unpaid Team',
        message: `${unpaidBookings.length} completed job${unpaidBookings.length !== 1 ? 's' : ''} with unpaid team`
      })
      results.push({ type: 'unpaid_team', booking_id: 'admin' })
    }
  }

  // ---- Pending Booking Reminders: Notify admin at 8am and 2pm about unassigned pending bookings ----
  if (now.getHours() === 8 || now.getHours() === 14) {
    const { data: pendingBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(*)')
      .eq('status', 'pending')
      .order('start_time', { ascending: true })

    if (pendingBookings && pendingBookings.length > 0) {
      // Create dashboard notification
      await supabaseAdmin.from('notifications').insert({
        type: 'pending_reminder',
        title: 'Pending Bookings',
        message: `${pendingBookings.length} booking${pendingBookings.length !== 1 ? 's' : ''} still pending — review and assign`
      })

      // Send admin email
      if (process.env.ADMIN_EMAIL) {
        const emailData = pendingBookings.map((b: any) => ({
          client_name: b.clients?.name || 'Unknown',
          date: new Date(b.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
          service_type: b.service_type || 'Standard Cleaning'
        }))
        const email = adminPendingRemindersEmail(emailData)
        await sendEmail(process.env.ADMIN_EMAIL, email.subject, email.html)
        results.push({ type: 'pending_reminder', booking_id: 'admin' })
      }
    }
  }

  // ---- 8pm Daily Ops Recap: Today's jobs + financials + tomorrow's schedule ----
  if (now.getHours() === 20) {
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    const tomorrowStart = new Date(now)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)
    tomorrowStart.setHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrowStart)
    tomorrowEnd.setHours(23, 59, 59, 999)

    // Today's jobs (all statuses except cancelled)
    const { data: todayBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(name, email, phone), cleaners(name)')
      .gte('start_time', toNaive(todayStart))
      .lte('start_time', toNaive(todayEnd))
      .neq('status', 'cancelled')
      .order('start_time')

    // Tomorrow's jobs
    const { data: tomorrowBookings } = await supabaseAdmin
      .from('bookings')
      .select('*, clients(name, email, phone), cleaners(name)')
      .gte('start_time', toNaive(tomorrowStart))
      .lte('start_time', toNaive(tomorrowEnd))
      .eq('status', 'scheduled')
      .order('start_time')

    // Check which tomorrow clients got reminders
    const tomorrowReminderStatus: Record<string, { emailed: boolean; smsed: boolean }> = {}
    for (const b of tomorrowBookings || []) {
      const { data: emailLogs } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('booking_id', b.id)
        .like('email_type', 'reminder%')
        .limit(1)
      const { data: smsLogs } = await supabaseAdmin
        .from('sms_logs')
        .select('id')
        .eq('booking_id', b.id)
        .like('sms_type', 'reminder%')
        .limit(1)
      tomorrowReminderStatus[b.id] = {
        emailed: (emailLogs?.length || 0) > 0,
        smsed: (smsLogs?.length || 0) > 0
      }
    }

    function toOpsJob(b: any, reminders?: { emailed: boolean; smsed: boolean }): DailyOpsJob {
      const startTime = new Date(b.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const endTime = new Date(b.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      const durationHrs = (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60 * 60)
      const laborCost = b.cleaner_pay || Math.round(durationHrs * (b.cleaner_pay_rate || 35) * 100)
      return {
        clientName: b.clients?.name || 'Unknown',
        cleanerName: b.cleaners?.name || 'Unassigned',
        time: `${startTime} – ${endTime}`,
        serviceType: b.service_type || 'Standard',
        revenue: b.price || 0,
        laborCost,
        paymentStatus: b.payment_status || 'pending',
        paymentMethod: b.payment_method,
        remindersEmailed: reminders?.emailed ?? false,
        remindersSmsed: reminders?.smsed ?? false,
        recurring: b.recurring_type
      }
    }

    const todayJobs = (todayBookings || []).map(b => toOpsJob(b))
    const tomorrowJobs = (tomorrowBookings || []).map(b => toOpsJob(b, tomorrowReminderStatus[b.id]))

    const sum = (jobs: DailyOpsJob[], field: 'revenue' | 'laborCost') => jobs.reduce((s, j) => s + j[field], 0)
    const todayRevenue = sum(todayJobs, 'revenue')
    const todayLabor = sum(todayJobs, 'laborCost')
    const tomorrowRevenue = sum(tomorrowJobs, 'revenue')
    const tomorrowLabor = sum(tomorrowJobs, 'laborCost')

    const todayDateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const tomorrowDateObj = new Date(now)
    tomorrowDateObj.setDate(tomorrowDateObj.getDate() + 1)
    const tomorrowDateStr = tomorrowDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    const emailData = {
      todayDate: todayDateStr,
      tomorrowDate: tomorrowDateStr,
      todayJobs,
      tomorrowJobs,
      todayRevenue,
      todayLabor,
      todayProfit: todayRevenue - todayLabor,
      tomorrowRevenue,
      tomorrowLabor,
      tomorrowProfit: tomorrowRevenue - tomorrowLabor,
      todayPaid: todayJobs.filter(j => j.paymentStatus === 'paid').length,
      todayUnpaid: todayJobs.filter(j => j.paymentStatus !== 'paid').length,
    }

    // Dashboard notification
    await supabaseAdmin.from('notifications').insert({
      type: 'daily_ops_recap',
      title: 'Daily Ops Recap',
      message: `Today: ${todayJobs.length} jobs, $${(todayRevenue / 100).toFixed(0)} revenue · Tomorrow: ${tomorrowJobs.length} jobs scheduled`
    })

    // Admin email
    if (process.env.ADMIN_EMAIL) {
      const email = adminDailyOpsRecapEmail(emailData)
      await sendEmail(process.env.ADMIN_EMAIL, email.subject, email.html)
    }

    results.push({ type: 'daily_ops_recap', booking_id: 'admin' })
  }

  // ---- 9pm Nightly Digest: Summary of all client emails + texts sent today ----
  if (now.getHours() === 21) {
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)

    // Get all client emails sent today
    const { data: todayEmails } = await supabaseAdmin
      .from('email_logs')
      .select('email_type, recipient, sent_at, booking_id')
      .gte('sent_at', todayStart.toISOString())
      .lte('sent_at', todayEnd.toISOString())
      .not('email_type', 'in', '("pending_reminder","thank_you")')

    // Look up client names for emails
    const emailEntries: { client: string; type: string; time: string }[] = []
    for (const e of todayEmails || []) {
      let clientName = e.recipient
      if (e.booking_id) {
        const { data: booking } = await supabaseAdmin
          .from('bookings')
          .select('clients(name)')
          .eq('id', e.booking_id)
          .single()
        if (booking?.clients) clientName = (booking.clients as any).name || e.recipient
      }
      const typeLabel = e.email_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      const time = new Date(e.sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      emailEntries.push({ client: clientName, type: typeLabel, time })
    }

    // Get all client texts sent today
    const { data: todayTexts } = await supabaseAdmin
      .from('sms_logs')
      .select('sms_type, recipient, created_at, booking_id')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString())
      .not('sms_type', 'in', '("chatbot","admin_forward","escalation")')

    const smsEntries: { client: string; type: string; time: string }[] = []
    for (const s of todayTexts || []) {
      let clientName = s.recipient
      if (s.booking_id) {
        const { data: booking } = await supabaseAdmin
          .from('bookings')
          .select('clients(name)')
          .eq('id', s.booking_id)
          .single()
        if (booking?.clients) clientName = (booking.clients as any).name || s.recipient
      }
      const typeLabel = s.sms_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      const time = new Date(s.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      smsEntries.push({ client: clientName, type: typeLabel, time })
    }

    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    // Dashboard notification
    await supabaseAdmin.from('notifications').insert({
      type: 'daily_digest',
      title: 'Daily Notification Digest',
      message: `${emailEntries.length} email${emailEntries.length !== 1 ? 's' : ''}, ${smsEntries.length} text${smsEntries.length !== 1 ? 's' : ''} sent to clients today`
    })

    // Admin email
    if (process.env.ADMIN_EMAIL) {
      const email = adminDailyNotificationDigestEmail({
        date: dateStr,
        emails: emailEntries,
        texts: smsEntries
      })
      await sendEmail(process.env.ADMIN_EMAIL, email.subject, email.html)
    }

    results.push({ type: 'daily_digest', booking_id: 'admin' })
  }

  return NextResponse.json({ success: true, sent: results.length, results })
  } catch (err) {
    await trackError(err, { source: 'cron/reminders', severity: 'critical' })
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 })
  }
}
