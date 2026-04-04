import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

async function verifySession(cookie: string, secret: string): Promise<boolean> {
  if (!cookie || !cookie.includes('.')) return false
  const parts = cookie.split('.')

  let payload: string
  let signature: string

  if (parts.length === 4) {
    payload = `${parts[0]}.${parts[1]}.${parts[2]}`
    signature = parts[3]
    const created = parseInt(parts[2], 36)
    if (Date.now() - created > 24 * 60 * 60 * 1000) return false
  } else if (parts.length === 3) {
    payload = `${parts[0]}.${parts[1]}`
    signature = parts[2]
    const created = parseInt(parts[1], 36)
    if (Date.now() - created > 24 * 60 * 60 * 1000) return false
  } else if (parts.length === 2) {
    payload = parts[0]
    signature = parts[1]
  } else {
    return false
  }

  if (!payload || !signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expected = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
  return expected === signature
}

// ─── Role Definitions ───────────────────────────────────────────────────────

const PAGE_ACCESS: Record<string, string[]> = {
  admin: ['dashboard', 'bookings', 'calendar', 'clients', 'team', 'finance', 'feedback'],
  manager: ['dashboard', 'bookings', 'calendar', 'clients', 'selena', 'leads', 'feedback'],
  viewer: ['dashboard', 'bookings', 'calendar'],
}

const PAGE_KEY_MAP: Record<string, string> = {
  '/admin/finance': 'finance',
  '/admin/settings': 'settings',
  '/admin/cleaners': 'team',
  '/admin/clients': 'clients',
  '/admin/selena': 'selena',
  '/admin/leads': 'leads',
  '/admin/marketing': 'marketing',
  '/admin/analytics': 'analytics',
  '/admin/referrals': 'referrals',
  '/admin/feedback': 'feedback',
  '/admin/websites': 'websites',
  '/admin/google': 'google-profile',
  '/admin/users': 'users',
  '/admin/docs': 'docs',
}

// API routes each role can READ (GET)
const API_READ_ACCESS: Record<string, string[]> = {
  admin: ['/api/dashboard', '/api/bookings', '/api/clients', '/api/cleaners', '/api/notifications', '/api/sidebar-counts', '/api/admin/recurring', '/api/admin/feedback', '/api/finance', '/api/auth/me'],
  manager: ['/api/dashboard', '/api/bookings', '/api/clients', '/api/notifications', '/api/sidebar-counts', '/api/admin/selena', '/api/admin/recurring', '/api/admin/leads', '/api/admin/feedback', '/api/leads', '/api/auth/me'],
  viewer: ['/api/dashboard', '/api/bookings', '/api/notifications', '/api/sidebar-counts', '/api/auth/me'],
}

// API routes each role can WRITE (POST/PUT/DELETE)
const API_WRITE_ACCESS: Record<string, string[]> = {
  admin: ['/api/bookings', '/api/clients', '/api/cleaners', '/api/admin/recurring', '/api/admin/feedback', '/api/finance', '/api/notifications'],
  manager: ['/api/bookings', '/api/clients', '/api/admin/selena', '/api/admin/recurring', '/api/admin/leads', '/api/admin/feedback', '/api/leads', '/api/notifications'],
  viewer: [], // viewer can NEVER write
}

// Owner-only API routes (even admin can't touch these)
const OWNER_ONLY_APIS = ['/api/settings', '/api/admin/users']

function canAccessAPI(role: string, path: string, method: string): boolean {
  if (role === 'owner') return true

  // Owner-only routes
  if (OWNER_ONLY_APIS.some(r => path.startsWith(r))) {
    return false
  }

  const isWrite = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'

  if (isWrite) {
    const allowed = API_WRITE_ACCESS[role] || []
    return allowed.some(r => path.startsWith(r))
  } else {
    const allowed = API_READ_ACCESS[role] || []
    return allowed.some(r => path.startsWith(r))
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Redirect old /login to /admin
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  const session = request.cookies.get('admin_session')?.value
  const secret = process.env.ADMIN_PASSWORD || ''
  const role = request.cookies.get('admin_role')?.value || 'owner'

  // ─── Admin Pages ────────────────────────────────────────────────────────
  if (pathname.startsWith('/admin/')) {
    if (!session || !await verifySession(session, secret)) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }

    // Role-based page blocking
    if (role !== 'owner') {
      const pageKey = PAGE_KEY_MAP[pathname]
      if (pageKey) {
        const allowed = PAGE_ACCESS[role] || []
        if (!allowed.includes(pageKey)) {
          return NextResponse.redirect(new URL('/admin', request.url))
        }
      }
    }
  }

  // ─── API Routes ─────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/client/') && !pathname.startsWith('/api/cron/') && !pathname.startsWith('/api/chat') && !pathname.startsWith('/api/team/') && !pathname.startsWith('/api/sms') && !pathname.startsWith('/api/webhooks')) {
    // Only enforce for authenticated admin sessions (skip public APIs)
    if (session && await verifySession(session, secret)) {
      if (role !== 'owner') {
        const method = request.method
        if (!canAccessAPI(role, pathname, method)) {
          return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 })
        }
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/login',
    '/api/:path*',
  ],
}
