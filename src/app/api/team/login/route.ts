import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { notify } from '@/lib/notify'

// Rate limiting: 5 attempts per 5 minutes per IP
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 5
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again in 5 minutes.' }, { status: 429 })
  }

  const { pin } = await request.json()

  if (!pin || pin.length < 4 || pin.length > 6) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 })
  }

  const { data: cleaner, error } = await supabaseAdmin
    .from('cleaners')
    .select('id, name, email, active, pin')
    .eq('pin', pin)
    .eq('active', true)
    .single()

  if (error || !cleaner) {
    // Track failed attempts
    const entry = loginAttempts.get(ip)
    if (entry && entry.count >= 3) {
      await notify({ type: 'security', title: 'Failed Team Login', message: `${entry.count} failed team login attempts from ${ip}` }).catch(() => {})
    }
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  // Reset rate limit on success
  loginAttempts.delete(ip)

  const { pin: _, ...safeCleanerData } = cleaner

  return NextResponse.json({ cleaner: safeCleanerData })
}
