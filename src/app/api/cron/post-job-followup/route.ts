import { NextResponse } from 'next/server'
import { protectCronAPI } from '@/lib/auth'

export const maxDuration = 60

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  // Disabled — no longer asking clients for feedback
  return NextResponse.json({ ok: true, sent: 0, skipped: 0, disabled: true })
}
