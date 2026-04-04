import { NextResponse } from 'next/server'
import { checkAvailability } from '@/lib/availability'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const duration = Math.min(Math.max(parseInt(searchParams.get('duration') || '2') || 2, 1), 8)

  if (!date) {
    return NextResponse.json({ error: 'Missing date' }, { status: 400 })
  }

  const result = await checkAvailability(date, duration)
  return NextResponse.json(result)
}
