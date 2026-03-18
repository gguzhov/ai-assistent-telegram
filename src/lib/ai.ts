const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

function ts(): string {
  return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
}

interface GeneratedVariant {
  text: string
  title: string
  imageUrl: string | null
}

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

import { getSetting } from './settings'

async function callOpenRouter(
  messages: OpenRouterMessage[],
  modelOverride?: string,
  maxTokens: number = 2000
): Promise<string> {
  const defaultModel = await getSetting('text_model', 'google/gemini-2.0-flash-001')
  const model = modelOverride || defaultModel
  const apiKey = process.env.OPENROUTER_API_KEY || ''
    console.log(`[${ts()}] [Нейросеть] Отправка запроса к ${model} (max_tokens: ${maxTokens})...`)
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.8,
        max_tokens: maxTokens,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`[${ts()}] [Нейросеть] Ошибка API: ${response.status} - ${error}`)
      throw new Error(`OpenRouter API error: ${error}`)
    }

    const data: OpenRouterResponse = await response.json()
    const content = data.choices[0]?.message?.content || ''
    console.log(`[${ts()}] [Нейросеть] Ответ получен успешно (${content.length} симв.)`)
    return content
}

export async function generatePostVariants(
  originalText: string,
  originalImageUrl: string | null,
  onProgress?: (stage: string) => void
): Promise<GeneratedVariant[]> {
  console.log(`[${ts()}] [Процесс] Начинаю генерацию вариантов текста для нового поста`)
  
  const systemPrompt = await getSetting('system_prompt', `Ты — копирайтер для Telegram-канала.
Твоя задача: переписать пост максимально человечным языком.

Tone of Voice:
- Пиши как живой человек, не как бот
- Разговорный стиль, но без мусорных слов
- Кратко и по делу, без воды
- Без канцеляризмов и штампов

Структура поста:
1. Заголовок новости (3-4 слова)
2. Главная мысль/факт (1-2 предложения)
3. Суть новости/контента (коротко)
4. Минимальный вывод (1 предложение максимум)

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО:
- Вопросы в конце поста (типа "А что думаете?", "Согласны?")
- Призывы к действию ("Подписывайтесь", "Делитесь")
- Много эмодзи (максимум 1-2 на весь пост)
- Восклицательные предложения подряд
- Вводные фразы типа "Интересно, что...", "Важно отметить..."
- Длинные посты - максимум 500 символов

ВАЖНО: 
- Заголовок будет на картинке, НЕ дублируй его в тексте
- Пиши так, как написал бы умный друг в личку
- Если нечего добавить - не добавляй`)

  const userPrompt = `Создай вариант текста на основе этого поста:

---
${originalText}
---

ФОРМАТ ОТВЕТА (строго соблюдай):
Первая строка — короткий ЗАГОЛОВОК (строго 3-4 слова, без эмодзи, главная суть).
Вторая строка — пустая.
Далее — основной текст новости.

Пример формата:
OpenAI запустила GPT-5

Новая модель показывает впечатляющие результаты в тестах...

ВАЖНО: Заголовок будет вынесен на картинку и НЕ попадёт в текст поста. Заголовок МАКСИМУМ 3-4 слова!`

  // Получаем модели для каждого варианта из настроек
  const defaultModel = 'google/gemini-2.0-flash-001'
  const model1 = await getSetting('text_model_1', defaultModel)
  const model2 = await getSetting('text_model_2', defaultModel)
  const model3 = await getSetting('text_model_3', defaultModel)
  const models = [model1, model2, model3]

  console.log(`[${ts()}] [Процесс] Модели для генерации: ${models.join(', ')}`)

  // Генерируем 3 варианта параллельно, каждый своей моделью
  const textResults = await Promise.all(
    models.map(async (model, i) => {
      const variantNum = i + 1
      console.log(`[${ts()}] [Текст ${variantNum}] Генерация моделью ${model}...`)
      onProgress?.(`Генерация текста ${variantNum}/3`)
      
      try {
          const response = await callOpenRouter([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ], model)

          // Парсим ответ: первая строка = заголовок, остальное = текст
          const lines = response.trim().split('\n')
          const title = lines[0]?.trim() || ''
          
          // Убираем первую строку (заголовок) и пустые строки после неё
          let textStartIndex = 1
          while (textStartIndex < lines.length && lines[textStartIndex].trim() === '') {
            textStartIndex++
          }
          const text = lines.slice(textStartIndex).join('\n').trim()
          
          console.log(`[${ts()}] [Текст ${variantNum}] Заголовок: "${title}"`)
          console.log(`[${ts()}] [Текст ${variantNum}] Текст: ${text.length} симв.`)
          
          return { text: text || response.trim(), title }
        } catch (e: any) {
          console.error(`[${ts()}] [Текст ${variantNum}] Ошибка: ${e.message}`)
          // Fallback: первые слова как заголовок
          const fallbackTitle = originalText
            .replace(/\n/g, ' ')
            .split(' ')
            .filter(w => w.length > 0)
            .slice(0, 5)
            .join(' ')
          return { text: originalText, title: fallbackTitle }
        }
    })
  )

  console.log(`[${ts()}] [Процесс] Все тексты сгенерированы, создаю обложку для варианта 1...`)
  onProgress?.('Генерация обложки...')

  // Генерируем обложку только для первого варианта (экономия кредитов)
  let firstCoverUrl: string | null = null
  if (textResults[0]?.title) {
    try {
      firstCoverUrl = await generateCoverImage(textResults[0].title, null)
    } catch (e: any) {
      console.error(`[${ts()}] [Обложка 1] Ошибка: ${e.message}`)
    }
  }

  const variants = textResults.map((v, i) => ({
    text: v.text,
    title: v.title,
    imageUrl: i === 0 ? firstCoverUrl : null
  }))

  console.log(`[${ts()}] [Успех] Все варианты текста и обложек сгенерированы`)
  return variants
}

