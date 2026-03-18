import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params
  const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })

  if (!filename || filename.includes('..') || filename.includes('/')) {
    console.error(`[${timestamp}] [API Covers] Invalid filename: ${filename}`)
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'public', 'covers', filename)
  console.log(`[${timestamp}] [API Covers] Requesting: ${filename} (path: ${filePath})`)

  if (!fs.existsSync(filePath)) {
    console.error(`[${timestamp}] [API Covers] File NOT FOUND: ${filePath}`)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const file = await fs.promises.readFile(filePath)
    console.log(`[${timestamp}] [API Covers] Serving: ${filename} (${(file.length / 1024).toFixed(1)} KB)`)
    
    return new NextResponse(file, {
      headers: {
        'Content-Type': getContentType(filename),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': file.length.toString()
      }
    })
  } catch (error: any) {
    console.error(`[${timestamp}] [API Covers] Error reading file: ${error.message}`)
    return NextResponse.json({ error: 'Read error' }, { status: 500 })
  }
}
