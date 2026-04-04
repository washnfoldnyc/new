import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress } from '@/lib/geo'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  let clientsGeocoded = 0
  let cleanersGeocoded = 0
  let failed = 0

  // Geocode clients missing coords
  const { data: clients } = await supabaseAdmin
    .from('clients')
    .select('id, address')
    .is('latitude', null)
    .not('address', 'is', null)
    .limit(200)

  for (const c of clients || []) {
    if (!c.address) continue
    const coords = await geocodeAddress(c.address)
    if (coords) {
      await supabaseAdmin.from('clients').update({ latitude: coords.lat, longitude: coords.lng }).eq('id', c.id)
      clientsGeocoded++
    } else {
      failed++
    }
    // Rate limit: Radar free tier is 100k/month, be gentle
    await new Promise(r => setTimeout(r, 200))
  }

  // Geocode cleaners missing coords
  const { data: cleaners } = await supabaseAdmin
    .from('cleaners')
    .select('id, address')
    .is('home_latitude', null)
    .not('address', 'is', null)
    .limit(50)

  for (const c of cleaners || []) {
    if (!c.address) continue
    const coords = await geocodeAddress(c.address)
    if (coords) {
      await supabaseAdmin.from('cleaners').update({ home_latitude: coords.lat, home_longitude: coords.lng }).eq('id', c.id)
      cleanersGeocoded++
    } else {
      failed++
    }
    await new Promise(r => setTimeout(r, 200))
  }

  return NextResponse.json({ success: true, clientsGeocoded, cleanersGeocoded, failed })
}
