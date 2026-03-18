import sharp from 'sharp'
import path from 'path'
import fs from 'fs'
import { getSetting } from './settings'

function ts(): string {
  return new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
}

interface CoverOptions {
  title: string
  backgroundUrl?: string | null
  logoPath?: string
  width?: number
  height?: number
}

interface TextOverrides {
  titleCharsPerLine?: number
  maxLines?: number
  titleFontSize?: number
  titleX?: number
  titleBottomOffset?: number
}

const getEnvConfig = () => ({
  width: parseInt(process.env.COVER_WIDTH || '1024'),
  height: parseInt(process.env.COVER_HEIGHT || '1024'),
  titleFontSize: parseInt(process.env.COVER_TITLE_FONT_SIZE || '56'),
  titleCharsPerLine: parseInt(process.env.COVER_TITLE_CHARS_PER_LINE || '22'),
  titleBottomOffset: parseInt(process.env.COVER_TITLE_BOTTOM_OFFSET || '80'),
  titleX: parseInt(process.env.COVER_TITLE_X || '65'),
  maxLines: 6,
})

export async function createCoverImage(options: CoverOptions, overrides?: TextOverrides): Promise<Buffer> {
  const envConfig = getEnvConfig()
  
  // Read DB settings (overridable by overrides param for preview)
  const dbCharsPerLine = await getSetting('cover_chars_per_line', '')
  const dbMaxLines = await getSetting('cover_max_lines', '')
  const dbFontSize = await getSetting('cover_font_size', '')
  const dbTitleX = await getSetting('cover_title_x', '')
  const dbBottomOffset = await getSetting('cover_bottom_offset', '')

  const config = {
    titleFontSize: overrides?.titleFontSize || (dbFontSize ? parseInt(dbFontSize) : envConfig.titleFontSize),
    titleCharsPerLine: overrides?.titleCharsPerLine || (dbCharsPerLine ? parseInt(dbCharsPerLine) : envConfig.titleCharsPerLine),
    titleBottomOffset: overrides?.titleBottomOffset || (dbBottomOffset ? parseInt(dbBottomOffset) : envConfig.titleBottomOffset),
    titleX: overrides?.titleX || (dbTitleX ? parseInt(dbTitleX) : envConfig.titleX),
    maxLines: overrides?.maxLines || (dbMaxLines ? parseInt(dbMaxLines) : envConfig.maxLines),
  }

  // Получаем качество из настроек (2048 или 4096)
  const qualitySetting = await getSetting('image_quality', '2048')
  const quality = parseInt(qualitySetting) || 2048
  
  const {
    title,
    backgroundUrl,
    width = quality,
    height = quality
  } = options

  // Масштабируем параметры текста пропорционально качеству
  const scale = width / 1024
  const titleFontSize = Math.floor(config.titleFontSize * scale)
  const titleX = Math.floor(config.titleX * scale)
  const titleBottomOffset = Math.floor(config.titleBottomOffset * scale)
  const titleCharsPerLine = config.titleCharsPerLine
  const maxLines = config.maxLines

  console.log(`[${ts()}] [Sharp] Сборка изображения ${width}x${height} (качество: ${qualitySetting}) для: "${title}"`)

  // Шаг 1: Загружаем AI-сгенерированный фон (ОБЯЗАТЕЛЬНО)
  if (!backgroundUrl) {
    throw new Error('AI-фон обязателен! backgroundUrl не предоставлен.')
  }

  let buffer: Buffer

  if (backgroundUrl.startsWith('data:image')) {
    // Base64 изображение
    console.log(`[${ts()}] [Sharp] Декодирование base64 изображения...`)
    const base64Data = backgroundUrl.replace(/^data:image\/\w+;base64,/, '')
    buffer = Buffer.from(base64Data, 'base64')
  } else if (backgroundUrl.startsWith('http')) {
    // URL изображения
    console.log(`[${ts()}] [Sharp] Загрузка AI-фонового изображения...`)
    const response = await fetch(backgroundUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!response.ok) {
      throw new Error(`Не удалось загрузить AI-фон: HTTP ${response.status}`)
    }
    
    const arrayBuffer = await response.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else if (backgroundUrl.startsWith('/')) {
    // Local path (e.g. /covers/cover_xxx.jpg)
    const localPath = path.join(process.cwd(), 'public', backgroundUrl)
    console.log(`[${ts()}] [Sharp] Загрузка локального файла: ${localPath}`)
    if (!fs.existsSync(localPath)) {
      throw new Error(`Локальный файл не найден: ${localPath}`)
    }
    buffer = fs.readFileSync(localPath)
  } else {
    throw new Error('AI-фон невалиден: должен быть URL, base64 или локальный путь')
  }
  
  if (buffer.length < 1000) {
    throw new Error(`AI-фон слишком маленький: ${buffer.length} байт`)
  }
  
  console.log(`[${ts()}] [Sharp] AI-фон загружен (${(buffer.length / 1024).toFixed(1)} КБ)`)
  
  const background = sharp(buffer)
    .resize(width, height, { fit: 'cover', position: 'center' })

  const composites: sharp.OverlayOptions[] = []

  // Шаг 2: Накладываем template.svg из корня проекта
  console.log(`[${ts()}] [Sharp] Слой 1: Наложение template.svg`)
  const templatePath = path.join(process.cwd(), 'template.svg')
  
  if (fs.existsSync(templatePath)) {
    try {
      const templateSvg = fs.readFileSync(templatePath)
      // Конвертируем SVG в PNG для корректного наложения
      const templatePng = await sharp(templateSvg)
        .resize(width, height)
        .png()
        .toBuffer()
      
      composites.push({ input: templatePng, top: 0, left: 0 })
      console.log(`[${ts()}] [Sharp] template.svg успешно наложен`)
    } catch (e: any) {
      console.error(`[${ts()}] [Sharp] Ошибка при наложении template.svg: ${e.message}`)
    }
  } else {
    console.warn(`[${ts()}] [Sharp] ВНИМАНИЕ: template.svg не найден по пути ${templatePath}`)
  }

  // Шаг 3: Добавляем градиент для читаемости текста внизу
  console.log(`[${ts()}] [Sharp] Слой 2: Градиент для текста`)
  const gradientSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="50%" style="stop-color:rgba(0,0,0,0)"/>
          <stop offset="100%" style="stop-color:rgba(0,0,0,0.8)"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#textGrad)"/>
    </svg>
  `)
  composites.push({ input: gradientSvg, top: 0, left: 0 })

  // Шаг 4: Добавляем заголовок текстом
  const cleanTitle = title.trim().toUpperCase()
  const wrappedTitle = wrapText(cleanTitle, titleCharsPerLine, maxLines)
  console.log(`[${ts()}] [Sharp] Слой 3: Текст заголовка (${wrappedTitle.length} строк, макс ${maxLines})`)
  
  let fontSize = titleFontSize
  if (wrappedTitle.length > 3) fontSize = Math.floor(titleFontSize * 0.85)
  if (wrappedTitle.length > 4) fontSize = Math.floor(titleFontSize * 0.75)
  if (wrappedTitle.length > 5) fontSize = Math.floor(titleFontSize * 0.65)

  const lineHeight = Math.floor(fontSize * 1.15)
  const totalTextHeight = wrappedTitle.length * lineHeight
  const startY = height - titleBottomOffset - totalTextHeight + fontSize

  // Load Jost font as base64 for SVG embedding
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'Jost-ExtraBold.ttf')
  let fontFace = ''
  let fontFamily = `'Arial Black', Arial, sans-serif`
  if (fs.existsSync(fontPath)) {
    const fontBase64 = fs.readFileSync(fontPath).toString('base64')
    fontFamily = `'Jost'`
    fontFace = `@font-face { font-family: 'Jost'; src: url(data:font/truetype;base64,${fontBase64}) format('truetype'); font-weight: 800; }`
  } else {
    console.warn(`[${ts()}] [Sharp] Шрифт Jost не найден: ${fontPath}, используем fallback`)
  }

  const titleSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <style>
        ${fontFace}
        .title { 
          fill: white; 
          font-family: ${fontFamily};
          font-size: ${fontSize}px; 
          font-weight: 800;
        }
      </style>
      ${wrappedTitle.map((line, i) => 
        `<text x="${titleX}" y="${startY + (i * lineHeight)}" class="title">${escapeXml(line)}</text>`
      ).join('')}
    </svg>
  `)
  composites.push({ input: titleSvg, top: 0, left: 0 })

  console.log(`[${ts()}] [Sharp] Финальный рендеринг: объединение ${composites.length} слоев...`)
  const result = await background
    .composite(composites)
    .jpeg({ quality: 90, progressive: true })
    .toBuffer()

  console.log(`[${ts()}] [Sharp] Успех! Изображение готово.`)
  return result
}

function wrapText(text: string, maxCharsPerLine: number, maxLines: number = 6): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim()
    } else {
      if (currentLine) lines.push(currentLine)
      currentLine = word
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.slice(0, maxLines)
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function saveCoverToFile(buffer: Buffer, filename: string): Promise<string> {
  const uploadsDir = path.join(process.cwd(), 'public', 'covers')
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }
  const filepath = path.join(uploadsDir, filename)
  fs.writeFileSync(filepath, buffer)
  console.log(`[${ts()}] [Файлы] Обложка сохранена: ${filepath}`)
  return `/covers/${filename}`
}
