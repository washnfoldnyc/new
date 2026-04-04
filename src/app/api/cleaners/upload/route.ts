import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

// Rate limit public uploads: 3 per 10 minutes per IP
const uploadLimits = new Map<string, { count: number; resetAt: number }>()

function isUploadRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = uploadLimits.get(ip)
  if (!entry || now > entry.resetAt) {
    uploadLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 3
}

export async function POST(request: NextRequest) {
  // Check admin auth first
  const authError = await protectAdminAPI()
  const isAdmin = !authError

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const cleanerId = formData.get('cleaner_id') as string | null

    // Non-admin uploads: require valid cleaner_id OR rate-limit for applications
    if (!isAdmin) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      if (isUploadRateLimited(ip)) {
        return NextResponse.json({ error: 'Too many uploads. Try again later.' }, { status: 429 })
      }

      // If cleaner_id provided, verify it exists (team member uploading their own photo)
      if (cleanerId) {
        const { data: cleaner } = await supabaseAdmin
          .from('cleaners')
          .select('id')
          .eq('id', cleanerId)
          .eq('active', true)
          .single()
        if (!cleaner) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }
      // No cleaner_id and not admin = application upload (rate-limited above)
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type (include HEIC/HEIF for iPhone photos)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `File type "${file.type}" not allowed. Use JPEG, PNG, or WebP.` }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    // Sanitize extension — only allow known safe extensions
    const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const safeExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
    const ext = safeExts.includes(rawExt) ? rawExt : 'jpg'
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const filename = `cleaner-photos/${timestamp}-${randomId}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabaseAdmin.storage
      .from('cleaner-photo')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('Supabase storage upload error:', JSON.stringify(uploadError))
      return NextResponse.json({ error: uploadError.message || 'Storage upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('cleaner-photo')
      .getPublicUrl(filename)

    const photoUrl = urlData.publicUrl

    if (cleanerId) {
      const { error: updateError } = await supabaseAdmin
        .from('cleaners')
        .update({ photo_url: photoUrl })
        .eq('id', cleanerId)

      if (updateError) {
        console.error('Update error:', updateError)
      }
    }

    return NextResponse.json({ success: true, url: photoUrl })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
