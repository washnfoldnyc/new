import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('cleaner_guidelines, guidelines_updated_at')
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ en: '', es: '', updated_at: null })
  }

  const guidelines = data.cleaner_guidelines as { en: string; es: string } | null

  return NextResponse.json({
    en: guidelines?.en || '',
    es: guidelines?.es || '',
    updated_at: data.guidelines_updated_at || null,
  })
}
