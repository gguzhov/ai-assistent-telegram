import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { RawPost, GeneratedVariant, Source } from '@/lib/types'

interface PostRow extends RawPost {
  source_channel_id: string
  source_channel_name: string
  source_url: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const groupBy = searchParams.get('groupBy')

    const result = await query<PostRow>(`
      SELECT 
        rp.*,
        s.channel_id as source_channel_id,
        s.channel_name as source_channel_name,
        s.url as source_url
      FROM raw_posts rp
      JOIN sources s ON rp.source_id = s.id
      WHERE rp.status IN ('new', 'ready', 'processing')
      ORDER BY COALESCE(rp.arr_score, 0) DESC, rp.views DESC, rp.parsed_at DESC
      LIMIT 50
    `)

    const posts = result.rows

    if (posts.length === 0) {
      return NextResponse.json({ posts: [], grouped: {} })
    }

    const postIds = posts.map(p => p.id)
    const variantsResult = await query<GeneratedVariant>(`
      SELECT * FROM generated_variants
      WHERE raw_post_id = ANY($1)
      ORDER BY variant_number
    `, [postIds])

    const variantsByPost = new Map<number, GeneratedVariant[]>()
    for (const v of variantsResult.rows) {
      if (!variantsByPost.has(v.raw_post_id)) {
        variantsByPost.set(v.raw_post_id, [])
      }
      variantsByPost.get(v.raw_post_id)!.push(v)
    }

    const postsWithVariants = posts.map(post => ({
      ...post,
      source: {
        id: post.source_id,
        channel_id: post.source_channel_id,
        channel_name: post.source_channel_name,
        url: post.source_url,
      },
      variants: variantsByPost.get(post.id) || [],
      needsGeneration: post.status === 'new' && !variantsByPost.has(post.id)
    }))

    if (groupBy === 'channel') {
      const grouped: Record<string, typeof postsWithVariants> = {}
      for (const post of postsWithVariants) {
        const channelName = post.source.channel_name
        if (!grouped[channelName]) {
          grouped[channelName] = []
        }
        grouped[channelName].push(post)
      }
      return NextResponse.json({ posts: postsWithVariants, grouped })
    }

    return NextResponse.json({ posts: postsWithVariants })
  } catch (error) {
    console.error('Error fetching queue:', error)
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 })
  }
}
