import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  const { data: note } = await supabaseAdmin
    .from('booking_notes')
    .select('images')
    .eq('id', id)
    .single()

  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 })

  // Delete all images from storage
  const images = (note.images as string[]) || []
  for (const url of images) {
    const match = url.match(/cleaner-photo\/(.+)$/)
    if (match) {
      await supabaseAdmin.storage.from('cleaner-photo').remove([match[1]])
    }
  }

  const { error } = await supabaseAdmin
    .from('booking_notes')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
