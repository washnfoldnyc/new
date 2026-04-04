import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken, getGoogleBusiness } from '@/lib/google'
import { protectCronAPI } from '@/lib/auth'

export async function GET(request: Request) {
  const authError = protectCronAPI(request)
  if (authError) return authError

  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Google not connected' }, { status: 400 })
  }

  const business = await getGoogleBusiness()
  if (!business?.location_name) {
    return NextResponse.json({ error: 'No location configured' }, { status: 400 })
  }

  try {
    // Fetch all reviews (paginated)
    let allReviews: any[] = []
    let pageToken: string | null = null

    do {
      const url = new URL(`https://mybusiness.googleapis.com/v4/${business.location_name}/reviews`)
      url.searchParams.set('pageSize', '50')
      if (pageToken) url.searchParams.set('pageToken', pageToken)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!res.ok) {
        const err = await res.text()
        console.error('Failed to fetch reviews:', err)
        break
      }

      const data = await res.json()
      allReviews = allReviews.concat(data.reviews || [])
      pageToken = data.nextPageToken || null

      // Store aggregate stats
      if (data.averageRating !== undefined) {
        await supabaseAdmin
          .from('settings')
          .update({
            google_business: {
              ...business,
              avg_rating: data.averageRating,
              total_reviews: data.totalReviewCount,
              last_synced: new Date().toISOString(),
            },
          })
          .eq('id', 1)
      }
    } while (pageToken)

    // Upsert reviews into google_reviews table
    let newReviews = 0
    for (const review of allReviews) {
      const reviewId = review.reviewId || review.name?.split('/').pop()
      const rating = review.starRating === 'FIVE' ? 5
        : review.starRating === 'FOUR' ? 4
        : review.starRating === 'THREE' ? 3
        : review.starRating === 'TWO' ? 2 : 1

      const { data: existing } = await supabaseAdmin
        .from('google_reviews')
        .select('id, reply')
        .eq('google_review_id', reviewId)
        .single()

      if (!existing) {
        newReviews++
      }

      await supabaseAdmin
        .from('google_reviews')
        .upsert({
          google_review_id: reviewId,
          reviewer_name: review.reviewer?.displayName || 'Anonymous',
          reviewer_photo_url: review.reviewer?.profilePhotoUrl || null,
          rating,
          comment: review.comment || '',
          reply: review.reviewReply?.comment || null,
          review_created_at: review.createTime || new Date().toISOString(),
          synced_at: new Date().toISOString(),
        }, { onConflict: 'google_review_id' })
    }

    // Create notification if there are new reviews
    if (newReviews > 0) {
      await supabaseAdmin.from('notifications').insert({
        type: 'feedback',
        title: `${newReviews} new Google review${newReviews > 1 ? 's' : ''}`,
        message: `Synced ${allReviews.length} total reviews from Google Business Profile.`,
      })
    }

    return NextResponse.json({
      synced: allReviews.length,
      new: newReviews,
    })
  } catch (e) {
    console.error('Google review sync error:', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
