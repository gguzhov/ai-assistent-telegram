import { NextRequest, NextResponse } from 'next/server'
import { generateVariantsForPost } from '@/lib/parser'
import { query } from '@/lib/db'
import type { GeneratedVariant } from '@/lib/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const postId = parseInt(id)
  
  if (isNaN(postId)) {
    return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 })
  }

  // Check if client wants SSE
  const accept = request.headers.get('accept') || ''
  if (accept.includes('text/event-stream')) {
    return handleSSE(postId)
  }

  // Regular JSON response (backwards compatible)
  try {
    console.log(`[API Генерация] === НАЧАЛО === Пост #${postId}`)
    const success = await generateVariantsForPost(postId)
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to generate variants' }, { status: 500 })
    }

    const variantsResult = await query<GeneratedVariant>(
      'SELECT * FROM generated_variants WHERE raw_post_id = $1 ORDER BY variant_number',
      [postId]
    )

    return NextResponse.json({ success: true, variants: variantsResult.rows })
  } catch (error: any) {
    console.error(`[API Генерация] КРИТИЧЕСКАЯ ОШИБКА:`, error.message)
    return NextResponse.json({ error: 'Failed to generate variants' }, { status: 500 })
  }
}

function handleSSE(postId: number) {
  const encoder = new TextEncoder()
  
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        send('progress', { stage: 'Начинаю генерацию...' })

        const success = await generateVariantsForPost(postId, (stage: string) => {
          send('progress', { stage })
        })

        if (!success) {
          send('error', { message: 'Failed to generate variants' })
          controller.close()
          return
        }

        const variantsResult = await query<GeneratedVariant>(
          'SELECT * FROM generated_variants WHERE raw_post_id = $1 ORDER BY variant_number',
          [postId]
        )

        send('complete', { variants: variantsResult.rows })
      } catch (error: any) {
        send('error', { message: error.message })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}
