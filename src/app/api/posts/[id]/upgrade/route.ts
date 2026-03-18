import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { improveText } from '@/lib/ai'

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

    const { text, feedback, variantNumber } = await request.json()

    if (!text || !feedback) {
      return NextResponse.json({ error: 'Text and feedback required' }, { status: 400 })
    }

    console.log(`[API Редактор] Запрос на улучшение текста для поста #${postId} (вариант #${variantNumber})`)
    console.log(`[API Редактор] Замечания пользователя: "${feedback}"`)

    const improvedText = await improveText(text, feedback)

    if (variantNumber) {
      await query(`
        UPDATE generated_variants 
        SET generated_text = $1 
        WHERE raw_post_id = $2 AND variant_number = $3
      `, [improvedText, postId, variantNumber])
      console.log(`[API Редактор] Текст успешно обновлен в базе данных для варианта #${variantNumber}`)
    }

    console.log(`[API Редактор] УСПЕХ: Текст улучшен и отправлен обратно.`)

    return NextResponse.json({ 
      success: true,
      improvedText
    })
  } catch (error: any) {
    console.error(`[API Редактор] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to upgrade text' }, { status: 500 })
  }
}
