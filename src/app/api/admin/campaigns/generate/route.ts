import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { prompt, channel } = await request.json()

  if (!prompt || typeof prompt !== 'string') {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const includeEmail = channel === 'email' || channel === 'both'
    const includeSms = channel === 'sms' || channel === 'both'

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are a marketing copywriter for The NYC Maid, a premium cleaning service in NYC. Generate campaign content based on this prompt:

"${prompt}"

Return a JSON object with these fields:
- "name": a short campaign name (3-5 words, for internal use)
- "subject": an email subject line (compelling, under 60 chars)
${includeEmail ? `- "email_body": HTML email body content. Use inline styles only. Use the brand style:
  - Headings: <h1 style="font-size: 24px; font-weight: 600; color: #000; margin: 0 0 8px 0;">
  - Body text: <p style="color: #333; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
  - For CTAs use: <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 32px 0;"><tr><td align="center"><a href="https://www.thenycmaid.com/book" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Book Now</a></td></tr></table>
  - For highlight boxes: <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 24px 0;">
  - Keep it clean, warm, and professional. No emojis in email.
  - The HTML will be wrapped in the standard email template automatically — just provide the inner content.` : ''}
${includeSms ? `- "sms_body": a short SMS version (under 160 characters, include "The NYC Maid" and a call to action like "Book at thenycmaid.com/book" or "Call (212) 202-8400")` : ''}

IMPORTANT: Return ONLY the raw JSON object. No markdown, no code fences, no explanation.`
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON from response
    let parsed
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 })
    }

    return NextResponse.json({
      name: parsed.name || '',
      subject: parsed.subject || '',
      email_body: parsed.email_body || '',
      sms_body: parsed.sms_body || '',
    })
  } catch (err: unknown) {
    const error = err as { message?: string }
    console.error('Campaign generate error:', error.message || err)
    return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 })
  }
}
