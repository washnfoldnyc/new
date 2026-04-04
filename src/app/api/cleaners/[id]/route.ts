import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { geocodeCleaner } from '@/lib/geo'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params
  const body = await request.json()

  // Strip past dates from unavailable_dates
  const today = new Date().toISOString().split('T')[0]
  const futureDates = (body.unavailable_dates || []).filter((d: string) => d >= today)

  const { data, error } = await supabaseAdmin
    .from('cleaners')
    .update({
      name: body.name,
      phone: body.phone,
      email: body.email || null,
      address: body.address ?? undefined,
      photo_url: body.photo_url || null,
      working_days: body.working_days || [],
      schedule: body.schedule ?? undefined,
      working_start: body.working_start || '09:00',
      working_end: body.working_end || '17:00',
      unavailable_dates: futureDates,
      pin: body.pin ?? undefined,
      hourly_rate: body.hourly_rate ?? undefined,
      active: body.active ?? undefined,
      home_by_time: body.home_by_time ?? undefined,
      max_jobs_per_day: body.max_jobs_per_day ?? undefined,
      service_zones: body.service_zones ?? undefined,
      has_car: body.has_car ?? undefined,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Re-geocode if address changed
  if (body.address) geocodeCleaner(id, body.address).catch(() => {})

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Protect admin route
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params
  
  // Hard delete
  const { error } = await supabaseAdmin
    .from('cleaners')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
