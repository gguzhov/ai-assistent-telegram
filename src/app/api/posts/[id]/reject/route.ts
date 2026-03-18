import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const postId = parseInt(id)
    
    if (isNaN(postId)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    console.log(`[API Отклонение] Пост #${postId} помечен как отклоненный`)

    await query(
      'UPDATE raw_posts SET status = $1 WHERE id = $2',
      ['rejected', postId]
    )

    // Track admin activity for autopilot
    try {
      await query(
        'INSERT INTO admin_activity (action, post_id) VALUES ($1, $2)',
        ['reject', postId]
      )
    } catch (e) {
      // ignore if table doesn't exist yet
    }

    console.log(`[API Отклонение] УСПЕХ: Пост #${postId} больше не появится в очереди`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[API Отклонение] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to reject post' }, { status: 500 })
  }
}
