import { NextResponse } from 'next/server'
import { saveGoogleTokens, saveGoogleBusiness } from '@/lib/google'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const siteUrl = 'https://washandfoldnyc.com'

  if (error) {
    return NextResponse.redirect(`${siteUrl}/admin/google?error=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/admin/google?error=no_code`)
  }

  const redirectUri = `${siteUrl}/api/admin/google/callback`

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('Google token exchange failed:', err)
    return NextResponse.redirect(`${siteUrl}/admin/google?error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json()

  // Store tokens
  await saveGoogleTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (tokens.expires_in * 1000),
  })

  // Fetch and store the account/location ID
  try {
    const accountRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (accountRes.ok) {
      const accountData = await accountRes.json()
      const account = accountData.accounts?.[0]

      if (account) {
        const locationsRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        )

        let locationName = null
        let locationTitle = null

        if (locationsRes.ok) {
          const locData = await locationsRes.json()
          const location = locData.locations?.[0]
          locationName = location?.name || null
          locationTitle = location?.title || null
        }

        await saveGoogleBusiness({
          account_name: account.name,
          location_name: locationName,
          location_title: locationTitle,
        })
      }
    }
  } catch (e) {
    console.error('Failed to fetch Google Business info:', e)
  }

  return NextResponse.redirect(`${siteUrl}/admin/google?connected=true`)
}
