import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { notifyCleaner, DeliveryReport } from '@/lib/notify-cleaner'

export async function POST() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  // Fetch all active cleaners
  const { data: cleaners, error } = await supabaseAdmin
    .from('cleaners')
    .select('id, name, pin')
    .eq('active', true)

  if (error || !cleaners) {
    return NextResponse.json({ error: 'Failed to fetch cleaners' }, { status: 500 })
  }

  const reports: DeliveryReport[] = []

  for (const cleaner of cleaners) {
    const report = await notifyCleaner({
      cleanerId: cleaner.id,
      type: 'broadcast',
      title: 'Team Guidelines Updated / Reglas del equipo actualizadas',
      message: 'New team guidelines have been posted. Please review them in your portal. / Se han publicado nuevas reglas del equipo. Revísalas en tu portal.',
      smsMessage: `NYC Maid: Team guidelines updated. Review in portal: thenycmaid.com/team PIN: ${cleaner.pin}\n\nReglas del equipo actualizadas. Revisa en tu portal: thenycmaid.com/team PIN: ${cleaner.pin}`,
      emailSubject: 'Team Guidelines Updated / Reglas actualizadas',
      emailHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1E2A4A;">Team Guidelines Updated</h2>
          <p>New team guidelines have been posted. Please log into your portal to review them.</p>
          <p><a href="https://thenycmaid.com/team" style="display: inline-block; padding: 12px 24px; background: #1E2A4A; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">View Guidelines</a></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <h2 style="color: #1E2A4A;">Reglas del equipo actualizadas</h2>
          <p>Se han publicado nuevas reglas del equipo. Inicia sesión en tu portal para revisarlas.</p>
          <p><a href="https://thenycmaid.com/team" style="display: inline-block; padding: 12px 24px; background: #1E2A4A; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver Reglas</a></p>
        </div>
      `,
    })
    reports.push(report)
  }

  const summary = {
    total: reports.length,
    push: reports.filter(r => r.push).length,
    email: reports.filter(r => r.email).length,
    sms: reports.filter(r => r.sms).length,
  }

  return NextResponse.json({ success: true, summary })
}
