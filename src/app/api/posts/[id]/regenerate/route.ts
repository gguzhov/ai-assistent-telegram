import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generatePostVariants } from '@/lib/ai'

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

    console.log(`[API Перегенерация] === НАЧАЛО === Пост #${postId}`)

    const postResult = await query(
      'SELECT * FROM raw_posts WHERE id = $1',
      [postId]
    )

    if (postResult.rows.length === 0) {
      console.error(`[API Перегенерация] Ошибка: Пост #${postId} не найден`)
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const post = postResult.rows[0] as { original_text: string; original_image_url: string | null }

    console.log(`[API Перегенерация] Сброс текущих вариантов и установка статуса 'processing'`)
    await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['processing', postId])
    await query('DELETE FROM generated_variants WHERE raw_post_id = $1', [postId])

    console.log(`[API Перегенерация] Запуск повторной генерации 3 вариантов...`)
    const variants = await generatePostVariants(post.original_text, post.original_image_url)

    for (let i = 0; i < variants.length; i++) {
      await query(`
        INSERT INTO generated_variants (raw_post_id, variant_number, generated_text, generated_image_url, title_for_cover)
        VALUES ($1, $2, $3, $4, $5)
      `, [postId, i + 1, variants[i].text, variants[i].imageUrl, variants[i].title])
    }

    console.log(`[API Перегенерация] Сохранено ${variants.length} новых вариантов. Статус 'ready'`)
    await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['ready', postId])

    const newVariantsResult = await query(
      'SELECT * FROM generated_variants WHERE raw_post_id = $1 ORDER BY variant_number',
      [postId]
    )

    console.log(`[API Перегенерация] === ЗАВЕРШЕНО ===`)

    return NextResponse.json({ 
      success: true,
      variants: newVariantsResult.rows
    })
  } catch (error: any) {
    console.error(`[API Перегенерация] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to regenerate post' }, { status: 500 })
  }
}
