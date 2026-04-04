import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectClientAPI, isAdminAuthenticated } from '@/lib/auth'
import { notifyCleaner } from '@/lib/notify-cleaner'

// Upload a SINGLE image and return the URL
// Client sends multiple images one at a time, then creates the note
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const files = formData.getAll('files') as File[]
    const bookingId = formData.get('booking_id') as string
    const authorType = formData.get('author_type') as string
    const authorName = formData.get('author_name') as string
    const content = formData.get('content') as string | null
    const clientId = formData.get('client_id') as string | null
    // If image_urls provided, skip upload and just create the note
    const imageUrlsRaw = formData.get('image_urls') as string | null

    if (!bookingId) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

    // Auth
    const isAdmin = await isAdminAuthenticated()
    if (!isAdmin) {
      const { data: booking } = await supabaseAdmin
        .from('bookings')
        .select('client_id')
        .eq('id', bookingId)
        .single()
      if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      const auth = await protectClientAPI(booking.client_id)
      if (auth instanceof NextResponse) return auth
    }

    const uploadOnly = formData.get('upload_only') === 'true'
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

    // MODE 1: image_urls already uploaded — just create note
    if (imageUrlsRaw) {
      const imageUrls = JSON.parse(imageUrlsRaw) as string[]
      const resolvedAuthorType = isAdmin ? 'admin' : (authorType || 'client')
      const { data, error } = await supabaseAdmin
        .from('booking_notes')
        .insert({
          booking_id: bookingId,
          client_id: clientId || null,
          author_type: resolvedAuthorType,
          author_name: authorName || (isAdmin ? 'Admin' : 'Client'),
          content: content?.trim() || null,
          images: imageUrls,
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      notifyCleanerOfNote(bookingId, resolvedAuthorType)
      return NextResponse.json(data)
    }

    // MODE 2: single file upload — return URL only
    const uploadFile = file || (files.length > 0 ? files[0] : null)
    if (!uploadFile) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    if (!allowedTypes.includes(uploadFile.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or HEIC allowed' }, { status: 400 })
    }
    if (uploadFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    const rawExt = (uploadFile.name.split('.').pop() || 'jpg').toLowerCase()
    const safeExts = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
    const ext = safeExts.includes(rawExt) ? rawExt : 'jpg'
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 8)
    const path = `booking-notes/${bookingId}/${timestamp}-${randomId}.${ext}`

    const buffer = Buffer.from(await uploadFile.arrayBuffer())
    const { error: uploadError } = await supabaseAdmin.storage
      .from('cleaner-photo')
      .upload(path, buffer, { contentType: uploadFile.type, upsert: false })

    if (uploadError) {
      console.error('Note image upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage
      .from('cleaner-photo')
      .getPublicUrl(path)

    // Upload only — return URL, don't create note
    if (uploadOnly) {
      return NextResponse.json({ url: urlData.publicUrl })
    }

    // Single file — create the note directly
    if (!imageUrlsRaw) {
      const resolvedAuthorType = isAdmin ? 'admin' : (authorType || 'client')
      const { data, error } = await supabaseAdmin
        .from('booking_notes')
        .insert({
          booking_id: bookingId,
          client_id: clientId || null,
          author_type: resolvedAuthorType,
          author_name: authorName || (isAdmin ? 'Admin' : 'Client'),
          content: content?.trim() || null,
          images: [urlData.publicUrl],
        })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      notifyCleanerOfNote(bookingId, resolvedAuthorType)
      return NextResponse.json(data)
    }
  } catch (err) {
    console.error('Note upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}

async function notifyCleanerOfNote(bookingId: string, authorType: string) {
  const { data: booking } = await supabaseAdmin
    .from('bookings')
    .select('cleaner_id, start_time, clients(name), cleaners(name, pin)')
    .eq('id', bookingId)
    .single()

  if (!booking?.cleaner_id) return

  const clientName = (booking.clients as any)?.name || 'Client'
  const pin = (booking.cleaners as any)?.pin || ''
  const date = new Date(booking.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const updatedBy = authorType === 'client' ? clientName : 'Admin'

  notifyCleaner({
    cleanerId: booking.cleaner_id,
    type: 'job_reminder',
    title: 'Job Notes Updated',
    message: `${updatedBy} updated notes for ${clientName} on ${date}`,
    bookingId,
    smsMessage: `NYC Maid: ${updatedBy} updated notes for your ${date} job (${clientName}). Check portal: thenycmaid.com/team PIN: ${pin}\n${updatedBy} actualizó las notas para tu trabajo del ${date} (${clientName}). Portal: thenycmaid.com/team PIN: ${pin}`,
    skipEmail: true,
  }).catch(() => {})
}
