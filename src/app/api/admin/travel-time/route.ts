import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { geocodeAddress, calculateDistance } from '@/lib/geo'

interface TravelPair {
  from_address: string
  to_address: string
}

interface TravelResult {
  from_address: string
  to_address: string
  duration_minutes: number | null
}

// Estimate NYC transit time from straight-line distance
// ~10 min base (walk to stop + wait) + ~5 min per mile
function estimateTransitMinutes(distanceMiles: number): number {
  if (distanceMiles < 0.3) return 5 // same block, walking
  return Math.round(10 + distanceMiles * 5)
}

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { pairs } = await request.json() as { pairs: TravelPair[] }
  if (!pairs || !Array.isArray(pairs) || pairs.length === 0) {
    return NextResponse.json({ error: 'pairs array required' }, { status: 400 })
  }

  const results: TravelResult[] = []

  for (const pair of pairs) {
    const from = pair.from_address.trim().toLowerCase()
    const to = pair.to_address.trim().toLowerCase()

    // Check cache (non-fatal if table doesn't exist)
    try {
      const { data: cached } = await supabaseAdmin
        .from('travel_time_cache')
        .select('duration_minutes')
        .eq('from_address', from)
        .eq('to_address', to)
        .single()

      if (cached) {
        results.push({ from_address: pair.from_address, to_address: pair.to_address, duration_minutes: cached.duration_minutes })
        continue
      }
    } catch {
      // Cache table may not exist yet — continue without cache
    }

    // Geocode both addresses
    const [originGeo, destGeo] = await Promise.all([
      geocodeAddress(pair.from_address),
      geocodeAddress(pair.to_address)
    ])

    if (!originGeo || !destGeo) {
      results.push({ from_address: pair.from_address, to_address: pair.to_address, duration_minutes: null })
      continue
    }

    const distance = calculateDistance(originGeo.lat, originGeo.lng, destGeo.lat, destGeo.lng)
    const minutes = estimateTransitMinutes(distance)

    // Try to cache (non-fatal if table doesn't exist)
    try {
      await supabaseAdmin
        .from('travel_time_cache')
        .upsert({ from_address: from, to_address: to, duration_minutes: minutes }, { onConflict: 'from_address,to_address' })
    } catch {
      // Cache write failed — not critical
    }

    results.push({ from_address: pair.from_address, to_address: pair.to_address, duration_minutes: minutes })
  }

  return NextResponse.json(results)
}
