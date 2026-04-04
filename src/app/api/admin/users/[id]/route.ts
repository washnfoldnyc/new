import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireRole, hashPassword } from '@/lib/auth'

// PUT — update admin user (owner only)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireRole('owner')
  if (authError) return authError

  const { id } = await params

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.name) updates.name = body.name
    if (body.email) updates.email = body.email.toLowerCase().trim()
    if (body.role) {
      const validRoles = ['owner', 'admin', 'manager', 'viewer']
      if (!validRoles.includes(body.role)) {
        return NextResponse.json({ error: `Invalid role. Must be: ${validRoles.join(', ')}` }, { status: 400 })
      }
      updates.role = body.role
    }
    if (body.status) {
      if (!['active', 'disabled'].includes(body.status)) {
        return NextResponse.json({ error: 'Status must be active or disabled' }, { status: 400 })
      }
      updates.status = body.status
    }
    if (body.password) {
      if (body.password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      updates.password_hash = hashPassword(body.password)
    }

    const { data, error } = await supabaseAdmin
      .from('admin_users')
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, status, last_login, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    return NextResponse.json(data)
  } catch (err) {
    console.error('Update user error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// DELETE — delete admin user (owner only)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireRole('owner')
  if (authError) return authError

  const { id } = await params

  const { error } = await supabaseAdmin
    .from('admin_users')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
