import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidAccessToken, getGoogleBusiness } from '@/lib/google'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { reviewId, reply } = await request.json()

  if (!reviewId || !reply?.trim()) {
    return NextResponse.json({ error: 'reviewId and reply are required' }, { status: 400 })
  }

  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    return NextResponse.json({ error: 'Not connected to Google' }, { status: 401 })
  }

  const business = await getGoogleBusiness()
  if (!business?.location_name) {
    return NextResponse.json({ error: 'No location configured' }, { status: 400 })
  }

  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${business.location_name}/reviews/${reviewId}/reply`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: reply.trim() }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('Failed to reply to review:', err)
    return NextResponse.json({ error: 'Failed to post reply' }, { status: 500 })
  }

  // Update cached table
  await supabaseAdmin
    .from('google_reviews')
    .update({ reply: reply.trim() })
    .eq('google_review_id', reviewId)

  return NextResponse.json({ success: true })
}
