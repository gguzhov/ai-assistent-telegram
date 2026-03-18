import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { publishPost } from '@/bot'

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

    console.log(`[API Публикация] Запрос на немедленную публикацию поста #${postId}`)

      const postResult = await query<{
        id: number
        raw_post_id: number
        final_text: string
        final_image_url: string | null
        published_at: Date | null
        source_url: string | null
        source_anchor: string | null
        }>('SELECT id, raw_post_id, final_text, final_image_url, published_at, source_url, source_anchor FROM scheduled_posts WHERE id = $1', [postId])
  
      if (postResult.rows.length === 0) {
        console.error(`[API Публикация] Пост #${postId} не найден в scheduled_posts`)
        return NextResponse.json({ error: 'Post not found' }, { status: 404 })
      }
  
      const post = postResult.rows[0]
  
      if (post.published_at) {
        console.warn(`[API Публикация] Пост #${postId} уже опубликован`)
        return NextResponse.json({ error: 'Post already published' }, { status: 400 })
      }
  
      console.log(`[API Публикация] Отправка в канал...`)
      const success = await publishPost(post.final_text, post.final_image_url, post.source_url, post.source_anchor)


    if (!success) {
      console.error(`[API Публикация] Ошибка отправки в Telegram`)
      return NextResponse.json({ error: 'Failed to publish to Telegram' }, { status: 500 })
    }

    await query(`
      UPDATE scheduled_posts 
      SET published_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [postId])

    await query(`
      UPDATE raw_posts 
      SET status = 'posted' 
      WHERE id = $1
    `, [post.raw_post_id])

    console.log(`[API Публикация] УСПЕХ: Пост #${postId} опубликован в канал`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error(`[API Публикация] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to publish post' }, { status: 500 })
  }
}
