import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

export async function GET() {
  const settings = await getSettings()
  const active = (settings.service_types || []).filter((s: any) => s.active !== false)
  return NextResponse.json(active)
}
