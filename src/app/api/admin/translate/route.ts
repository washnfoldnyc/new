import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { text } = await request.json()

  if (!text || typeof text !== 'string') {
    return NextResponse.json({ error: 'No text provided' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Translate the following text to Spanish. Keep the same formatting, line breaks, numbering, and structure. Use direct, professional language appropriate for cleaning service team members. Only return the Spanish translation, nothing else.\n\n${text}`
      }]
    })

    const translation = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ translation })
  } catch (err: unknown) {
    const error = err as { message?: string; status?: number }
    console.error('Translation error:', error.message || err)
    return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 })
  }
}
