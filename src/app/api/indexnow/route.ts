import { NextRequest, NextResponse } from 'next/server'

// IndexNow key — Bing, Yahoo, DuckDuckGo, Yandex use this for instant indexing
const INDEXNOW_KEY = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'

// GET /api/indexnow?key=... — Bing verifies ownership by fetching the key
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (key === INDEXNOW_KEY) {
    return new NextResponse(INDEXNOW_KEY, { headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Invalid key' }, { status: 404 })
}

// POST /api/indexnow — Submit URLs for instant indexing to Bing/Yahoo/DuckDuckGo
// Called internally when content changes (e.g., from admin settings save)
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const urls: string[] = body.urls || []

    if (!urls.length) {
      return NextResponse.json({ error: 'No URLs provided' }, { status: 400 })
    }

    // Submit to IndexNow API (Bing distributes to Yahoo, DuckDuckGo, Yandex)
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host: 'www.thenycmaid.com',
        key: INDEXNOW_KEY,
        keyLocation: 'https://www.thenycmaid.com/api/indexnow?key=' + INDEXNOW_KEY,
        urlList: urls.slice(0, 10000), // IndexNow supports up to 10k URLs per batch
      }),
    })

    return NextResponse.json({
      success: true,
      status: res.status,
      submitted: urls.length,
    })
  } catch (error) {
    console.error('IndexNow submission error:', error)
    return NextResponse.json({ error: 'Failed to submit' }, { status: 500 })
  }
}
