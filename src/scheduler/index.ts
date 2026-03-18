import 'dotenv/config'
import cron from 'node-cron'
import { query } from '../lib/db'
import { publishPost, notifyAutoPublish, notifyNewPosts } from '../bot'
import { runParser, generateVariantsForPost } from '../lib/parser'
import { getSetting } from '../lib/settings'

interface ScheduledPostRow {
  id: number
  raw_post_id: number
  final_text: string
  final_image_url: string | null
  scheduled_at: Date
  source_url?: string | null
  source_anchor?: string | null
}

interface SettingRow {
  key: string
  value: string
}

async function getSettings(): Promise<Record<string, string>> {
  const result = await query<SettingRow>('SELECT key, value FROM settings')
  return result.rows.reduce((acc, row) => {
    acc[row.key] = row.value
    return acc
  }, {} as Record<string, string>)
}

/**
 * Get schedule slots from settings
 */
async function getScheduleSlots(): Promise<string[]> {
  const raw = await getSetting('schedule_slots', '12:00,16:00,20:00')
  return raw.split(',').map(s => s.trim()).filter(Boolean).sort()
}

/**
 * Find next free schedule slot
 */
async function findNextFreeSlot(): Promise<Date | null> {
  const slots = await getScheduleSlots()
  const now = new Date()

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + dayOffset)
    const dateStr = day.toISOString().split('T')[0]

    const scheduled = await query<{ scheduled_at: Date }>(`
      SELECT scheduled_at FROM scheduled_posts 
      WHERE published_at IS NULL 
        AND scheduled_at::date = $1::date
    `, [dateStr])

    const takenHours = scheduled.rows.map(r => {
      const d = new Date(r.scheduled_at)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    })

    for (const slot of slots) {
      if (takenHours.includes(slot)) continue
      const [h, m] = slot.split(':').map(Number)
      const slotDate = new Date(day)
      slotDate.setHours(h, m, 0, 0)
      if (slotDate <= now) continue
      return slotDate
    }
  }

  return null
}

