import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('[Credits API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch credits' }, { status: response.status })
    }

    const data = await response.json()
    const totalCredits = data.data?.total_credits || 0
    const totalUsage = data.data?.total_usage || 0
    const balance = totalCredits - totalUsage

    return NextResponse.json({
      balance: balance,
      totalCredits: totalCredits,
      totalUsage: totalUsage,
    })
  } catch (error: any) {
    console.error('[Credits API] Error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch credits' }, { status: 500 })
  }
}
