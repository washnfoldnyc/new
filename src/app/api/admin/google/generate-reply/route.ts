import { NextResponse } from 'next/server'
import { protectAdminAPI } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function POST(request: Request) {
  const authError = await protectAdminAPI()
  if (authError) return authError

  const { reviewerName, rating, comment } = await request.json()

  const prompt = `You are the owner of "Wash and Fold NYC", a professional cleaning service in New York City. Write a short, warm reply to this Google review. Be genuine and professional. Keep it under 3 sentences. Don't be overly enthusiastic or use excessive exclamation marks.

${rating >= 4 ? 'This is a positive review — thank them and mention you look forward to seeing them again.' : ''}
${rating === 3 ? 'This is a neutral review — thank them and ask how you can improve.' : ''}
${rating <= 2 ? 'This is a negative review — apologize sincerely, take responsibility, and offer to make it right. Do not be defensive.' : ''}

Reviewer: ${reviewerName}
Rating: ${rating}/5 stars
Review: ${comment || '(no comment, just a star rating)'}

Reply:`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const reply = (message.content[0] as { type: string; text: string }).text.trim()

    return NextResponse.json({ reply })
  } catch (e) {
    console.error('Failed to generate reply:', e)
    return NextResponse.json({ error: 'Failed to generate reply' }, { status: 500 })
  }
}