async function checkAndPublishScheduled(): Promise<void> {
  console.log('Checking scheduled posts...')
  
  const now = new Date()
  
  const result = await query<ScheduledPostRow & { retry_count?: number }>(`
    SELECT * FROM scheduled_posts 
    WHERE published_at IS NULL 
      AND scheduled_at <= $1
      AND COALESCE(retry_count, 0) < 3
    ORDER BY scheduled_at ASC
    LIMIT 1
  `, [now])

  if (result.rows.length === 0) {
    console.log('No posts to publish')
    return
  }

  const post = result.rows[0]
  console.log(`Publishing post ${post.id}...`)

  const success = await publishPost(post.final_text, post.final_image_url, post.source_url, post.source_anchor)

  if (success) {
    await query(`
      UPDATE scheduled_posts 
      SET published_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [post.id])

    await query(`
      UPDATE raw_posts 
      SET status = 'posted' 
      WHERE id = $1
    `, [post.raw_post_id])

    console.log(`Post ${post.id} published successfully`)
  } else {
    // Increment retry count; after 3 failures the post will be skipped
    await query(`
      UPDATE scheduled_posts 
      SET retry_count = COALESCE(retry_count, 0) + 1 
      WHERE id = $1
    `, [post.id])
    const retries = (post.retry_count || 0) + 1
    console.error(`Failed to publish post ${post.id} (retry ${retries}/3)`)
  }
}

import { selectBestPosts } from '../lib/ai'

async function selectTopPostsHourly(): Promise<void> {
  console.log('Selecting top 5 best posts using AI...')
  
  const newPosts = await query<{ id: number; original_text: string; views: number; arr_score: number }>(`
    SELECT rp.id, rp.original_text, rp.views, COALESCE(rp.arr_score, 0) as arr_score
    FROM raw_posts rp
    WHERE rp.status = 'new'
      AND rp.original_date >= NOW() - INTERVAL '24 hours'
    ORDER BY rp.arr_score DESC, rp.views DESC
    LIMIT 20
  `)

  if (newPosts.rows.length === 0) {
    console.log('No new posts to select from')
    return
  }

  try {
    const postsForSelection = newPosts.rows.map(p => ({
      id: p.id.toString(),
      text: p.original_text
    }))

    const selectedIds = await selectBestPosts(postsForSelection)
    console.log(`AI selected ${selectedIds.length} posts: ${selectedIds.join(', ')}`)

    if (selectedIds.length > 0) {
      const numericIds = selectedIds.map(id => parseInt(id)).filter(id => !isNaN(id))
      
      if (numericIds.length > 0) {
        console.log(`[Scheduler] Boosting score for posts: ${numericIds.join(', ')}`)
        await query(`
          UPDATE raw_posts 
          SET arr_score = arr_score + 50 
          WHERE id = ANY($1::int[])
        `, [numericIds])
      }
    }
  } catch (error) {
    console.error('AI selection failed:', error)
  }
}

/**
 * Find free slots for TODAY only (for autopilot).
 * Returns only future slots that are not yet taken.
 */
async function findTodayFreeSlots(): Promise<Date[]> {
  const slots = await getScheduleSlots()
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0]

  const scheduled = await query<{ scheduled_at: Date }>(`
    SELECT scheduled_at FROM scheduled_posts 
    WHERE published_at IS NULL 
      AND scheduled_at::date = $1::date
  `, [dateStr])

  const takenHours = scheduled.rows.map(r => {
    const d = new Date(r.scheduled_at)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  const freeSlots: Date[] = []
  for (const slot of slots) {
    if (takenHours.includes(slot)) continue
    const [h, m] = slot.split(':').map(Number)
    const slotDate = new Date(now)
    slotDate.setHours(h, m, 0, 0)
    if (slotDate <= now) continue
    freeSlots.push(slotDate)
  }
  return freeSlots
}

/**
 * Autopilot: if admin has been inactive for N hours,
 * pick the best ER post from parsed posts, generate content, schedule it.
 * Only schedules into TODAY's free slots. One post per free slot max.
 */
async function checkAutopilot(): Promise<void> {
  console.log('[Автопилот] Проверка условий...')

  const settings = await getSettings()
  const enabled = settings['autopilot_enabled'] === 'true'
  if (!enabled) {
    console.log('[Автопилот] Выключен')
    return
  }

  const inactivityHours = parseInt(settings['autopilot_inactivity_hours'] || '4')

  // Check last admin activity
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS admin_activity (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        post_id INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)
  } catch (e) {
    // table might already exist
  }

  const lastActivity = await query<{ created_at: Date }>(`
    SELECT created_at FROM admin_activity 
    ORDER BY created_at DESC 
    LIMIT 1
  `)

  const now = new Date()

  if (lastActivity.rows.length > 0) {
    const lastTime = new Date(lastActivity.rows[0].created_at)
    const hoursSince = (now.getTime() - lastTime.getTime()) / (1000 * 60 * 60)

    if (hoursSince < inactivityHours) {
      console.log(`[Автопилот] Админ был активен ${hoursSince.toFixed(1)}ч назад (порог: ${inactivityHours}ч), пропускаем`)
      return
    }
    console.log(`[Автопилот] Админ неактивен ${hoursSince.toFixed(1)}ч (порог: ${inactivityHours}ч)`)
  } else {
    console.log('[Автопилот] Нет записей активности, продолжаем')
  }

  // Only schedule into TODAY's free slots
  const todayFreeSlots = await findTodayFreeSlots()
  if (todayFreeSlots.length === 0) {
    console.log('[Автопилот] Нет свободных слотов на сегодня, пропускаем')
    return
  }

  // Take the nearest free slot
  const slotDate = todayFreeSlots[0]
  console.log(`[Автопилот] Свободный слот: ${slotDate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}, всего свободных сегодня: ${todayFreeSlots.length}`)

  // Find the best post by ER from parsed posts (status = 'new' or 'ready')
  // Prefer 'ready' (already generated), otherwise 'new' (needs generation)
  const bestPost = await query<{ 
    id: number; 
    err_score: number; 
    status: string; 
    source_id: number;
    original_text: string 
  }>(`
    SELECT rp.id, COALESCE(rp.err_score, 0) as err_score, rp.status, rp.source_id, rp.original_text
    FROM raw_posts rp
    WHERE rp.status IN ('new', 'ready')
      AND rp.original_date >= NOW() - INTERVAL '24 hours'
    ORDER BY rp.err_score DESC NULLS LAST, rp.views DESC
    LIMIT 1
  `)

  if (bestPost.rows.length === 0) {
    console.log('[Автопилот] Нет подходящих постов')
    return
  }

  const post = bestPost.rows[0]
  console.log(`[Автопилот] Выбран пост #${post.id} (ER: ${post.err_score}%, статус: ${post.status})`)

  // If post needs generation, generate it
  if (post.status === 'new') {
    console.log(`[Автопилот] Генерация контента для поста #${post.id}...`)
    const success = await generateVariantsForPost(post.id)
    if (!success) {
      console.error(`[Автопилот] Ошибка генерации для поста #${post.id}`)
      return
    }
  }

  // Get the first variant
  const variants = await query<{ 
    variant_number: number; 
    generated_text: string; 
    generated_image_url: string | null 
  }>(`
    SELECT variant_number, generated_text, generated_image_url 
    FROM generated_variants 
    WHERE raw_post_id = $1 
    ORDER BY variant_number ASC 
    LIMIT 1
  `, [post.id])

  if (variants.rows.length === 0) {
    console.error(`[Автопилот] Нет вариантов для поста #${post.id}`)
    return
  }

  const variant = variants.rows[0]

  // Get source info for the post
  const sourceInfo = await query<{ channel_id: string }>(`
    SELECT s.channel_id FROM sources s
    JOIN raw_posts rp ON rp.source_id = s.id
    WHERE rp.id = $1
  `, [post.id])

  const sourceUrl = sourceInfo.rows[0] 
    ? `https://t.me/${sourceInfo.rows[0].channel_id.replace('@', '')}` 
    : null

  // Schedule the post
  await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['approved', post.id])

  await query(`
    INSERT INTO scheduled_posts (raw_post_id, selected_text_variant, selected_image_variant, final_text, final_image_url, scheduled_at, is_auto_published, source_url, source_anchor)
    VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8)
    ON CONFLICT (raw_post_id) DO UPDATE SET
      selected_text_variant = $2,
      selected_image_variant = $3,
      final_text = $4,
      final_image_url = $5,
      scheduled_at = $6,
      is_auto_published = true,
      source_url = $7,
      source_anchor = $8
  `, [
    post.id,
    variant.variant_number,
    variant.variant_number,
    variant.generated_text,
    variant.generated_image_url,
    slotDate,
    sourceUrl,
    'Источник'
  ])

  console.log(`[Автопилот] УСПЕХ: Пост #${post.id} запланирован на ${slotDate.toLocaleString('ru-RU')}`)

  // Notify admins
  try {
      await notifyAutoPublish(post.id, slotDate)
  } catch (e) {
    console.error('[Автопилот] Ошибка уведомления:', e)
  }
}

async function runParserJob(): Promise<void> {
  console.log('Running parser job...')
  
  try {
    await runParser()
    
    const result = await query(
      "SELECT COUNT(*) as count FROM raw_posts WHERE status IN ('new', 'ready')"
    )
    const count = parseInt((result.rows[0] as { count: string }).count)
    
    if (count > 0) {
      await notifyNewPosts(count)
    }
  } catch (error) {
    console.error('Parser job failed:', error)
  }
}

/**
 * Daily cleanup: remove old scheduled posts that were already published
 * and avoid duplicates for the next day.
 */
async function dailyCleanup(): Promise<void> {
  console.log('[Cleanup] Запуск ежедневной очистки...')

  try {
    // Remove published posts older than 7 days from scheduled_posts
    const cleanupResult = await query(`
      DELETE FROM scheduled_posts 
      WHERE published_at IS NOT NULL 
        AND published_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
    `)
    console.log(`[Cleanup] Удалено старых записей из scheduled_posts: ${cleanupResult.rowCount || 0}`)

    // Clean orphaned scheduled posts (where raw_post was deleted)
    const orphanResult = await query(`
      DELETE FROM scheduled_posts sp
      WHERE NOT EXISTS (
        SELECT 1 FROM raw_posts rp WHERE rp.id = sp.raw_post_id
      )
    `)
    console.log(`[Cleanup] Удалено осиротевших записей: ${orphanResult.rowCount || 0}`)
  } catch (e) {
    console.error('[Cleanup] Ошибка:', e)
  }
}

export function startScheduler(): void {
  console.log('Starting scheduler...')

  // Publish check every 5 minutes
  cron.schedule('*/5 * * * *', checkAndPublishScheduled)

  // Autopilot check every 30 minutes (replaces old auto-publish)
  cron.schedule('*/30 * * * *', checkAutopilot)

    // Parser + AI selection once a day at 08:00
    cron.schedule('0 8 * * *', async () => {
      await runParserJob()
      await selectTopPostsHourly()
    })

  // Daily cleanup at 3:00 AM
  cron.schedule('0 3 * * *', dailyCleanup)

  console.log('Scheduler started')
  console.log('- Publishing check: every 5 minutes')
  console.log('- Autopilot check: every 30 minutes')
    console.log('- Parser + Top selection: once a day at 08:00')
  console.log('- Daily cleanup: 3:00 AM')
  
  runParserJob()
}

if (require.main === module) {
  console.log('Scheduler starting...')
  
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err)
  })
  
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err)
  })
  
  startScheduler()
}

export default { startScheduler, checkAndPublishScheduled, checkAutopilot, runParserJob, dailyCleanup }
