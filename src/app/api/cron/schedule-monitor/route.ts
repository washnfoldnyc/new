import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectCronAPI } from '@/lib/auth'
import { trackError } from '@/lib/error-tracking'
import { guessZoneFromAddress, zoneRequiresCar } from '@/lib/service-zones'
import { calculateDistance, estimateTransitMinutes } from '@/lib/geo'

interface Issue {
  type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  booking_id?: string
  booking_ids: string[]
  cleaner_id?: string
  client_id?: string
  date?: string
}

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  try {
    const issues: Issue[] = []
    const now = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + 14)
    const pad = (n: number) => String(n).padStart(2, '0')
    const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const todayStr = toDateStr(now)
    const BUFFER_MIN = 60

    const { data: bookings } = await supabaseAdmin
      .from('bookings')
      .select('id, client_id, cleaner_id, start_time, end_time, status, price, hourly_rate, service_type, clients(id, name, address, latitude, longitude), cleaners(id, name, working_days, unavailable_dates, max_jobs_per_day, service_zones, has_car, home_by_time, home_latitude, home_longitude, schedule)')
      .gte('start_time', todayStr + 'T00:00:00')
      .lte('start_time', toDateStr(endDate) + 'T23:59:59')
      .in('status', ['scheduled', 'pending', 'confirmed', 'in_progress'])

    if (!bookings || bookings.length === 0) {
      return NextResponse.json({ success: true, issues: 0 })
    }

    // Also check past 3 days for payment/closeout issues
    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const { data: recentCompleted } = await supabaseAdmin
      .from('bookings')
      .select('id, client_id, cleaner_id, start_time, end_time, status, payment_status, cleaner_paid, price, clients(name), cleaners(name)')
      .eq('status', 'completed')
      .gte('end_time', toDateStr(threeDaysAgo) + 'T00:00:00')

    // Group by date
    const byDate: Record<string, typeof bookings> = {}
    for (const b of bookings) {
      const date = b.start_time.split('T')[0]
      if (!byDate[date]) byDate[date] = []
      byDate[date].push(b)
    }

    for (const [date, dayBookings] of Object.entries(byDate)) {
      const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })

      // ── 1. DUPLICATE CLIENT ──
      const clientGroups: Record<string, typeof bookings> = {}
      for (const b of dayBookings) {
        if (!b.client_id) continue
        if (!clientGroups[b.client_id]) clientGroups[b.client_id] = []
        clientGroups[b.client_id].push(b)
      }
      for (const [, group] of Object.entries(clientGroups)) {
        if (group.length > 1) {
          const name = (group[0].clients as any)?.name || 'Client'
          const cleanerNames = group.map(b => (b.cleaners as any)?.name || 'Unassigned').join(' + ')
          issues.push({ type: 'duplicate_client', severity: 'critical', message: `${name} double-booked on ${date} (${cleanerNames})`, booking_ids: group.map(b => b.id), client_id: group[0].client_id || undefined, date })
        }
      }

      // ── PER-CLEANER CHECKS ──
      const cleanerGroups: Record<string, typeof bookings> = {}
      for (const b of dayBookings) {
        if (!b.cleaner_id) continue
        if (!cleanerGroups[b.cleaner_id]) cleanerGroups[b.cleaner_id] = []
        cleanerGroups[b.cleaner_id].push(b)
      }

      for (const [cleanerId, cBookings] of Object.entries(cleanerGroups)) {
        const sorted = cBookings.sort((a, b) => a.start_time.localeCompare(b.start_time))
        const cleaner = sorted[0].cleaners as any
        if (!cleaner) continue

        // ── 2. TIME CONFLICTS ──
        for (let i = 0; i < sorted.length - 1; i++) {
          const endMin = toMin(sorted[i].end_time)
          const nextStartMin = toMin(sorted[i + 1].start_time)
          if (endMin > nextStartMin) {
            issues.push({ type: 'time_conflict', severity: 'critical', message: `${cleaner.name} has overlapping jobs on ${date}: ${(sorted[i].clients as any)?.name} and ${(sorted[i + 1].clients as any)?.name}`, booking_ids: [sorted[i].id, sorted[i + 1].id], cleaner_id: cleanerId, date })
          }
        }

        // ── 3. BUFFER VIOLATIONS ── (jobs too close, not enough travel time)
        for (let i = 0; i < sorted.length - 1; i++) {
          const endMin = toMin(sorted[i].end_time)
          const nextStartMin = toMin(sorted[i + 1].start_time)
          const gap = nextStartMin - endMin
          if (gap > 0 && gap < BUFFER_MIN) {
            const c1 = sorted[i].clients as any
            const c2 = sorted[i + 1].clients as any
            issues.push({ type: 'tight_buffer', severity: 'warning', message: `${cleaner.name} has only ${gap}min between ${c1?.name || 'job'} and ${c2?.name || 'job'} on ${date} (need ${BUFFER_MIN}min)`, booking_ids: [sorted[i].id, sorted[i + 1].id], cleaner_id: cleanerId, date })
          }
        }

        // ── 4. OVER MAX JOBS ──
        if (cleaner.max_jobs_per_day && cBookings.length > cleaner.max_jobs_per_day) {
          issues.push({ type: 'over_max_jobs', severity: 'warning', message: `${cleaner.name} has ${cBookings.length} jobs on ${date} (max ${cleaner.max_jobs_per_day})`, booking_ids: cBookings.map(b => b.id), cleaner_id: cleanerId, date })
        }

        // ── 5. HOME-BY RISK ──
        if (cleaner.home_by_time && cleaner.home_latitude && cleaner.home_longitude) {
          const lastJob = sorted[sorted.length - 1]
          const lastEndMin = toMin(lastJob.end_time)
          const lastClient = lastJob.clients as any
          const [hbH, hbM] = cleaner.home_by_time.split(':').map(Number)
          const homeByMin = hbH * 60 + hbM

          let travelHome = 30 // default estimate
          if (lastClient?.latitude && lastClient?.longitude) {
            const dist = calculateDistance(Number(lastClient.latitude), Number(lastClient.longitude), Number(cleaner.home_latitude), Number(cleaner.home_longitude))
            travelHome = estimateTransitMinutes(dist)
          }

          if (lastEndMin + travelHome > homeByMin) {
            const arriveHome = lastEndMin + travelHome
            const arriveStr = `${Math.floor(arriveHome / 60) % 12 || 12}:${String(arriveHome % 60).padStart(2, '0')} ${arriveHome >= 720 ? 'PM' : 'AM'}`
            issues.push({ type: 'home_by_risk', severity: 'warning', message: `${cleaner.name} won't make home by ${cleaner.home_by_time} on ${date} — last job ends ${formatTime(lastEndMin)}, est. home ${arriveStr}`, booking_ids: [lastJob.id], cleaner_id: cleanerId, date })
          }
        }
      }

      // ── PER-BOOKING CHECKS ──
      for (const b of dayBookings) {
        const cleaner = b.cleaners as any
        const client = b.clients as any

        // ── 6. UNASSIGNED ──
        if (!b.cleaner_id) {
          issues.push({ type: 'unassigned', severity: 'warning', message: `${client?.name || 'Client'} on ${date} — no cleaner assigned`, booking_ids: [b.id], client_id: b.client_id || undefined, date })
          continue
        }
        if (!cleaner) continue

        // ── 7. DAY OFF ──
        if (cleaner.unavailable_dates?.includes(date)) {
          issues.push({ type: 'day_off', severity: 'critical', message: `${cleaner.name} is marked unavailable on ${date} but booked for ${client?.name}`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined, date })
        } else if (cleaner.working_days?.length > 0 && !cleaner.working_days.includes(dayOfWeek)) {
          issues.push({ type: 'day_off', severity: 'critical', message: `${cleaner.name} doesn't work ${dayOfWeek}s — booked for ${client?.name} on ${date}`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined, date })
        }

        // ── 8. ZONE MISMATCH ──
        if (cleaner.service_zones?.length > 0 && client?.address) {
          const jobZone = guessZoneFromAddress(client.address)
          if (jobZone && !cleaner.service_zones.includes(jobZone)) {
            issues.push({ type: 'zone_mismatch', severity: 'info', message: `${cleaner.name} → ${client.name} on ${date} is outside zone (${jobZone.replace(/_/g, ' ')})`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined, date })
          }
          // Car required but no car
          if (jobZone && zoneRequiresCar(jobZone) && !cleaner.has_car) {
            issues.push({ type: 'no_car', severity: 'critical', message: `${cleaner.name} assigned to ${client.name} on ${date} — ${jobZone.replace(/_/g, ' ')} requires a car`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined, date })
          }
        }

        // ── 9. PRICE MISMATCH ──
        if (b.hourly_rate && b.price) {
          const [, st] = b.start_time.split('T')
          const [, et] = b.end_time.split('T')
          const [sh, sm] = (st || '00:00').split(':').map(Number)
          const [eh, em] = (et || '00:00').split(':').map(Number)
          const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60
          const expectedPrice = hours * b.hourly_rate * 100
          if (Math.abs(b.price - expectedPrice) > 1000 && b.price > 0) { // >$10 difference
            issues.push({ type: 'price_mismatch', severity: 'info', message: `${client?.name} on ${date} — price $${(b.price / 100).toFixed(0)} doesn't match ${hours}hrs × $${b.hourly_rate}/hr ($${(expectedPrice / 100).toFixed(0)})`, booking_ids: [b.id], date })
          }
        }
      }
    }

    // ── 10. PAYMENT NOT COLLECTED (completed 24h+ ago) ──
    for (const b of recentCompleted || []) {
      if (b.payment_status !== 'paid' && b.price > 0) {
        const completedAt = new Date(b.end_time)
        const hoursAgo = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)
        if (hoursAgo > 24) {
          issues.push({ type: 'payment_overdue', severity: 'warning', message: `${(b.clients as any)?.name} — $${(b.price / 100).toFixed(0)} unpaid, completed ${Math.floor(hoursAgo)}hrs ago`, booking_ids: [b.id], client_id: b.client_id || undefined })
        }
      }
    }

    // ── 11. CLEANER NOT PAID (completed 48h+ ago) ──
    for (const b of recentCompleted || []) {
      if (!b.cleaner_paid && b.cleaner_id) {
        const completedAt = new Date(b.end_time)
        const hoursAgo = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60)
        if (hoursAgo > 48) {
          issues.push({ type: 'cleaner_unpaid', severity: 'warning', message: `${(b.cleaners as any)?.name} not paid for ${(b.clients as any)?.name} — completed ${Math.floor(hoursAgo / 24)}d ago`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined })
        }
      }
    }

    // ── 12. NO-SHOW DETECTION (scheduled, past end_time, never checked in) ──
    const { data: noShows } = await supabaseAdmin
      .from('bookings')
      .select('id, start_time, end_time, cleaner_id, clients(name), cleaners(name)')
      .eq('status', 'scheduled')
      .lte('end_time', now.toISOString())
      .gte('start_time', todayStr + 'T00:00:00')
      .is('check_in_time', null)

    for (const b of noShows || []) {
      issues.push({ type: 'no_show', severity: 'critical', message: `${(b.cleaners as any)?.name || 'Unassigned'} never checked in for ${(b.clients as any)?.name} — job should be done by now`, booking_ids: [b.id], cleaner_id: b.cleaner_id || undefined })
    }

    // ── WRITE TO SCHEDULE_ISSUES TABLE (dedup by message + date) ──
    const { data: existingIssues } = await supabaseAdmin
      .from('schedule_issues')
      .select('message')
      .in('status', ['open', 'acknowledged'])

    const existingMessages = new Set((existingIssues || []).map(i => i.message))
    const newIssues = issues.filter(i => !existingMessages.has(i.message))

    for (const issue of newIssues) {
      await supabaseAdmin.from('schedule_issues').insert({
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        booking_id: issue.booking_id || issue.booking_ids[0] || null,
        booking_ids: issue.booking_ids,
        cleaner_id: issue.cleaner_id || null,
        client_id: issue.client_id || null,
        date: issue.date || null,
        status: 'open',
      })
    }

    // Also create dashboard notification for critical issues
    const criticalNew = newIssues.filter(i => i.severity === 'critical')
    if (criticalNew.length > 0) {
      await supabaseAdmin.from('notifications').insert({
        type: 'schedule_issue',
        title: `${criticalNew.length} Schedule Conflict${criticalNew.length !== 1 ? 's' : ''}`,
        message: criticalNew.map(i => i.message).join(' | '),
      })
    }

    return NextResponse.json({
      success: true,
      scanned: bookings.length,
      new_issues: newIssues.length,
      total_issues: issues.length,
      critical: issues.filter(i => i.severity === 'critical').length,
      warnings: issues.filter(i => i.severity === 'warning').length,
    })
  } catch (err) {
    await trackError(err, { source: 'cron/schedule-monitor', severity: 'high' })
    return NextResponse.json({ error: 'Monitor failed' }, { status: 500 })
  }
}

function toMin(timeStr: string): number {
  const [, t] = timeStr.split('T')
  const [h, m] = (t || '00:00').split(':').map(Number)
  return h * 60 + m
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 || 12
  return m > 0 ? `${hr}:${String(m).padStart(2, '0')} ${ampm}` : `${hr} ${ampm}`
}
