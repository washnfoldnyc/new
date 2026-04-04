import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

// GET — load draft by IP
export async function GET(request: NextRequest) {
  const ip = getIp(request)
  if (ip === 'unknown') {
    return NextResponse.json({ draft: null })
  }

  const position = request.nextUrl.searchParams.get('position') || 'operations-coordinator'

  const { data, error } = await supabaseAdmin
    .from('management_application_drafts')
    .select('form_data, photo_url, video_url, resume_url, updated_at')
    .eq('ip_address', ip)
    .eq('position', position)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Draft load error:', error)
    return NextResponse.json({ draft: null })
  }

  return NextResponse.json({ draft: data })
}

// POST — save draft by IP
export async function POST(request: NextRequest) {
  const ip = getIp(request)
  if (ip === 'unknown') {
    return NextResponse.json({ error: 'Cannot identify client' }, { status: 400 })
  }

  try {
    const { form_data, photo_url, video_url, resume_url, position } = await request.json()

    const { error } = await supabaseAdmin
      .from('management_application_drafts')
      .upsert(
        {
          ip_address: ip,
          position: position || 'operations-coordinator',
          form_data,
          photo_url: photo_url || null,
          video_url: video_url || null,
          resume_url: resume_url || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'ip_address,position' }
      )

    if (error) {
      console.error('Draft save error:', error)
      return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Draft save error:', err)
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }
}

// DELETE — clear draft after successful submission
export async function DELETE(request: NextRequest) {
  const ip = getIp(request)
  if (ip === 'unknown') return NextResponse.json({ ok: true })

  const position = request.nextUrl.searchParams.get('position') || 'operations-coordinator'

  await supabaseAdmin
    .from('management_application_drafts')
    .delete()
    .eq('ip_address', ip)
    .eq('position', position)

  return NextResponse.json({ ok: true })
}
