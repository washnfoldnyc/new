import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Public API — serves cached Google reviews to all domain sites
// No auth required — this is public data displayed on websites
export async function GET(request: Request) {
  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50)
  const minRating = parseInt(url.searchParams.get('min_rating') || '4')

  // Get reviews from cache table
  const { data: reviews, error } = await supabaseAdmin
    .from('google_reviews')
    .select('reviewer_name, rating, comment, review_created_at')
    .gte('rating', minRating)
    .not('comment', 'eq', '')
    .order('review_created_at', { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  // Get aggregate stats
  const { data: business } = await supabaseAdmin
    .from('settings')
    .select('google_business')
    .limit(1)
    .single()

  const stats = business?.google_business || {}

  const response = NextResponse.json({
    reviews: reviews || [],
    avgRating: stats.avg_rating || 0,
    totalReviews: stats.total_reviews || 0,
    lastSynced: stats.last_synced || null,
  })

  // Cache for 1 hour — reviews don't change that fast
  response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200')
  response.headers.set('Access-Control-Allow-Origin', '*')

  return response
}
