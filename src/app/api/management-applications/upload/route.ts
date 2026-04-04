import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Rate limit: 5 uploads per 10 minutes per IP
const uploadLimits = new Map<string, { count: number; resetAt: number }>()

function isUploadRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = uploadLimits.get(ip)
  if (!entry || now > entry.resetAt) {
    uploadLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 5
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isUploadRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Size limits by type
    const maxSize = type === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File must be under ${type === 'video' ? '100MB' : '10MB'}` }, { status: 400 })
    }

    const rawExt = (file.name.split('.').pop() || 'bin').toLowerCase()
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)

    let folder = 'management-applications/other'
    if (type === 'photo') folder = 'management-applications/photos'
    else if (type === 'video') folder = 'management-applications/videos'
    else if (type === 'resume') folder = 'management-applications/resumes'

    const filename = `${folder}/${timestamp}-${randomId}.${rawExt}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabaseAdmin.storage
      .from('cleaner-photo')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('Supabase storage upload error:', JSON.stringify(error))
      return NextResponse.json({ error: error.message || 'Storage upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('cleaner-photo')
      .getPublicUrl(filename)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
