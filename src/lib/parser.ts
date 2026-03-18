import * as cheerio from 'cheerio'
import { query } from './db'
import { generatePostVariants } from './ai'

interface ParsedPost {
  externalId: string
  text: string
  imageUrl: string | null
  videoUrl: string | null
  views: number
  reactions: number
  comments: number
  forwards: number
  date: Date
}

interface ChannelInfo {
  subscribers: number
}

export async function parseChannel(channelId: string): Promise<{ posts: ParsedPost[], subscribers: number }> {
  console.log(`[Парсер] Начинаю работу с каналом: ${channelId}`)
  const url = `https://t.me/s/${channelId}`
  
    try {
      console.log(`[Парсер] Загрузка страницы: ${url}`)
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        }
      })

      if (!response.ok) {
        console.error(`[Парсер] Ошибка HTTP ${response.status} для ${channelId}`)
        throw new Error(`Failed to fetch channel: ${response.status}`)
      }

      const html = await response.text()
      console.log(`[Парсер] Страница загружена. Длина HTML: ${html.length} симв.`)
      
      const $ = cheerio.load(html)
      const posts: ParsedPost[] = []

      const channelTitle = $('.tgme_channel_info_header_title').text().trim()
      console.log(`[Парсер] Название канала: "${channelTitle}"`)

      let subscribers = 0
      const subsText = $('.tgme_channel_info_counter').filter((_, el) => {
        const text = $(el).text().toLowerCase()
        return text.includes('subscriber') || text.includes('подписчик')
      }).find('.counter_value').text().trim()
      
      if (subsText) {
        const cleanSubs = subsText.replace(/\s/g, '').replace(',', '.')
        if (cleanSubs.includes('K') || cleanSubs.includes('К')) {
          subscribers = parseFloat(cleanSubs) * 1000
        } else if (cleanSubs.includes('M') || cleanSubs.includes('М')) {
          subscribers = parseFloat(cleanSubs) * 1000000
        } else {
          subscribers = parseInt(cleanSubs) || 0
        }
      }
      console.log(`[Парсер] Количество подписчиков: ${subscribers}`)

      const messageWraps = $('.tgme_widget_message_wrap')
      console.log(`[Парсер] Найдено ${messageWraps.length} элементов сообщений`)

      messageWraps.each((i, element) => {
        const $el = $(element)
        const $message = $el.find('.tgme_widget_message')
        
        const postLink = $message.attr('data-post')
        if (!postLink) return
        
        const externalId = postLink.split('/').pop() || ''

        const $textEl = $el.find('.tgme_widget_message_text')
        let text = ''
        
        if ($textEl.length) {
          $textEl.find('br').replaceWith('\n')
          text = $textEl.text().trim()
        }

        if (!text || text.length < 50) return

        let imageUrl = null
        // Оригинальные картинки парсим, но при генерации обложек они будут проигнорированы
        const $photo = $el.find('.tgme_widget_message_photo_wrap')
        if ($photo.length) {
          const style = $photo.attr('style') || ''
          const urlMatch = style.match(/url\(['"]?([^'"]+)['"]?\)/)
          if (urlMatch) imageUrl = urlMatch[1]
        }
        
        const $views = $el.find('.tgme_widget_message_views')
        let views = 0
        if ($views.length) {
          const viewsText = $views.text().trim().replace(/\s/g, '').replace(',', '.')
          if (viewsText.includes('K') || viewsText.includes('К')) {
            views = parseFloat(viewsText) * 1000
          } else if (viewsText.includes('M') || viewsText.includes('М')) {
            views = parseFloat(viewsText) * 1000000
          } else {
            views = parseInt(viewsText) || 0
          }
        }

        let reactions = 0
        const $reactions = $el.find('.tgme_widget_message_reaction_count')
        $reactions.each((_, reactionEl) => {
          const rText = $(reactionEl).text().trim().replace(/\s/g, '').replace('K', '000').replace('M', '000000')
          reactions += parseInt(rText) || 0
        })

        let comments = 0
        const $comments = $el.find('.tgme_widget_message_replies')
        if ($comments.length) {
          const commentsText = $comments.find('.tgme_widget_message_replies_counter').text().trim()
            .replace(/\s/g, '').replace('K', '000').replace('M', '000000')
          comments = parseInt(commentsText) || 0
        }

        let forwards = 0
        const $forwards = $el.find('.tgme_widget_message_forwards')
        if ($forwards.length) {
          const forwardsText = $forwards.text().trim().replace(/\s/g, '').replace('K', '000').replace('M', '000000')
          forwards = parseInt(forwardsText) || 0
        }

        const $time = $el.find('.tgme_widget_message_date time')
          const datetime = $time.attr('datetime')
          const date = datetime ? new Date(datetime) : new Date()

          // Только посты не старше 24 часов
           const now = new Date()
           const ageHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
           if (ageHours > 24) {
             console.log(`[Парсер] Пропуск поста ${externalId}: дата ${datetime} (${ageHours.toFixed(1)}ч назад)`)
             return
           }

          posts.push({ externalId, text, imageUrl, videoUrl: null, views, reactions, comments, forwards, date })
      })

      console.log(`[Парсер] Завершено. Найдено ${posts.length} подходящих постов.`)
      return { posts, subscribers }

    } catch (error: any) {
      console.error(`[Парсер] Ошибка при обработке ${channelId}:`, error)
      throw error
    }
}

