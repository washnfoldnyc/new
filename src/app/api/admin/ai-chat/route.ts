import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { protectAdminAPI } from '@/lib/auth'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are the NYC Maid AI assistant — a CRM copilot for managing a cleaning business.
You have tools to query and modify the database. Use them to answer questions and take actions.

Key rules:
- Always confirm before destructive actions (cancelling, deleting)
- When updating multiple bookings, state how many will be affected and ask for confirmation
- Use short, direct responses — this is a chat widget, not an essay
- Dates are stored as naive ISO strings (no timezone). Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- Prices are stored in cents. Display as dollars.
- When you find results, format them concisely — use bullet points or short lists
- If a user asks to do something, do it (after confirmation if destructive). Don't explain how to do it in the UI.`

const tools: Anthropic.Tool[] = [
  {
    name: 'search_clients',
    description: 'Search clients by name, email, phone, or address. Returns matching clients.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search term (name, email, phone, or address fragment)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_cleaners',
    description: 'Search cleaners by name, or list all active cleaners if no query given.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Optional cleaner name to search for' },
      },
      required: [],
    },
  },
  {
    name: 'query_bookings',
    description: 'Query bookings with filters. Returns bookings with client and cleaner names.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Filter by client ID' },
        cleaner_id: { type: 'string', description: 'Filter by cleaner ID' },
        status: { type: 'string', description: 'Filter by status: scheduled, completed, cancelled, pending, in_progress' },
        date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'update_bookings',
    description: 'Update one or more bookings. Use for reassigning cleaners, changing status, price, notes, times, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of booking IDs to update',
        },
        updates: {
          type: 'object',
          description: 'Fields to update: cleaner_id, status, price, notes, start_time, end_time, payment_status, payment_method',
          properties: {
            cleaner_id: { type: 'string' },
            status: { type: 'string' },
            price: { type: 'number', description: 'Price in cents' },
            notes: { type: 'string' },
            start_time: { type: 'string' },
            end_time: { type: 'string' },
            payment_status: { type: 'string' },
            payment_method: { type: 'string' },
          },
        },
        confirmed: { type: 'boolean', description: 'Set to true only after user confirms the action' },
      },
      required: ['booking_ids', 'updates'],
    },
  },
  {
    name: 'cancel_bookings',
    description: 'Cancel one or more bookings (sets status to cancelled).',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of booking IDs to cancel',
        },
        confirmed: { type: 'boolean', description: 'Set to true only after user confirms the action' },
      },
      required: ['booking_ids'],
    },
  },
  {
    name: 'get_schedule_summary',
    description: 'Get a summary of upcoming bookings for a day or date range. Good for "who is working today/tomorrow/this week".',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date (YYYY-MM-DD). Defaults to today.' },
        date_to: { type: 'string', description: 'End date for range (YYYY-MM-DD). Optional.' },
      },
      required: [],
    },
  },
  {
    name: 'get_client_details',
    description: 'Get full details for a client including their booking history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client ID' },
      },
      required: ['client_id'],
    },
  },
  {
    name: 'update_client',
    description: 'Update client details like name, email, phone, address, notes, active status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client ID' },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            address: { type: 'string' },
            notes: { type: 'string' },
            active: { type: 'boolean' },
            do_not_service: { type: 'boolean' },
          },
        },
      },
      required: ['client_id', 'updates'],
    },
  },
  {
    name: 'create_booking',
    description: 'Create a new booking. Search for the client first to get their ID. Ask for confirmation before creating.',
    input_schema: {
      type: 'object' as const,
      properties: {
        client_id: { type: 'string', description: 'Client ID (search for client first)' },
        start_time: { type: 'string', description: 'Start time as ISO string (YYYY-MM-DDTHH:MM:00)' },
        end_time: { type: 'string', description: 'End time as ISO string. Defaults to 2 hours after start_time if not provided.' },
        service_type: { type: 'string', description: 'Service type: regular, deep_clean, move_in_out, emergency. Defaults to regular.' },
        cleaner_id: { type: 'string', description: 'Cleaner ID to assign. Optional.' },
        price: { type: 'number', description: 'Price in cents. Optional.' },
        notes: { type: 'string', description: 'Booking notes. Optional.' },
        confirmed: { type: 'boolean', description: 'Set to true only after user confirms the action' },
      },
      required: ['client_id', 'start_time'],
    },
  },
  {
    name: 'get_revenue_stats',
    description: 'Get revenue and booking statistics for a date range.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date_from: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
        date_to: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      },
      required: ['date_from', 'date_to'],
    },
  },
]

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'search_clients': {
      const q = (input.query as string).trim()
      const { data, error } = await supabaseAdmin
        .from('clients')
        .select('id, name, email, phone, address, active, do_not_service, notes')
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,address.ilike.%${q}%`)
        .limit(10)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify(data)
    }

    case 'search_cleaners': {
      const q = input.query as string | undefined
      let query = supabaseAdmin.from('cleaners').select('id, name, email, phone, active, working_days')
      if (q) query = query.ilike('name', `%${q}%`)
      else query = query.eq('active', true)
      const { data, error } = await query.limit(20)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify(data)
    }

    case 'query_bookings': {
      let query = supabaseAdmin
        .from('bookings')
        .select('id, start_time, end_time, status, price, payment_status, payment_method, notes, recurring_type, service_type, schedule_id, clients(name), cleaners(name)')
        .order('start_time', { ascending: true })

      if (input.client_id) query = query.eq('client_id', input.client_id as string)
      if (input.cleaner_id) query = query.eq('cleaner_id', input.cleaner_id as string)
      if (input.status) query = query.eq('status', input.status as string)
      if (input.date_from) query = query.gte('start_time', `${input.date_from}T00:00:00`)
      if (input.date_to) query = query.lte('start_time', `${input.date_to}T23:59:59`)

      const limit = (input.limit as number) || 20
      const { data, error } = await query.limit(limit)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify(data)
    }

    case 'update_bookings': {
      const ids = input.booking_ids as string[]
      const updates = input.updates as Record<string, unknown>
      const confirmed = input.confirmed as boolean

      if (!confirmed) {
        return JSON.stringify({
          needs_confirmation: true,
          message: `This will update ${ids.length} booking(s). Ask the user to confirm.`,
          booking_count: ids.length,
          updates,
        })
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          const { error } = await supabaseAdmin.from('bookings').update(updates).eq('id', id)
          return { id, error: error?.message }
        })
      )
      const failed = results.filter(r => r.error)
      if (failed.length > 0) return JSON.stringify({ error: `${failed.length}/${ids.length} failed`, details: failed })
      return JSON.stringify({ success: true, updated: ids.length })
    }

    case 'cancel_bookings': {
      const ids = input.booking_ids as string[]
      const confirmed = input.confirmed as boolean

      if (!confirmed) {
        return JSON.stringify({
          needs_confirmation: true,
          message: `This will cancel ${ids.length} booking(s). Ask the user to confirm.`,
          booking_count: ids.length,
        })
      }

      const results = await Promise.all(
        ids.map(async (id) => {
          const { error } = await supabaseAdmin.from('bookings').update({ status: 'cancelled' }).eq('id', id)
          return { id, error: error?.message }
        })
      )
      const failed = results.filter(r => r.error)
      if (failed.length > 0) return JSON.stringify({ error: `${failed.length}/${ids.length} failed`, details: failed })
      return JSON.stringify({ success: true, cancelled: ids.length })
    }

    case 'get_schedule_summary': {
      const date = (input.date as string) || new Date().toISOString().split('T')[0]
      const dateTo = (input.date_to as string) || date

      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select('id, start_time, end_time, status, price, service_type, clients(name, address), cleaners(name)')
        .gte('start_time', `${date}T00:00:00`)
        .lte('start_time', `${dateTo}T23:59:59`)
        .in('status', ['scheduled', 'in_progress', 'completed'])
        .order('start_time', { ascending: true })

      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ date, date_to: dateTo, bookings: data, total: data?.length || 0 })
    }

    case 'get_client_details': {
      const { data: client, error: clientError } = await supabaseAdmin
        .from('clients')
        .select('*')
        .eq('id', input.client_id as string)
        .single()
      if (clientError) return JSON.stringify({ error: clientError.message })

      const { data: bookings } = await supabaseAdmin
        .from('bookings')
        .select('id, start_time, status, price, payment_status, service_type, cleaners(name)')
        .eq('client_id', input.client_id as string)
        .order('start_time', { ascending: false })
        .limit(10)

      return JSON.stringify({ client, recent_bookings: bookings })
    }

    case 'update_client': {
      const { error } = await supabaseAdmin
        .from('clients')
        .update(input.updates as Record<string, unknown>)
        .eq('id', input.client_id as string)
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true })
    }

    case 'create_booking': {
      const confirmed = input.confirmed as boolean
      if (!confirmed) {
        return JSON.stringify({
          needs_confirmation: true,
          message: 'About to create a new booking. Ask the user to confirm.',
          client_id: input.client_id,
          start_time: input.start_time,
          service_type: input.service_type || 'regular',
        })
      }

      const startTime = input.start_time as string
      let endTime = input.end_time as string | undefined
      if (!endTime) {
        const start = new Date(startTime)
        start.setHours(start.getHours() + 2)
        endTime = start.toISOString().replace(/\.\d{3}Z$/, '').split('.')[0]
      }

      const bookingData: Record<string, unknown> = {
        client_id: input.client_id,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        service_type: input.service_type || 'regular',
      }
      if (input.cleaner_id) bookingData.cleaner_id = input.cleaner_id
      if (input.price) bookingData.price = input.price
      if (input.notes) bookingData.notes = input.notes

      const { data, error } = await supabaseAdmin.from('bookings').insert(bookingData).select('id').single()
      if (error) return JSON.stringify({ error: error.message })
      return JSON.stringify({ success: true, booking_id: data.id })
    }

    case 'get_revenue_stats': {
      const { data, error } = await supabaseAdmin
        .from('bookings')
        .select('price, payment_status, status')
        .gte('start_time', `${input.date_from}T00:00:00`)
        .lte('start_time', `${input.date_to}T23:59:59`)
        .in('status', ['scheduled', 'completed', 'in_progress'])

      if (error) return JSON.stringify({ error: error.message })

      const total = data?.reduce((sum, b) => sum + (b.price || 0), 0) || 0
      const paid = data?.filter(b => b.payment_status === 'paid').reduce((sum, b) => sum + (b.price || 0), 0) || 0
      const pending = total - paid
      const completedCount = data?.filter(b => b.status === 'completed').length || 0
      const scheduledCount = data?.filter(b => b.status === 'scheduled').length || 0

      return JSON.stringify({
        total_revenue: total,
        paid,
        pending,
        total_bookings: data?.length || 0,
        completed: completedCount,
        scheduled: scheduledCount,
      })
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` })
  }
}

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { messages } = await request.json()

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  try {
    // Run the conversation loop with tool use
    let currentMessages = [...messages]
    let maxIterations = 10 // safety limit

    while (maxIterations-- > 0) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: currentMessages,
      })

      // If no tool use, return the final text response
      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find(b => b.type === 'text')
        return NextResponse.json({ reply: textBlock?.text || '' })
      }

      // Handle tool use
      if (response.stop_reason === 'tool_use') {
        // Add assistant's response (with tool_use blocks) to messages
        currentMessages.push({ role: 'assistant', content: response.content })

        // Execute all tool calls and add results
        const toolResults = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const result = await executeTool(block.name, block.input as Record<string, unknown>)
            toolResults.push({
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: result,
            })
          }
        }

        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Unexpected stop reason
      break
    }

    return NextResponse.json({ reply: 'Something went wrong — too many tool calls.' }, { status: 500 })
  } catch (err) {
    console.error('AI Chat error:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }
}
