import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/sms'
import { supabaseAdmin } from '@/lib/supabase'
import { emailAdmins } from '@/lib/admin-contacts'

// Rate limiting: 3 submissions per 10 minutes per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 3
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Try again later.' }, { status: 429 })
  }

  const body = await request.json()
  const { message, source } = body

  if (!message || !message.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="color: #000; margin: 0 0 16px 0;">Anonymous Feedback</h2>
      <p style="color: #666; font-size: 14px; margin: 0 0 24px 0;">Source: ${source || 'Unknown'}</p>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
        <p style="color: #000; font-size: 15px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>
      <p style="color: #999; font-size: 12px; margin: 0;">Submitted ${new Date().toLocaleString('en-US')} ET</p>
    </div>
  `

  try {
    await emailAdmins(`Feedback: ${source || 'Anonymous'}`, html)

    // SMS to admin
    const truncated = message.trim().length > 100 ? message.trim().slice(0, 100) + '...' : message.trim()
    await sendSMS('+12122029220', `The NYC Maid Feedback (${source || 'Anonymous'}): ${truncated}`, {
      skipConsent: true,
      smsType: 'feedback_alert'
    })

    await supabaseAdmin.from('notifications').insert({
      type: 'feedback',
      title: `Feedback from ${source || 'Unknown'}`,
      message: truncated
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Feedback email error:', err)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}
