import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { processNewPosts } from '@/lib/parser'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceId = parseInt(id)

    if (isNaN(sourceId)) {
      return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 })
    }

    const sourceResult = await query<{ id: number; channel_id: string; channel_name: string; is_active: boolean }>(
      'SELECT id, channel_id, channel_name, is_active FROM sources WHERE id = $1',
      [sourceId]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 })
    }

    const source = sourceResult.rows[0]
    const count = await processNewPosts(source.id, source.channel_id)

    const updated = await query<{ last_parsed_at: string }>(
      'SELECT last_parsed_at FROM sources WHERE id = $1',
      [sourceId]
    )

    return NextResponse.json({
      success: true,
      processedCount: count,
      lastParsedAt: updated.rows[0]?.last_parsed_at
    })
  } catch (error: any) {
    console.error('Error parsing source:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to parse source' },
      { status: 500 }
    )
  }
}
