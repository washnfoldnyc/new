import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getGoogleTokens, getGoogleBusiness } from '@/lib/google'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  // Check if connected
  const tokens = await getGoogleTokens()
  if (!tokens) {
    return NextResponse.json({ connected: false })
  }

  const business = await getGoogleBusiness()
  if (!business?.location_name) {
    return NextResponse.json({ connected: false, error: 'No location found' })
  }

  // Read from cached google_reviews table
  const { data: reviews } = await supabaseAdmin
    .from('google_reviews')
    .select('google_review_id, reviewer_name, rating, comment, reply, review_created_at')
    .order('review_created_at', { ascending: false })
    .limit(50)

  const allReviews = (reviews || []).map(r => ({
    id: r.google_review_id,
    reviewer: r.reviewer_name,
    rating: r.rating,
    comment: r.comment,
    reply: r.reply,
    created_at: r.review_created_at,
  }))

  const avgRating = (business as any).avg_rating || (allReviews.length > 0
    ? allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
    : 0)
  const totalReviews = (business as any).total_reviews || allReviews.length

  return NextResponse.json({
    connected: true,
    reviews: allReviews,
    avgRating,
    totalReviews,
    insights: null, // populated after performance API data is available
  })
}
