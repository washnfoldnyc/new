import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)

  const [
    { count: pendingBookings },
    { count: todayJobs },
    { count: newClients },
    { count: unreadFeedback },
    { count: unpaidCommissions },
    { count: overdueFollowUps },
  ] = await Promise.all([
    // Bookings: pending (need assignment/confirmation)
    supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    // Calendar: today's active jobs
    supabaseAdmin.from('bookings').select('id', { count: 'exact', head: true })
      .gte('start_time', startOfDay.toISOString())
      .lt('start_time', endOfDay.toISOString())
      .in('status', ['confirmed', 'scheduled', 'in_progress']),
    // Clients: new this month
    supabaseAdmin.from('clients').select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth.toISOString()),
    // Feedback: unread
    supabaseAdmin.from('notifications').select('id', { count: 'exact', head: true })
      .eq('type', 'feedback').eq('read', false),
    // Referrals: unpaid commissions
    supabaseAdmin.from('referral_commissions').select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    // Sales: overdue follow-ups
    supabaseAdmin.from('deals').select('id', { count: 'exact', head: true })
      .lt('follow_up_at', now.toISOString())
      .eq('stage', 'active'),
  ])

  return NextResponse.json({
    bookings: pendingBookings || 0,
    calendar: todayJobs || 0,
    clients: newClients || 0,
    feedback: unreadFeedback || 0,
    referrals: unpaidCommissions || 0,
    sales: overdueFollowUps || 0
  })
}
