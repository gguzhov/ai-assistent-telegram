import { NextRequest, NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import { getSetting } from '@/lib/settings'

/**
 * Get schedule slots from settings, returns array of "HH:MM" strings
 */
async function getScheduleSlots(): Promise<string[]> {
  const raw = await getSetting('schedule_slots', '12:00,16:00,20:00')
  return raw.split(',').map(s => s.trim()).filter(Boolean).sort()
}

/**
 * Find the next free schedule slot.
 * Returns { date, slotsFull } where date is the Date of the free slot,
 * or null if all slots for today+tomorrow are full (slotsFull=true).
 */
async function findNextFreeSlot(): Promise<{ date: Date | null; slotsFull: boolean }> {
  const slots = await getScheduleSlots()
  const now = new Date()

  // Check today and next 7 days
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const day = new Date(now)
    day.setDate(day.getDate() + dayOffset)
    const dateStr = day.toISOString().split('T')[0] // YYYY-MM-DD

    // Get already scheduled posts for this day
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

      // Skip slots in the past
      if (slotDate <= now) continue

      return { date: slotDate, slotsFull: false }
    }

    // If this is today and all today's slots are taken, check if we need to flag overflow
    if (dayOffset === 0 && takenHours.length >= slots.length) {
      // Continue to check tomorrow
      continue
    }
  }

  return { date: null, slotsFull: true }
}

/**
 * Check if today's slots are all taken
 */
async function areTodaySlotsFull(): Promise<{ full: boolean; count: number; maxSlots: number }> {
  const slots = await getScheduleSlots()
  const today = new Date().toISOString().split('T')[0]

  const scheduled = await query<{ count: string }>(`
    SELECT COUNT(*) as count FROM scheduled_posts 
    WHERE published_at IS NULL 
      AND scheduled_at::date = $1::date
  `, [today])

  const count = parseInt(scheduled.rows[0].count)
  return { full: count >= slots.length, count, maxSlots: slots.length }
}

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

    const body = await request.json()
    const { 
      textVariant = 1, 
      imageVariant = 1, 
      scheduledAt, 
      finalText,
      sourceUrl,
      sourceAnchor
    } = body

    console.log(`[API Одобрение] Начинаю процесс одобрения поста #${postId}`)
    console.log(`[API Одобрение] Выбран текст: вариант #${textVariant}, обложка: вариант #${imageVariant}`)

    const postResult = await query(
      'SELECT * FROM raw_posts WHERE id = $1',
      [postId]
    )

    if (postResult.rows.length === 0) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const variantResult = await query<any>(
      'SELECT * FROM generated_variants WHERE raw_post_id = $1 AND variant_number = $2',
      [postId, textVariant]
    )
    
    const imageVariantResult = await query<any>(
      'SELECT generated_image_url FROM generated_variants WHERE raw_post_id = $1 AND variant_number = $2',
      [postId, imageVariant]
    )

    const variant = variantResult.rows[0]
    const imageVariantData = imageVariantResult.rows[0]
    const textContent = finalText || variant?.generated_text || ''
    const finalImageUrl = imageVariantData?.generated_image_url || variant?.generated_image_url

    let scheduleDate: Date
    let needsManualTime = false

    if (scheduledAt) {
      // User provided manual time
      scheduleDate = new Date(scheduledAt)
      console.log(`[API Одобрение] Ручное время: ${scheduleDate.toISOString()}`)
    } else {
      // Find next free slot
      const { date, slotsFull } = await findNextFreeSlot()
      
      if (slotsFull || !date) {
        // All slots are full — return needs_manual_time to frontend
        const todayStatus = await areTodaySlotsFull()
        return NextResponse.json({ 
          needsManualTime: true, 
          todaySlots: todayStatus.count,
          maxSlots: todayStatus.maxSlots,
          message: `Все ${todayStatus.maxSlots} слота на сегодня заняты. Укажите время вручную.`
        })
      }

      scheduleDate = date
      console.log(`[API Одобрение] Автослот: ${scheduleDate.toISOString()}`)
    }

    // Track admin activity
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS admin_activity (
          id SERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          post_id INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await query(
        'INSERT INTO admin_activity (action, post_id) VALUES ($1, $2)',
        ['approve', postId]
      )
    } catch (e) {
      console.error('[API Одобрение] Ошибка записи активности:', e)
    }

    await transaction(async (client) => {
      await client.query(
        'UPDATE raw_posts SET status = $1 WHERE id = $2',
        ['approved', postId]
      )
      
      await client.query(`
        INSERT INTO scheduled_posts (raw_post_id, selected_text_variant, selected_image_variant, final_text, final_image_url, scheduled_at, source_url, source_anchor)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (raw_post_id) DO UPDATE SET
          selected_text_variant = $2,
          selected_image_variant = $3,
          final_text = $4,
          final_image_url = $5,
          scheduled_at = $6,
          source_url = $7,
          source_anchor = $8
      `, [
        postId,
        textVariant,
        imageVariant,
        textContent,
        finalImageUrl,
        scheduleDate,
        sourceUrl,
        sourceAnchor
      ])
    })

    console.log(`[API Одобрение] УСПЕХ: Пост #${postId} запланирован на ${scheduleDate.toLocaleString('ru-RU')}`)

    return NextResponse.json({ success: true, scheduledAt: scheduleDate.toISOString() })
  } catch (error: any) {
    console.error(`[API Одобрение] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to approve post' }, { status: 500 })
  }
}