export async function improveText(text: string, feedback: string): Promise<string> {
  console.log(`[${ts()}] [Правка] Улучшение текста по запросу пользователя...`)
  const systemPrompt = await getSetting('system_prompt_editor', `Ты — редактор текстов для Telegram-канала.
Твоя задача: улучшить текст согласно замечаниям пользователя.
Сохрани общий стиль и структуру, но внеси требуемые правки.`)

  const userPrompt = `Замечания: ${feedback}

Текст который нужно исправить:
${text}

Верни только исправленный текст без дополнительных комментариев.`

  const response = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ])

  console.log(`[${ts()}] [Успех] Текст успешно обновлен редактором`)
  return response.trim()
}

export async function generateBackgroundPrompt(title: string): Promise<string> {
  console.log(`[${ts()}] [ИИ Фон] Формирую описание для генерации киберпанк-фона по теме: "${title}"`)
  
  // Получаем модель для генерации промпта из настроек
  const promptModel = await getSetting('prompt_model', 'openai/gpt-4o-mini')
  console.log(`[${ts()}] [ИИ Фон] Использую модель: ${promptModel}`)
  
  const systemPrompt = await getSetting('image_prompt', `You are an AI that generates image prompts for CYBERPUNK style backgrounds.
Create a short prompt (max 40 words) in ENGLISH.

Style requirements:
- Neon colors (pink, cyan, purple, green)
- Futuristic cityscape or tech elements
- Dark atmosphere with bright light accents
- Glitch effects, holograms, digital elements
- Rain, reflections, glowing fog

DO NOT include: text, people, faces, logos, brand names.
Background must be atmospheric and suitable for text overlay.

IMPORTANT: Reply with ONLY the English prompt, nothing else.`)

  const response = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Topic: ${title}. Generate English prompt:` }
  ], promptModel, 150) // Промпт для картинки короткий — достаточно 150 токенов

  const prompt = response.trim()
  console.log(`[${ts()}] [ИИ Фон] Киберпанк-промпт готов: ${prompt}`)
  return prompt
}

export async function selectBestPosts(posts: { id: string; text: string }[]): Promise<string[]> {
  if (posts.length === 0) return []
  console.log(`[${ts()}] [ИИ Отбор] Анализирую ${posts.length} постов для выбора лучших...`)

  const selectionPrompt = await getSetting('selection_prompt', 'Ты — экспертный редактор технологического канала. Твоя задача — выбрать самые интересные и хайповые новости из списка. Верни ТОЛЬКО список числовых ID выбранных новостей через запятую.')

  const cleanPosts = posts.map(p => ({
    id: p.id,
    text: p.text.replace(/https?:\/\/[^\s]+/g, '[ссылка]').substring(0, 500)
  }))

  const postsText = cleanPosts.map(p => `НОВОСТЬ #${p.id}\n${p.text}`).join('\n\n---\n\n')

  const response = await callOpenRouter([
    { role: 'system', content: selectionPrompt },
    { role: 'user', content: `Вот список новостей для выбора (выбери от 1 до 5 лучших):\n\n${postsText}\n\nИНСТРУКЦИЯ: Твой ответ должен содержать ТОЛЬКО ID (числа) выбранных новостей через запятую. Например: 123, 456, 789. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любой текст, ссылки или пояснения. Только числа и запятые.` }
  ], undefined, 100) // Только ID через запятую — достаточно 100 токенов

  const candidateIds = new Set(posts.map(p => p.id))
  const foundNumbers = response.match(/\d+/g) || []
  const validSelectedIds: string[] = []
  
  for (const num of foundNumbers) {
    if (candidateIds.has(num)) {
      validSelectedIds.push(num)
    }
  }
  
  const finalIds = Array.from(new Set(validSelectedIds)).slice(0, 10)
  console.log(`[${ts()}] [ИИ Отбор] Выбрано ${finalIds.length} постов: ${finalIds.join(', ')}`)
  return finalIds
}

