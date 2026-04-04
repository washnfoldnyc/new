import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'
import { sendEmail } from '@/lib/email'
import { emailAdmins } from '@/lib/admin-contacts'

// Rate limiting: 3 applications per 10 minutes per IP
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

// GET - List all management applications (admin only)
export async function GET() {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { data, error } = await supabaseAdmin
    .from('management_applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// POST - Submit new management application (public)
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Try again later.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const {
      name, email, phone, location, current_role, years_experience,
      bilingual, management_experience, why_this_role, availability_start,
      referral_source, references, notes, position, resume_url, photo_url, video_url
    } = body

    if (!name || !email || !phone || !location || !resume_url || !photo_url || !video_url) {
      return NextResponse.json({ error: 'Name, email, phone, location, resume, photo, and selfie video are required.' }, { status: 400 })
    }

    // Check for duplicate by email
    const { data: existing } = await supabaseAdmin
      .from('management_applications')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .eq('status', 'pending')
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'You already have a pending application for this position.' }, { status: 400 })
    }

    const cleanPhone = phone.replace(/\D/g, '')

    const { data, error } = await supabaseAdmin
      .from('management_applications')
      .insert({
        name,
        email: email.toLowerCase().trim(),
        phone: cleanPhone,
        location,
        current_role: current_role || null,
        years_experience: years_experience || null,
        bilingual: bilingual || null,
        management_experience: management_experience || null,
        why_this_role: why_this_role || null,
        availability_start: availability_start || null,
        referral_source: referral_source || null,
        references: references || null,
        notes: notes || null,
        position: position || 'operations-coordinator',
        resume_url,
        photo_url,
        video_url,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // Notify admin
    await supabaseAdmin.from('notifications').insert({
      type: 'management_application',
      title: 'New Management Application',
      message: `${name} applied for Operations Manager (Virtual)`
    })

    // Email admin
    const adminHtml = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #1E2A4A;">New Application: Operations Manager (Virtual)</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Location:</strong> ${location}</p>
        <p><strong>Current Role:</strong> ${current_role || 'Not provided'}</p>
        <p><strong>Experience:</strong> ${years_experience || 'Not provided'}</p>
        <p><strong>Bilingual:</strong> ${bilingual || 'Not provided'}</p>
        <p><strong>Management Experience:</strong> ${management_experience || 'Not provided'}</p>
        <p><strong>Why This Role:</strong> ${why_this_role || 'Not provided'}</p>
        <p><strong>Available to Start:</strong> ${availability_start || 'Not provided'}</p>
        <p><strong>How They Found Us:</strong> ${referral_source || 'Not provided'}</p>
        ${references && Array.isArray(references) ? `<p><strong>References:</strong></p><ul>${references.map((r: { name: string; phone: string }, i: number) => `<li>${i + 1}. ${r.name} — ${r.phone}</li>`).join('')}</ul>` : ''}
        ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
        ${photo_url ? `<div style="margin: 16px 0;"><img src="${photo_url}" alt="${name}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #eee;" /></div>` : ''}
        <p style="margin-top: 12px;"><strong>Resume:</strong> <a href="${resume_url}" style="color: #2563eb;">Download Resume</a></p>
        <p><strong>Selfie Video:</strong> <a href="${video_url}" style="color: #2563eb;">Watch Video</a></p>
        <p style="margin-top: 20px;"><a href="https://www.washandfoldnyc.com/admin" style="color: #2563eb;">Review in Dashboard &rarr;</a></p>
      </div>
    `
    await emailAdmins(`New Ops Manager Application: ${name}`, adminHtml)

    // Email applicant confirmation
    if (email) {
      const applicantHtml = `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="color: #1E2A4A;">Application Received!</h2>
          <p>Hi ${name.split(' ')[0]},</p>
          <p>Thanks for applying for the <strong>Operations Manager (Virtual)</strong> position at Wash and Fold NYC. We've received your application, photo, video, and resume.</p>
          <p>We'll review everything and reach out to you soon. If your application moves forward, we'll schedule a brief interview.</p>
          <p style="margin-top: 20px; color: #666;">Questions?<br><a href="tel:9179706002" style="color: #1E2A4A;">(917) 970-6002</a></p>
        </div>
      `
      await sendEmail(email, 'Application Received — Operations Manager (Virtual) | Wash and Fold NYC', applicantHtml)
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (err) {
    console.error('Management application error:', err)
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 })
  }
}

// PUT - Update application status (admin only)
export async function PUT(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('management_applications')
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('Application update error:', err)
    return NextResponse.json({ error: 'Failed to update application' }, { status: 500 })
  }
}
