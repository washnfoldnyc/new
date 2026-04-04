import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Rate limit: 10 signed URL requests per 10 minutes per IP
const urlLimits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = urlLimits.get(ip)
  if (!entry || now > entry.resetAt) {
    urlLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 10
}

const ALLOWED_TYPES: Record<string, { mimes: string[]; maxSize: number; folder: string }> = {
  photo: {
    mimes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSize: 10 * 1024 * 1024,
    folder: 'management-applications/photos',
  },
  video: {
    mimes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
    maxSize: 100 * 1024 * 1024,
    folder: 'management-applications/videos',
  },
  resume: {
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSize: 10 * 1024 * 1024,
    folder: 'management-applications/resumes',
  },
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  }

  try {
    const { type, filename, contentType } = await request.json()

    const config = ALLOWED_TYPES[type]
    if (!config) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 })
    }

    if (!contentType || !config.mimes.includes(contentType)) {
      return NextResponse.json({ error: `Invalid file type for ${type}` }, { status: 400 })
    }

    const ext = (filename?.split('.').pop() || 'bin').toLowerCase()
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const path = `${config.folder}/${timestamp}-${randomId}.${ext}`

    const { data, error } = await supabaseAdmin.storage
      .from('cleaner-photo')
      .createSignedUploadUrl(path)

    if (error) {
      console.error('Signed URL error:', JSON.stringify(error))
      return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('cleaner-photo')
      .getPublicUrl(path)

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path,
      publicUrl: urlData.publicUrl,
    })
  } catch (err) {
    console.error('Signed URL error:', err)
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  }
}
