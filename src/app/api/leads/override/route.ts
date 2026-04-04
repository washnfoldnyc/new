import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id, type } = await request.json()
  if (!id || !type) return NextResponse.json({ error: 'Missing id or type' }, { status: 400 })

  if (type === 'conversion') {
    // Toggle manual_conversion
    const { data } = await supabaseAdmin.from('lead_clicks').select('manual_conversion').eq('id', id).single()
    await supabaseAdmin.from('lead_clicks').update({ manual_conversion: !(data?.manual_conversion) }).eq('id', id)
  } else if (type === 'sale') {
    // Toggle manual_sale (also set conversion if marking as sale)
    const { data } = await supabaseAdmin.from('lead_clicks').select('manual_sale, manual_conversion').eq('id', id).single()
    const newSale = !(data?.manual_sale)
    const update: Record<string, boolean> = { manual_sale: newSale }
    if (newSale && !data?.manual_conversion) update.manual_conversion = true
    await supabaseAdmin.from('lead_clicks').update(update).eq('id', id)
  }

  return NextResponse.json({ success: true })
}
