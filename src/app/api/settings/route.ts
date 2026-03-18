import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAllSettings } from '@/lib/settings'

export async function GET() {
  try {
    const settings = await getAllSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Failed to fetch settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    const { key, value } = data

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key and value are required' }, { status: 400 })
    }

    await query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP',
      [key, value]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update setting:', error)
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 })
  }
}
