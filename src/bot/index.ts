import 'dotenv/config'
import { Telegraf, Context } from 'telegraf'
import { query } from '../lib/db'
import { getSetting } from '../lib/settings'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || ''
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => parseInt(id.trim()))

const bot = new Telegraf(BOT_TOKEN)

/**
 * Truncate HTML text safely: don't cut inside tags, close any open tags.
 */
function safeTruncateHtml(html: string, maxLen: number): string {
  if (html.length <= maxLen) return html
  
  // Find a safe cut point: don't cut inside an HTML tag
  let cutAt = maxLen
  const lastOpenBracket = html.lastIndexOf('<', cutAt)
  const lastCloseBracket = html.lastIndexOf('>', cutAt)
  
  // If we're inside a tag (last < is after last >), cut before that tag
  if (lastOpenBracket > lastCloseBracket) {
    cutAt = lastOpenBracket
  }
  
  let truncated = html.substring(0, cutAt)
  
  // Close any open tags
  const openTags: string[] = []
  const tagRegex = /<\/?([a-z]+)[^>]*>/gi
  let match
  while ((match = tagRegex.exec(truncated)) !== null) {
    const tag = match[1].toLowerCase()
    if (match[0].startsWith('</')) {
      // Closing tag
      const idx = openTags.lastIndexOf(tag)
      if (idx !== -1) openTags.splice(idx, 1)
    } else if (!match[0].endsWith('/>')) {
      // Opening tag
      openTags.push(tag)
    }
  }
  
  // Close remaining open tags in reverse order
  for (let i = openTags.length - 1; i >= 0; i--) {
    truncated += `</${openTags[i]}>`
  }
  
  return truncated
}

/**
 * Sanitize HTML for Telegram: only allow supported tags.
 * Telegram supports: b, strong, i, em, u, ins, s, strike, del, a, code, pre, tg-spoiler
 */
function sanitizeHtmlForTelegram(html: string): string {
  const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'a', 'code', 'pre', 'tg-spoiler', 'blockquote']
  // Remove unsupported tags but keep their content
  return html.replace(/<\/?([a-z][a-z0-9-]*)[^>]*>/gi, (match, tag) => {
    if (allowedTags.includes(tag.toLowerCase())) return match
    return '' // strip unsupported tag
  })
}

bot.command('start', async (ctx) => {
  const userId = ctx.from?.id
  
  if (!userId || !ADMIN_IDS.includes(userId)) {
    await ctx.reply('Доступ запрещён.')
    return
  }

  await ctx.reply(
    'Привет! Я бот для управления контентом канала.\n\n' +
    'Команды:\n' +
    '/queue - Посмотреть очередь постов\n' +
    '/plan - Контент-план\n' +
    '/sources - Управление источниками\n' +
    '/parse - Запустить парсер вручную\n' +
    '/status - Статус системы',
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '📱 Открыть приложение', web_app: { url: APP_URL } }
        ]]
      }
    }
  )
})

bot.command('queue', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) return

  const result = await query(
    'SELECT COUNT(*) as count FROM raw_posts WHERE status = $1',
    ['ready']
  )
  const count = (result.rows[0] as { count: string }).count

  await ctx.reply(
    `📋 В очереди на модерацию: ${count} постов`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Открыть очередь', web_app: { url: `${APP_URL}/queue` } }
        ]]
      }
    }
  )
})

bot.command('plan', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) return

  const result = await query(`
    SELECT COUNT(*) as count, 
           MIN(scheduled_at) as next_post
    FROM scheduled_posts 
    WHERE published_at IS NULL
  `)
  
  const row = result.rows[0] as { count: string; next_post: Date | null }
  const count = row.count
  const nextPost = row.next_post

  let message = `📅 Запланировано постов: ${count}`
  if (nextPost) {
    message += `\n⏰ Ближайший: ${new Date(nextPost).toLocaleString('ru-RU')}`
  }

  await ctx.reply(message, {
    reply_markup: {
      inline_keyboard: [[
        { text: '📅 Открыть план', web_app: { url: `${APP_URL}/plan` } }
      ]]
    }
  })
})