export async function processNewPosts(sourceId: number, channelId: string): Promise<number> {
  console.log(`[Процессинг] Начинаю обработку новых постов для источника #${sourceId} (${channelId})`)
  const { posts, subscribers } = await parseChannel(channelId)
  let processedCount = 0

  await query('UPDATE sources SET subscribers = $1 WHERE id = $2', [subscribers, sourceId])

  // Get ERR thresholds
  const sourceResult = await query<{ min_err: number }>('SELECT min_err FROM sources WHERE id = $1', [sourceId])
  const sourceMinErr = parseFloat(String(sourceResult.rows[0]?.min_err)) || 0
  const { getSetting } = await import('./settings')
  const globalMinErr = parseFloat(await getSetting('default_min_err', '0')) || 0
  const minErr = sourceMinErr > 0 ? sourceMinErr : globalMinErr

  const candidates = posts.map(post => {
      const err = subscribers > 0 ? (post.views / subscribers) * 100 : 0
    return {
      ...post,
      arr: subscribers > 0 ? (post.views / subscribers) * 100 : 0,
      err,
      score: post.views + (post.reactions * 10)
    }
  })
  .filter(post => minErr <= 0 || post.err >= minErr)
  .sort((a, b) => b.score - a.score)
  .slice(0, 20)

  if (minErr > 0) {
    console.log(`[Процессинг] Фильтр ER >= ${minErr}%. После фильтра: ${candidates.length} постов`)
  }

  let selectedIds: string[] = []
  
  try {
    const { selectBestPosts } = await import('./ai')
    selectedIds = await selectBestPosts(candidates.map(c => ({ id: c.externalId, text: c.text })))
  } catch (e) {
    console.error('[Процессинг] Ошибка ИИ-отбора, беру топ-10 по охвату')
    selectedIds = candidates.slice(0, 10).map(c => c.externalId)
  }

  const finalPosts = candidates.filter(c => selectedIds.includes(c.externalId))

  for (const post of finalPosts) {
    const existing = await query('SELECT id FROM raw_posts WHERE source_id = $1 AND external_id = $2', [sourceId, post.externalId])
    if (existing.rows.length > 0) continue

    await query(`
      INSERT INTO raw_posts (source_id, external_id, original_text, original_image_url, views, reactions, comments, forwards, arr_score, err_score, original_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new')
    `, [sourceId, post.externalId, post.text, post.imageUrl, post.views, post.reactions, post.comments, post.forwards, post.arr, post.err, post.date])

    processedCount++
      console.log(`[Процессинг] Добавлен пост ${post.externalId} (ER: ${post.err.toFixed(2)}%)`)
  }

  await query('UPDATE sources SET last_parsed_at = CURRENT_TIMESTAMP WHERE id = $1', [sourceId])
  return processedCount
}

export async function generateVariantsForPost(postId: number, onProgress?: (stage: string) => void): Promise<boolean> {
  console.log(`[Генератор] Запуск создания контента для поста #${postId}`)
  const postResult = await query<{
    id: number
    original_text: string
    original_image_url: string | null
    status: string
  }>('SELECT id, original_text, original_image_url, status FROM raw_posts WHERE id = $1', [postId])

  if (postResult.rows.length === 0) return false
  const post = postResult.rows[0]
  
  if (['ready', 'approved', 'posted'].includes(post.status)) {
    console.log(`[Генератор] Пост #${postId} уже обработан (статус: ${post.status})`)
    return true
  }

  try {
    await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['processing', postId])
    
    // ВАЖНО: generatePostVariants внутри ai.ts теперь игнорирует original_image_url
      const variants = await generatePostVariants(post.original_text, post.original_image_url, onProgress)
    
    for (let i = 0; i < variants.length; i++) {
      await query(`
        INSERT INTO generated_variants (raw_post_id, variant_number, generated_text, generated_image_url, title_for_cover)
        VALUES ($1, $2, $3, $4, $5)
      `, [postId, i + 1, variants[i].text, variants[i].imageUrl, variants[i].title])
    }

    await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['ready', postId])
    console.log(`[Генератор] Успешно создано ${variants.length} варианта(ов) для поста #${postId}`)
    return true
  } catch (error) {
    console.error(`[Генератор] КРИТИЧЕСКАЯ ОШИБКА для поста #${postId}:`, error)
    await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['new', postId])
    return false
  }
}


export interface ParseSourceResult {
  sourceId: number
  channelName: string
  processedCount: number
  error?: string
}

export async function runParser(): Promise<ParseSourceResult[]> {
  console.log('Starting parser run...')
  const results: ParseSourceResult[] = []

    // Очистка прошлых очередей — удаляем все неопубликованные посты
    try {
      console.log('[Парсер] Очистка прошлых очередей...')
      const cleanupResult = await query(`
        DELETE FROM raw_posts 
        WHERE status != 'posted'
      `)
      console.log(`[Парсер] Удалено постов из прошлых очередей: ${cleanupResult.rowCount || 0}`)
    } catch (e) {
      console.error('[Парсер] Ошибка при очистке очередей:', e)
    }

  const sources = await query<{ id: number; channel_id: string; channel_name: string }>(
    'SELECT id, channel_id, channel_name FROM sources WHERE is_active = true'
  )

  console.log(`Found ${sources.rows.length} active sources`)
  
  if (sources.rows.length === 0) {
    console.log('No active sources found. Add sources first!')
    return results
  }

  for (const source of sources.rows) {
    console.log(`Parsing channel: ${source.channel_name} (${source.channel_id})`)
    try {
      const count = await processNewPosts(source.id, source.channel_id)
      console.log(`Processed ${count} new posts from ${source.channel_name}`)
      results.push({ sourceId: source.id, channelName: source.channel_name, processedCount: count })
    } catch (error: any) {
      console.error(`Failed to parse ${source.channel_name}:`, error?.message || error)
      results.push({ sourceId: source.id, channelName: source.channel_name, processedCount: 0, error: error?.message || 'Ошибка' })
    }
  }

  console.log('Parser run completed')
  return results
}
