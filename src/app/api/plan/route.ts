import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface ScheduledPostRow {
  id: number
  raw_post_id: number
  final_text: string
  final_image_url: string | null
  scheduled_at: Date
  published_at: Date | null
  is_auto_published: boolean
  selected_text_variant: number
  selected_image_variant: number
  original_text: string
  source_channel_name: string
  source_url: string | null
  source_anchor: string | null
  views: number
  reactions: number
}

interface VariantRow {
  id: number
  raw_post_id: number
  variant_number: number
  generated_text: string
  generated_image_url: string | null
  title_for_cover: string | null
}

export async function GET() {
  try {
    const result = await query<ScheduledPostRow>(`
      SELECT 
        sp.*,
        rp.original_text,
        rp.views,
        rp.reactions,
        s.channel_name as source_channel_name
      FROM scheduled_posts sp
      JOIN raw_posts rp ON sp.raw_post_id = rp.id
      JOIN sources s ON rp.source_id = s.id
      WHERE sp.published_at IS NULL
      ORDER BY sp.scheduled_at ASC
    `)

    const rawPostIds = result.rows.map(r => r.raw_post_id)
    
    let variantsMap: Record<number, VariantRow[]> = {}
    if (rawPostIds.length > 0) {
      const variantsResult = await query<VariantRow>(`
        SELECT * FROM generated_variants 
        WHERE raw_post_id = ANY($1)
        ORDER BY variant_number ASC
      `, [rawPostIds])
      
      variantsMap = variantsResult.rows.reduce((acc, v) => {
        if (!acc[v.raw_post_id]) acc[v.raw_post_id] = []
        acc[v.raw_post_id].push(v)
        return acc
      }, {} as Record<number, VariantRow[]>)
    }

    const postsWithVariants = result.rows.map(post => ({
      ...post,
      variants: variantsMap[post.raw_post_id] || []
    }))

    const groupedByDate = postsWithVariants.reduce((acc, post) => {
      const date = new Date(post.scheduled_at).toISOString().split('T')[0]
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(post)
      return acc
    }, {} as Record<string, (ScheduledPostRow & { variants: VariantRow[] })[]>)

    return NextResponse.json({ plan: groupedByDate })
  } catch (error) {
    console.error('Error fetching plan:', error)
    return NextResponse.json({ error: 'Failed to fetch plan' }, { status: 500 })
  }
}
