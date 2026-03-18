import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { Source } from '@/lib/types'

export async function GET() {
  try {
    const result = await query<Source>(`
      SELECT * FROM sources 
      ORDER BY created_at DESC
    `)

    return NextResponse.json({ sources: result.rows })
  } catch (error) {
    console.error('Error fetching sources:', error)
    return NextResponse.json({ error: 'Failed to fetch sources' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { channelId, notes } = await request.json()

    if (!channelId) {
      return NextResponse.json({ error: 'Channel ID required' }, { status: 400 })
    }

    const cleanId = channelId.replace('@', '').trim()
    const url = `https://t.me/s/${cleanId}`

    const response = await fetch(url)
    if (!response.ok) {
      return NextResponse.json({ error: 'Channel not found or not accessible' }, { status: 404 })
    }

    const html = await response.text()
    const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/)
    const channelName = titleMatch ? titleMatch[1] : cleanId

    const result = await query<Source>(`
      INSERT INTO sources (channel_id, channel_name, url, notes)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (channel_id) DO UPDATE SET
        channel_name = $2,
        notes = $4,
        is_active = true
      RETURNING *
    `, [cleanId, channelName, url, notes || null])

    return NextResponse.json({ source: result.rows[0] })
  } catch (error) {
    console.error('Error adding source:', error)
    return NextResponse.json({ error: 'Failed to add source' }, { status: 500 })
  }
}
