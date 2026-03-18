import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateCoverImage } from '@/lib/ai'

// Извлекает заголовок из текста (первая строка, если она короткая и похожа на заголовок)
function extractTitleFromText(text: string): string {
  const lines = text.trim().split('\n')
  const firstLine = lines[0]?.trim() || ''
  
  // Если первая строка короткая (до 90 символов) и не заканчивается точкой — это заголовок
  if (firstLine.length > 0 && firstLine.length <= 90 && !firstLine.endsWith('.')) {
    return firstLine
  }
  
  // Fallback: берём первые 5-6 слов
  return text
    .replace(/\n/g, ' ')
    .split(' ')
    .filter(w => w.length > 0)
    .slice(0, 6)
    .join(' ')
    .substring(0, 50)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[Обложка API] === НАЧАЛО ЗАПРОСА ===')
  
  try {
    const { id } = await params
    console.log(`[Обложка API] ID из params: ${id}`)
    
    const postId = parseInt(id)
    
    if (isNaN(postId)) {
      console.error('[Обложка API] Ошибка: Invalid post ID')
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    const body = await request.json()
    console.log(`[Обложка API] Body:`, JSON.stringify(body))
    
    const { title, variantNumber } = body
    const targetVariant = variantNumber || 1

    console.log(`[Обложка API] Получен запрос на генерацию новой обложки для поста #${postId}, вариант текста #${targetVariant}`)

    // Получаем данные варианта из БД
    console.log(`[Обложка API] Поиск варианта #${targetVariant} в БД...`)
    const existingVariant = await query<{ generated_text: string; title_for_cover: string }>(
      'SELECT generated_text, title_for_cover FROM generated_variants WHERE raw_post_id = $1 AND variant_number = $2',
      [postId, targetVariant]
    )

    if (existingVariant.rows.length === 0) {
      console.error(`[Обложка API] Ошибка: Вариант #${targetVariant} не найден в базе данных для поста #${postId}`)
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
    }

    const postText = existingVariant.rows[0]?.generated_text || ''
    const savedTitle = existingVariant.rows[0]?.title_for_cover || ''
    
    // Приоритет заголовка: 1) переданный title, 2) сохранённый в БД, 3) извлечённый из текста
    let coverTitle = title
    
    if (!coverTitle || coverTitle.toLowerCase().includes('вариант')) {
      coverTitle = savedTitle
    }
    
    if (!coverTitle || coverTitle.toLowerCase().includes('вариант')) {
      console.log(`[Обложка API] Извлекаю заголовок из текста...`)
      coverTitle = extractTitleFromText(postText)
    }

    console.log(`[Обложка API] Итоговый заголовок: "${coverTitle}"`)

    // СТРОГОЕ ТРЕБОВАНИЕ: Всегда генерируем фон через ИИ
    console.log(`[Обложка API] Запуск генератора изображений...`)
    const imageUrl = await generateCoverImage(coverTitle, null)

    if (!imageUrl) {
      console.error(`[Обложка API] Ошибка: Нейросеть не вернула изображение`)
      return NextResponse.json({ error: 'Failed to generate cover' }, { status: 500 })
    }

    console.log(`[Обложка API] Изображение успешно создано: ${imageUrl}`)

    // Определяем следующий номер варианта для сохранения новой картинки
    const maxVariantResult = await query<{ max_num: number }>(
      'SELECT COALESCE(MAX(variant_number), 0) as max_num FROM generated_variants WHERE raw_post_id = $1',
      [postId]
    )
    const newVariantNumber = (maxVariantResult.rows[0]?.max_num || 0) + 1

    await query(`
      INSERT INTO generated_variants (raw_post_id, variant_number, generated_text, generated_image_url, title_for_cover)
      VALUES ($1, $2, $3, $4, $5)
    `, [postId, newVariantNumber, postText, imageUrl, coverTitle])

    console.log(`[Обложка API] Новый вариант #${newVariantNumber} успешно сохранен в базу данных`)

    return NextResponse.json({ 
      success: true,
      imageUrl,
      variantNumber: newVariantNumber
    })
  } catch (error: any) {
    console.error(`[Обложка API] Критическая ошибка:`, error.message)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
