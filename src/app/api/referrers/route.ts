import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { smsNewReferrer } from '@/lib/sms-templates'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hi@washandfoldnyc.com'

// Rate limiting for public lookups: 10 per 10 minutes per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimits.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 10 * 60 * 1000 })
    return false
  }
  entry.count++
  return entry.count > 10
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const email = searchParams.get('email')
    const stats = searchParams.get('stats')

    // Rate limit public lookups (by code or email)
    if (code || email) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
      if (isRateLimited(ip)) {
        return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
      }
    }

    if (code) {
      const { data, error } = await supabaseAdmin
        .from('referrers')
        .select('id, name, email, ref_code, total_earned, total_paid, preferred_payout, created_at')
        .eq('ref_code', code.toUpperCase())
        .eq('active', true)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Referrer not found' }, { status: 404 })
      }

      if (stats === 'true') {
        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

        const { data: clicks } = await supabaseAdmin
          .from('lead_clicks')
          .select('action, session_id, lead_id, created_at, device, page')
          .eq('ref_code', code.toUpperCase())
          .order('created_at', { ascending: false })

        const allClicks = clicks || []
        const uniqueVisitors = new Set(allClicks.map(c => c.session_id || c.lead_id)).size
        const bookClicks = allClicks.filter(c => c.action === 'book').length
        const thisWeek = allClicks.filter(c => new Date(c.created_at) >= weekAgo).length

        const recentActivity = allClicks.slice(0, 20).map(c => ({
          action: c.action,
          device: c.device || 'unknown',
          page: c.page || '/',
          time: c.created_at
        }))

        return NextResponse.json({
          ...data,
          linkStats: {
            clicks: allClicks.length,
            uniqueVisitors,
            bookClicks,
            thisWeek,
            thisMonth: allClicks.length
          },
          recentActivity
        })
      }

      return NextResponse.json(data)
    }

    if (email) {
      const { data, error } = await supabaseAdmin
        .from('referrers')
        .select('id, name, email, ref_code, total_earned, total_paid, preferred_payout, created_at')
        .eq('email', email.toLowerCase())
        .eq('active', true)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Referrer not found' }, { status: 404 })
      }
      return NextResponse.json(data)
    }

    const authError = await protectAdminAPI()
    if (authError) return authError

    const { data, error } = await supabaseAdmin.from('referrers').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('Referrers GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch referrers' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // Rate limit signups
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const { name, email, phone, zelle_email, zelle_phone, apple_cash_phone, preferred_payout } = body

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // --- Spam protection ---

    // Honeypot: bots fill hidden fields
    if (body.website || body.company) {
      return NextResponse.json({ error: 'Name and email required' }, { status: 400 })
    }

    // Timing: form submitted too fast (under 3 seconds) = bot
    if (body._t) {
      const elapsed = Date.now() - Number(body._t)
      if (elapsed < 3000) {
        return NextResponse.json({ error: 'Please try again' }, { status: 400 })
      }
    }

    // Name must look like a real name: at least 2 chars, contains a space or is short,
    // and not random gibberish (check consonant-to-vowel ratio)
    const nameClean = name.trim()
    const vowels = (nameClean.toLowerCase().match(/[aeiou]/g) || []).length
    const alpha = (nameClean.match(/[a-zA-Z]/g) || []).length
    if (alpha > 3 && vowels / alpha < 0.15) {
      // Gibberish like "DhTWEHfLsSsuohtKI" — very low vowel ratio
      return NextResponse.json({ error: 'Please enter your real name' }, { status: 400 })
    }
    if (nameClean.length > 50) {
      return NextResponse.json({ error: 'Name is too long' }, { status: 400 })
    }

    // Phone must be digits/dashes/parens/spaces/plus if provided
    if (phone && !/^[\d\s\-().+]+$/.test(phone)) {
      return NextResponse.json({ error: 'Please enter a valid phone number' }, { status: 400 })
    }

    // Block dotted gmail pattern (a.ng.e.l.ica... = 3+ dots in local part)
    const emailLocal = email.split('@')[0]
    if ((emailLocal.match(/\./g) || []).length >= 3) {
      return NextResponse.json({ error: 'Please use a valid email address' }, { status: 400 })
    }

    const baseCode = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const ref_code = baseCode + random
    const referralLink = `https://www.washandfoldnyc.com/book?ref=${ref_code}`
    const dashboardLink = `https://www.washandfoldnyc.com/referral-dashboard?code=${ref_code}`

    const { data, error } = await supabaseAdmin
      .from('referrers')
      .insert({ name, email: email.toLowerCase(), phone, ref_code, zelle_email: zelle_email || email.toLowerCase(), zelle_phone, apple_cash_phone, preferred_payout: preferred_payout || 'zelle', active: true })
      .select().single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Email already registered' }, { status: 400 })
      throw error
    }

    if (data) {
      // Create notification
      await supabaseAdmin.from('notifications').insert({ 
        type: 'new_referrer', 
        message: 'New referrer: ' + name + ' (' + ref_code + ') • by Admin'
      })

      // Send welcome email to referrer
      const referrerEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 30px 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0; }
            .header h1 { color: white; margin: 0; font-size: 28px; }
            .content { padding: 30px; background: #fff; border: 1px solid #e5e7eb; border-top: none; }
            .highlight-box { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center; }
            .code { font-size: 32px; font-weight: bold; color: #16a34a; letter-spacing: 2px; }
            .link-box { background: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin: 15px 0; word-break: break-all; }
            .link { color: #2563eb; text-decoration: none; font-weight: 500; }
            .btn { display: inline-block; background: #000; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 10px 5px; }
            .btn-outline { background: #fff; color: #000; border: 2px solid #000; }
            .earnings { background: #fefce8; border: 1px solid #facc15; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
            ul { padding-left: 20px; }
            li { margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to the Team, ${name}!</h1>
            </div>
            <div class="content">
              <p>Hey ${name},</p>
              <p>You're officially part of <strong>Wash and Fold NYC</strong> referral program! We're excited to have you on board.</p>
              
              <div class="highlight-box">
                <p style="margin: 0 0 10px 0; color: #666;">Your Unique Referral Code</p>
                <div class="code">${ref_code}</div>
              </div>
              
              <p><strong>Your personal referral link:</strong></p>
              <div class="link-box">
                <a href="${referralLink}" class="link">${referralLink}</a>
              </div>
              
              <div class="earnings">
                <h3 style="margin-top: 0;">💰 How You Earn</h3>
                <ul>
                  <li><strong>10% commission</strong> on every booking from your referrals</li>
                  <li>No limit on how much you can earn</li>
                  <li>Paid out weekly via ${preferred_payout === 'apple_cash' ? 'Apple Cash' : 'Zelle'}</li>
                </ul>
              </div>
              
              <p><strong>Tips for success:</strong></p>
              <ul>
                <li>Share your link on social media</li>
                <li>Send it to friends, family, and coworkers</li>
                <li>Post in local Facebook groups or Nextdoor</li>
              </ul>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${dashboardLink}" class="btn">View Your Dashboard</a>
                <a href="${referralLink}" class="btn btn-outline">Copy Referral Link</a>
              </div>
              
              <p>Questions? Just reply to this email - we're here to help!</p>
              <p>Let's get those referrals rolling! 🚀</p>
              <p>— Wash and Fold NYC Team</p>
            </div>
            <div class="footer">
              <p>Wash and Fold NYC | Professional Cleaning Services</p>
              <p>New York City</p>
            </div>
          </div>
        </body>
        </html>
      `

      await sendEmail(
        email.toLowerCase(),
        `Welcome to Wash and Fold NYC Referral Program, ${name}! 🎉`,
        referrerEmailHtml
      )

      // Send notification email to admin
      const adminEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #7c3aed; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px; }
            .info-row { display: flex; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
            .label { color: #6b7280; width: 120px; }
            .value { font-weight: 500; }
            .code-box { background: #f3f4f6; padding: 10px 15px; border-radius: 6px; font-family: monospace; font-size: 18px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">👋 New Referrer Signed Up</h2>
            </div>
            <div class="content">
              <h3 style="margin-top: 0;">${name}</h3>
              
              <div class="info-row">
                <span class="label">Email:</span>
                <span class="value">${email.toLowerCase()}</span>
              </div>
              <div class="info-row">
                <span class="label">Phone:</span>
                <span class="value">${phone || 'Not provided'}</span>
              </div>
              <div class="info-row">
                <span class="label">Payout:</span>
                <span class="value">${preferred_payout === 'apple_cash' ? 'Apple Cash' : 'Zelle'} - ${zelle_email || email.toLowerCase()}</span>
              </div>
              <div class="info-row">
                <span class="label">Referral Code:</span>
                <span class="value"><span class="code-box">${ref_code}</span></span>
              </div>
              
              <p style="margin-top: 20px;">
                <a href="https://www.washandfoldnyc.com/admin/referrals" style="color: #7c3aed;">View in Dashboard →</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `

      await sendEmail(
        ADMIN_EMAIL,
        `New Referrer: ${name} (${ref_code})`,
        adminEmailHtml
      )

      // No admin SMS — notifications via email + dashboard only
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('Referrers POST error:', err)
    return NextResponse.json({ error: 'Failed to create referrer' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const body = await request.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Referrer ID required' }, { status: 400 })

    // Whitelist allowed fields
    const allowed = ['name', 'email', 'phone', 'zelle_email', 'zelle_phone', 'apple_cash_phone', 'preferred_payout', 'active'] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabaseAdmin.from('referrers').update(updates).eq('id', id).select().single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('Referrers PUT error:', err)
    return NextResponse.json({ error: 'Failed to update referrer' }, { status: 500 })
  }
}
