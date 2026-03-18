import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { createCoverImage } from '@/lib/image'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      titleCharsPerLine,
      maxLines,
      titleFontSize,
      titleX,
      titleBottomOffset,
      // Optional: pick a specific generated post for preview
      postId,
    } = body

    // Find a post with a generated cover to use as background
    let backgroundUrl: string | null = null
    let title = 'ПРИМЕР ЗАГОЛОВКА ДЛЯ ОБЛОЖКИ ПОСТА'

    if (postId) {
      const variant = await query<{ generated_image_url: string; title_for_cover: string; generated_text: string }>(
        `SELECT generated_image_url, title_for_cover, generated_text 
         FROM generated_variants 
         WHERE raw_post_id = $1 AND generated_image_url IS NOT NULL 
         ORDER BY variant_number ASC LIMIT 1`,
        [postId]
      )
      if (variant.rows[0]) {
        backgroundUrl = variant.rows[0].generated_image_url
        title = variant.rows[0].title_for_cover || variant.rows[0].generated_text.split('\n')[0]?.substring(0, 60) || title
      }
    }

    // If no specific post, find any post with a generated image
    if (!backgroundUrl) {
      const anyVariant = await query<{ generated_image_url: string; title_for_cover: string; generated_text: string }>(
        `SELECT generated_image_url, title_for_cover, generated_text 
         FROM generated_variants 
         WHERE generated_image_url IS NOT NULL 
         ORDER BY id DESC LIMIT 1`
      )
      if (anyVariant.rows[0]) {
        backgroundUrl = anyVariant.rows[0].generated_image_url
        title = anyVariant.rows[0].title_for_cover || anyVariant.rows[0].generated_text.split('\n')[0]?.substring(0, 60) || title
      }
    }

    if (!backgroundUrl) {
      return NextResponse.json({ error: 'Нет сгенерированных обложек для превью. Сначала сгенерируйте хотя бы один пост.' }, { status: 404 })
    }

    // Generate preview with custom params
    const buffer = await createCoverImage({
      title,
      backgroundUrl,
      width: 1024,
      height: 1024,
    }, {
      titleCharsPerLine: titleCharsPerLine ? parseInt(titleCharsPerLine) : undefined,
      maxLines: maxLines ? parseInt(maxLines) : undefined,
      titleFontSize: titleFontSize ? parseInt(titleFontSize) : undefined,
      titleX: titleX ? parseInt(titleX) : undefined,
      titleBottomOffset: titleBottomOffset ? parseInt(titleBottomOffset) : undefined,
    })

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    console.error('[Cover Preview] Error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Get list of posts with generated covers (for picker)
export async function GET() {
  try {
    const result = await query<{ raw_post_id: number; title_for_cover: string; generated_image_url: string }>(
      `SELECT DISTINCT ON (gv.raw_post_id) 
        gv.raw_post_id, 
        gv.title_for_cover, 
        gv.generated_image_url
       FROM generated_variants gv
       WHERE gv.generated_image_url IS NOT NULL AND gv.title_for_cover IS NOT NULL
       ORDER BY gv.raw_post_id DESC
       LIMIT 20`
    )
    return NextResponse.json({ posts: result.rows })
  } catch (error: any) {
    console.error('[Cover Preview] Error fetching posts:', error.message)
    return NextResponse.json({ posts: [] })
  }
}