export async function generateCoverImage(
  title: string,
  originalImageUrl: string | null = null
): Promise<string> {
  console.log(`[${ts()}] [Обложка] Начало сборки для: "${title.substring(0, 30)}..."`)
  
  if (originalImageUrl) {
    console.log(`[${ts()}] [Обложка] Оригинальная картинка поста ИГНОРИРУЕТСЯ по настройкам`)
  }

  const { createCoverImage, saveCoverToFile } = await import('./image')
  
  // Шаг 1: Генерируем промпт для киберпанк-фона
  console.log(`[${ts()}] [Обложка] Шаг 1: Создание ИИ-описания фона...`)
  const prompt = await generateBackgroundPrompt(title)
  
  // Шаг 2: Генерируем изображение через AI (ОБЯЗАТЕЛЬНО)
  console.log(`[${ts()}] [Обложка] Шаг 2: Генерация изображения через AI...`)
  const backgroundUrl = await generateImageWithAI(prompt)
  
  if (!backgroundUrl) {
    throw new Error('AI не вернул изображение! Генерация обложки невозможна.')
  }
  
  console.log(`[${ts()}] [Обложка] AI-изображение получено: ${backgroundUrl.substring(0, 60)}...`)

  // Шаг 3: Собираем обложку (накладываем template.svg и текст)
  console.log(`[${ts()}] [Обложка] Шаг 3: Наложение шаблона и текста (Sharp)...`)
  const buffer = await createCoverImage({
    title,
    backgroundUrl,
    logoPath: process.env.LOGO_PATH
  })
  
  // Шаг 4: Сохраняем
  console.log(`[${ts()}] [Обложка] Шаг 4: Сохранение готового файла...`)
  const filename = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
  const url = await saveCoverToFile(buffer, filename)
  
  console.log(`[${ts()}] [Успех] Обложка готова и доступна по адресу: ${url}`)
  return url
}

export async function generateImageWithAI(prompt: string): Promise<string> {
  const model = await getSetting('image_model', 'google/gemini-3-pro-image-preview')
  console.log(`[${ts()}] [ИИ Генератор] Запрос к ${model}: "${prompt.substring(0, 80)}..."`)
  
  // OpenRouter использует единый /chat/completions endpoint для всех моделей генерации изображений
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'user', content: `Generate an image: ${prompt}` }
      ]
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`AI API ошибка (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const message = data.choices?.[0]?.message
  
  // Логируем структуру ответа для отладки
  console.log(`[${ts()}] [ИИ Генератор] Структура ответа:`, JSON.stringify({
    hasContent: !!message?.content,
    contentLength: message?.content?.length || 0,
    hasImages: !!message?.images,
    imagesCount: message?.images?.length || 0,
    contentPreview: message?.content?.substring(0, 200) || 'нет'
  }))
  
  // Вариант 1: images массив в message
  if (message?.images && message.images.length > 0) {
    const img = message.images[0]
    const imageUrl = img?.image_url?.url || img?.url || img
    if (imageUrl && typeof imageUrl === 'string') {
      console.log(`[${ts()}] [ИИ Генератор] Изображение из images[]`)
      return imageUrl
    }
  }
  
  // Вариант 2: content содержит base64 data URL
  const content = message?.content || ''
  if (content.includes('data:image')) {
    const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
    if (base64Match) {
      console.log(`[${ts()}] [ИИ Генератор] Base64 изображение в content`)
      return base64Match[0]
    }
  }
  
  // Вариант 3: content содержит URL изображения
  const urls = content.match(/https?:\/\/[^\s"'<>\]]+/gi) || []
  for (const url of urls) {
    // Проверяем что URL похож на изображение
    if (url.match(/\.(jpg|jpeg|png|webp|gif)$/i) || 
        url.includes('googleusercontent') || 
        url.includes('storage.googleapis') ||
        url.includes('cdn') ||
        url.includes('image')) {
      console.log(`[${ts()}] [ИИ Генератор] URL изображения в content: ${url.substring(0, 60)}...`)
      return url
    }
  }
  
  // Вариант 4: первый URL если есть
  if (urls.length > 0) {
    console.log(`[${ts()}] [ИИ Генератор] Первый URL из content: ${urls[0].substring(0, 60)}...`)
    return urls[0]
  }

  // Выводим полный ответ для диагностики
  console.error(`[${ts()}] [ИИ Генератор] Полный ответ API:`, JSON.stringify(data, null, 2).substring(0, 1000))
  throw new Error('AI не вернул изображение в ответе!')
}
