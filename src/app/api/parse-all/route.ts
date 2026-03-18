import { NextResponse } from 'next/server'
import { runParser } from '@/lib/parser'

export async function POST() {
  try {
    const results = await runParser()
    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Parse all error:', error)
    return NextResponse.json(
      { error: 'Ошибка парсинга' },
      { status: 500 }
    )
  }
}
