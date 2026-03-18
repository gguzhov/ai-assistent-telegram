import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSetting } from '@/lib/settings'

export async function GET() {
  try {
    const slotsRaw = await getSetting('schedule_slots', '12:00,16:00,20:00')
    const slots = slotsRaw.split(',').map(s => s.trim()).filter(Boolean).sort()

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().split('T')[0]

    // Get scheduled posts for today and tomorrow
    const scheduled = await query<{ scheduled_at: Date; id: number; final_text: string }>(`
      SELECT id, scheduled_at, final_text FROM scheduled_posts 
      WHERE published_at IS NULL 
        AND scheduled_at::date IN ($1::date, $2::date)
      ORDER BY scheduled_at ASC
    `, [today, tomorrow])

    const todayPosts = scheduled.rows.filter(r => new Date(r.scheduled_at).toISOString().split('T')[0] === today)
    const tomorrowPosts = scheduled.rows.filter(r => new Date(r.scheduled_at).toISOString().split('T')[0] === tomorrow)

    const formatSlotStatus = (posts: typeof scheduled.rows, dateStr: string) => {
      return slots.map(slot => {
        const [h, m] = slot.split(':').map(Number)
        const slotTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        const taken = posts.find(p => {
          const d = new Date(p.scheduled_at)
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` === slotTime
        })
        return {
          time: slot,
          taken: !!taken,
          postId: taken?.id || null,
          postPreview: taken ? taken.final_text.substring(0, 50) : null
        }
      })
    }

    // Get autopilot settings
    const autopilotEnabled = (await getSetting('autopilot_enabled', 'false')) === 'true'
    const autopilotHours = parseInt(await getSetting('autopilot_inactivity_hours', '4'))

    return NextResponse.json({
      slots,
      today: {
        date: today,
        slots: formatSlotStatus(todayPosts, today),
        totalTaken: todayPosts.length,
        isFull: todayPosts.length >= slots.length
      },
      tomorrow: {
        date: tomorrow,
        slots: formatSlotStatus(tomorrowPosts, tomorrow),
        totalTaken: tomorrowPosts.length,
        isFull: tomorrowPosts.length >= slots.length
      },
      autopilot: {
        enabled: autopilotEnabled,
        inactivityHours: autopilotHours
      }
    })
  } catch (error: any) {
    console.error('Failed to fetch schedule:', error)
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 })
  }
}
