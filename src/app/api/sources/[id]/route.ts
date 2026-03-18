import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceId = parseInt(id)
    
    if (isNaN(sourceId)) {
      return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 })
    }

    await query('DELETE FROM sources WHERE id = $1', [sourceId])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting source:', error)
    return NextResponse.json({ error: 'Failed to delete source' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const sourceId = parseInt(id)
    
    if (isNaN(sourceId)) {
      return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 })
    }

    const { notes, isActive, minErr } = await request.json()

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`)
      values.push(notes)
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`)
      values.push(isActive)
    }

    if (minErr !== undefined) {
      updates.push(`min_err = $${paramIndex++}`)
      values.push(parseFloat(minErr) || 0)
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
    }

    values.push(sourceId)

    const result = await query(`
      UPDATE sources 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values)

    return NextResponse.json({ source: result.rows[0] })
  } catch (error) {
    console.error('Error updating source:', error)
    return NextResponse.json({ error: 'Failed to update source' }, { status: 500 })
  }
}
