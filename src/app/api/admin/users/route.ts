import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireRole, hashPassword } from '@/lib/auth'
import { sendEmail } from '@/lib/email'

// GET — list all admin users (owner only)
export async function GET() {
  const authError = await requireRole('owner')
  if (authError) return authError

  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('id, email, name, role, status, last_login, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST — create new admin user (owner only)
export async function POST(request: Request) {
  const authError = await requireRole('owner')
  if (authError) return authError

  try {
    const { email, name, password, role } = await request.json()

    if (!email || !name || !password || !role) {
      return NextResponse.json({ error: 'Email, name, password, and role are required' }, { status: 400 })
    }

    const validRoles = ['owner', 'admin', 'manager', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    // Check for existing email
    const { data: existing } = await supabaseAdmin
      .from('admin_users')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const passwordHash = hashPassword(password)

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .insert({
        email: email.toLowerCase().trim(),
        name,
        password_hash: passwordHash,
        role,
      })
      .select('id, email, name, role, status, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Send welcome email with login credentials
    const roleLabels: Record<string, string> = {
      owner: 'Owner',
      admin: 'Operations Admin',
      manager: 'Manager',
      viewer: 'Viewer',
    }
    const welcomeHtml = `
      <div style="font-family: sans-serif; max-width: 500px;">
        <h2 style="color: #1E2A4A;">Welcome to The NYC Maid</h2>
        <p>Hi ${name},</p>
        <p>You've been added as <strong>${roleLabels[role] || role}</strong> on The NYC Maid operations platform.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Login URL:</strong> <a href="https://www.thenycmaid.com/admin" style="color: #2563eb;">thenycmaid.com/admin</a></p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${email.toLowerCase().trim()}</p>
          <p style="margin: 4px 0;"><strong>Password:</strong> ${password}</p>
        </div>
        <p style="color: #64748b; font-size: 13px;">Please log in and change your password. If you have any questions, text Jeff at (212) 202-8400.</p>
      </div>
    `
    await sendEmail(email.toLowerCase().trim(), 'Welcome to The NYC Maid — Your Login Credentials', welcomeHtml).catch(err => console.error('Welcome email failed:', err))

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('Create user error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
