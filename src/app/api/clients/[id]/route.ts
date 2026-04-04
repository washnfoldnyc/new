import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError
  
  const { id } = await params
  const { data, error } = await supabaseAdmin.from('clients').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const ALLOWED_CLIENT_FIELDS = ['name', 'email', 'phone', 'address', 'unit', 'notes', 'active', 'referrer_id', 'do_not_service', 'pin', 'email_marketing_opt_out', 'sms_marketing_opt_out', 'pet_name', 'pet_type']

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const { id } = await params
    const body = await request.json()

    // Handle send_pin action — send client their PIN via email/SMS
    if (body.send_pin) {
      const { data: client } = await supabaseAdmin.from('clients').select('*').eq('id', id).single()
      if (!client?.pin) return NextResponse.json({ error: 'Client has no PIN' }, { status: 400 })

      const pinMessage = `Your Wash and Fold NYC portal PIN is: ${client.pin}. Log in at washandfoldnyc.com/book with your email and this PIN.`
      const smsMessage = `Your Wash and Fold NYC portal PIN is: ${client.pin}. Log in at washandfoldnyc.com/book`

      if (client.email) {
        await sendEmail(client.email, 'Your Wash and Fold NYC Portal PIN', `<p>${pinMessage}</p>`)
      }

      if (client.phone && client.sms_consent) {
        await sendSMS(client.phone, smsMessage, {
          recipientType: 'client',
          recipientId: id,
          smsType: 'pin_delivery',
        })
      }

      return NextResponse.json({ success: true, sent_to: { email: !!client.email, sms: !!(client.phone && client.sms_consent) } })
    }

    // Only allow known fields
    const update: Record<string, any> = {}
    for (const key of Object.keys(body)) {
      if (ALLOWED_CLIENT_FIELDS.includes(key)) {
        update[key] = body[key]
      }
    }

    // Never overwrite address with empty string — addresses are critical for service
    if ('address' in update && (!update.address || !update.address.trim())) {
      delete update.address
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.from('clients').update(update).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Re-geocode if address changed
    if (update.address && data?.id) {
      import('@/lib/geo').then(({ geocodeClient }) => geocodeClient(data.id, update.address).catch(() => {}))
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Client update error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { id } = await params

  // Soft delete - set active to false (keeps booking history intact)
  const { error } = await supabaseAdmin.from('clients').update({ active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, archived: true })
}