bot.command('sources', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) return

  const result = await query(
    'SELECT COUNT(*) as count FROM sources WHERE is_active = true'
  )
  const count = (result.rows[0] as { count: string }).count

  await ctx.reply(`📡 Активных источников: ${count}`, {
    reply_markup: {
      inline_keyboard: [[
        { text: '⚙️ Управление', web_app: { url: `${APP_URL}/sources` } }
      ]]
    }
  })
})

bot.command('status', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) return

  const [queueResult, planResult, sourcesResult] = await Promise.all([
    query('SELECT COUNT(*) as count FROM raw_posts WHERE status = $1', ['ready']),
    query('SELECT COUNT(*) as count FROM scheduled_posts WHERE published_at IS NULL'),
    query('SELECT COUNT(*) as count FROM sources WHERE is_active = true')
  ])

  const queue = (queueResult.rows[0] as { count: string }).count
  const planned = (planResult.rows[0] as { count: string }).count
  const sources = (sourcesResult.rows[0] as { count: string }).count

  await ctx.reply(
    '📊 Статус системы:\n\n' +
    `📋 В очереди: ${queue}\n` +
    `📅 Запланировано: ${planned}\n` +
    `📡 Источников: ${sources}\n\n` +
    `✅ Система работает нормально`
  )
})

bot.command('parse', async (ctx) => {
  const userId = ctx.from?.id
  if (!userId || !ADMIN_IDS.includes(userId)) return

  await ctx.reply('🔄 Запускаю парсер...')
  
  try {
    const { runParser } = await import('../lib/parser')
    await runParser()
    
    const result = await query(
      'SELECT COUNT(*) as count FROM raw_posts WHERE status = $1',
      ['ready']
    )
    const count = (result.rows[0] as { count: string }).count
    
    await ctx.reply(`✅ Парсер завершил работу!\n\n📋 Постов готово к модерации: ${count}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Проверить посты', web_app: { url: `${APP_URL}/queue` } }
        ]]
      }
    })
  } catch (error) {
    console.error('Parser error:', error)
    await ctx.reply(`❌ Ошибка парсера: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
})

export async function notifyNewPosts(count: number): Promise<void> {
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(
        adminId,
        `🆕 Готово ${count} новых постов!\n\nТексты и обложки сгенерированы. Требуется проверка.`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Проверить посты', web_app: { url: `${APP_URL}/queue` } }
            ]]
          }
        }
      )
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error)
    }
  }
}

