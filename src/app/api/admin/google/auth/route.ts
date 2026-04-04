import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'

export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 })
  }

  const redirectUri = 'https://washandfoldnyc.com/api/admin/google/callback'

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/business.manage',
    access_type: 'offline',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
