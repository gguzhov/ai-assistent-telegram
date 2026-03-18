import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const postId = parseInt(id)
    
    if (isNaN(postId)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    const { scheduledAt, finalText, textVariant, imageVariant, sourceUrl, sourceAnchor } = await request.json()

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (scheduledAt) {
      updates.push(`scheduled_at = $${paramIndex++}`)
      values.push(new Date(scheduledAt))
    }

    if (finalText !== undefined) {
      updates.push(`final_text = $${paramIndex++}`)
      values.push(finalText)
    }

    if (textVariant !== undefined) {
      updates.push(`selected_text_variant = $${paramIndex++}`)
      values.push(textVariant)
    }

    if (imageVariant !== undefined) {
      updates.push(`selected_image_variant = $${paramIndex++}`)
      values.push(imageVariant)
    }

    if (sourceUrl !== undefined) {
      updates.push(`source_url = $${paramIndex++}`)
      values.push(sourceUrl)
    }

    if (sourceAnchor !== undefined) {
      updates.push(`source_anchor = $${paramIndex++}`)
      values.push(sourceAnchor)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    values.push(postId)

    const result = await query(`
      UPDATE scheduled_posts 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values)

    return NextResponse.json({ post: result.rows[0] })
  } catch (error) {
    console.error('Error updating scheduled post:', error)
    return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const postId = parseInt(id)
    
    if (isNaN(postId)) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
    }

    const result = await query(
      'SELECT raw_post_id FROM scheduled_posts WHERE id = $1',
      [postId]
    )

    if (result.rows.length > 0) {
      const rawPostId = (result.rows[0] as { raw_post_id: number }).raw_post_id
      await query('UPDATE raw_posts SET status = $1 WHERE id = $2', ['ready', rawPostId])
    }

    await query('DELETE FROM scheduled_posts WHERE id = $1', [postId])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting scheduled post:', error)
    return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })
  }
}