export async function publishPost(
  text: string,
  imageUrl: string | null,
  sourceUrl?: string | null,
  sourceAnchor?: string | null
): Promise<boolean> {
  try {
    // Use target_channel_id from settings if available, else fall back to env
    const targetChannel = await getSetting('target_channel_id', '') || CHANNEL_ID
    console.log(`Publishing to channel: ${targetChannel}`)
    console.log(`Text length: ${text.length}, Image: ${imageUrl ? 'yes' : 'no'}`)
    
      let finalText = sanitizeHtmlForTelegram(text)
    if (sourceUrl && sourceUrl.trim() !== '') {
      const anchor = (sourceAnchor && sourceAnchor.trim() !== '') ? sourceAnchor : 'Источник'
      finalText += `\n\n<a href="${sourceUrl}">${anchor}</a>`
    }

    if (imageUrl) {
      let photoSource: Buffer | null = null
      
      if (imageUrl.startsWith('data:image')) {
        // Base64 data URL
        console.log('Processing base64 image...')
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '')
        photoSource = Buffer.from(base64Data, 'base64')
        console.log(`Decoded base64: ${photoSource.length} bytes`)
      } else if (imageUrl.startsWith('/covers/')) {
        const path = await import('path')
        const fs = await import('fs')
        const filePath = path.join(process.cwd(), 'public', imageUrl)
        console.log(`Trying local file: ${filePath}`)
        
        if (fs.existsSync(filePath)) {
          photoSource = fs.readFileSync(filePath)
          console.log(`Loaded from local file: ${photoSource.length} bytes`)
        }
      } else if (imageUrl.startsWith('http')) {
        console.log(`Downloading image from: ${imageUrl.substring(0, 80)}...`)
        try {
          const response = await fetch(imageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*'
            },
            redirect: 'follow'
          })
          console.log(`Download response: ${response.status} ${response.statusText}`)
          
          const contentType = response.headers.get('content-type') || ''
          console.log(`Content-Type: ${contentType}`)
          
          if (response.ok && contentType.includes('image')) {
            const arrayBuffer = await response.arrayBuffer()
            photoSource = Buffer.from(arrayBuffer)
            console.log(`Downloaded ${photoSource.length} bytes`)
          } else if (response.ok) {
            const arrayBuffer = await response.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            const header = buffer.slice(0, 8)
            const isJpeg = header[0] === 0xFF && header[1] === 0xD8
            const isPng = header[0] === 0x89 && header[1] === 0x50
            const isGif = header[0] === 0x47 && header[1] === 0x49
            const isWebp = header[8] === 0x57 && header[9] === 0x45
            
            if (isJpeg || isPng || isGif || isWebp) {
              photoSource = buffer
              console.log(`Downloaded ${photoSource.length} bytes (detected as image by magic bytes)`)
            } else {
              console.log('Downloaded content is not a valid image')
            }
          }
        } catch (e: any) {
          console.error('Failed to download image:', e?.message)
        }
      }
      
    if (photoSource && photoSource.length > 1000) {
      console.log(`Sending photo with caption (${finalText.length} chars)...`)
      
        // Telegram caption limit: 1024 characters
        let caption = finalText
        if (caption.length > 1024) {
          console.warn(`Caption too long (${caption.length}), truncating to 1024`)
          caption = safeTruncateHtml(caption, 1021) + '...'
        }
      
      try {
          await bot.telegram.sendPhoto(targetChannel, { source: photoSource }, {
            caption: caption,
            parse_mode: 'HTML'
          })
        } catch (photoError: any) {
          console.error('Photo send error:', photoError?.message || photoError?.description || 'Unknown error')
          // Попробуем отправить без фото
          console.log('Retrying without photo...')
          const showPreview = (await getSetting('show_link_preview', 'false')) === 'true'
          await bot.telegram.sendMessage(targetChannel, finalText, {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: !showPreview }
          } as any)
        }
      } else {
        console.log('No valid image available, sending text only')
        const showPreview = (await getSetting('show_link_preview', 'false')) === 'true'
        await bot.telegram.sendMessage(targetChannel, finalText, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: !showPreview }
        } as any)
      }
    } else {
      const showPreview = (await getSetting('show_link_preview', 'false')) === 'true'
      
      await bot.telegram.sendMessage(targetChannel, finalText, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: !showPreview }
      } as any)
    }
    console.log('Post published successfully')
    return true
  } catch (error: any) {
    console.error('Failed to publish post:', error?.message || error?.description || 'Unknown error')
    if (error?.response) {
      console.error('Telegram API response:', error.response.description || error.response)
    }
    return false
  }
}

export async function notifyAutoPublish(postId: number, scheduledTime?: Date): Promise<void> {
  const timeStr = scheduledTime 
    ? scheduledTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : null
  const msg = timeStr
    ? `⚡ Автопилот\n\nПост #${postId} запланирован на ${timeStr} (автоматически, т.к. не было действий).`
    : `⚡ Автопилот\n\nПост #${postId} был опубликован автоматически, так как не было действий в течение установленного времени.`

  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, msg)
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error)
    }
  }
}

export function startBot(): void {
  bot.launch()
  console.log('Telegram bot started')

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

// Auto-start only when run directly
if (require.main === module) {
  startBot()
}

export default bot
