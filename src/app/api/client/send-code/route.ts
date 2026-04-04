import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { verificationCodeEmail } from '@/lib/email-templates'

// Rate limiting: 3 attempts per 10 minutes per identifier
const rateLimits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(id: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(id)
  if (!entry || now > entry.resetAt) {
    rateLimits.set(id, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 3
}

export async function POST(request: Request) {
  try {
    const { email, phone } = await request.json()

    if (!email && !phone) {
      return NextResponse.json({ error: 'Email or phone required' }, { status: 400 })
    }

    const identifier = email ? email.toLowerCase() : phone.replace(/\D/g, '')

    if (isRateLimited(identifier)) {
      return NextResponse.json({ error: 'Too many attempts. Please wait 10 minutes.' }, { status: 429 })
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store code — key by email if available, otherwise by phone
    const upsertKey = email ? email.toLowerCase() : `sms:${identifier}`
    const { error: dbError } = await supabaseAdmin
      .from('verification_codes')
      .upsert({
        email: upsertKey,
        code,
        expires_at: expiresAt.toISOString()
      }, { onConflict: 'email' })

    if (dbError) {
      console.error('DB error:', dbError)
      return NextResponse.json({ error: 'Failed to store code' }, { status: 500 })
    }

    // Send via email if available
    if (email) {
      const codeEmail = verificationCodeEmail(code)
      const emailResult = await sendEmail(email, codeEmail.subject, codeEmail.html)
      if (!emailResult.success) {
        console.error('Email error:', emailResult.error)
        // Fall through to SMS if email fails and phone is available
        if (!phone) {
          return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
        }
      } else {
        // Email sent — also send SMS if phone available
        if (phone) {
          await sendSMS(phone, `Your NYC Maid verification code is: ${code}`, { skipConsent: true, smsType: 'verification' }).catch(() => {})
        }
        return NextResponse.json({ success: true, method: 'email' })
      }
    }

    // Send via SMS
    if (phone) {
      const smsResult = await sendSMS(phone, `Your NYC Maid verification code is: ${code}`, { skipConsent: true, smsType: 'verification' })
      if (!smsResult.success) {
        console.error('SMS error:', smsResult)
        return NextResponse.json({ error: 'Failed to send code' }, { status: 500 })
      }
      return NextResponse.json({ success: true, method: 'sms' })
    }

    return NextResponse.json({ error: 'No delivery method available' }, { status: 500 })
  } catch (err) {
    console.error('Send code error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
