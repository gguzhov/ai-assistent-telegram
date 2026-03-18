import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(id => id.trim())
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''
const SKIP_AUTH = process.env.SKIP_TELEGRAM_AUTH === 'true'

function validateInitData(initData: string): { valid: boolean; userId?: number } {
  try {
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')
    
    if (!hash) {
      return { valid: false }
    }

    urlParams.delete('hash')
    const dataCheckArr: string[] = []
    urlParams.sort()
    urlParams.forEach((val, key) => dataCheckArr.push(`${key}=${val}`))
    const dataCheckString = dataCheckArr.join('\n')

    const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest()
    const calculatedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (calculatedHash !== hash) {
      return { valid: false }
    }

    const user = urlParams.get('user')
    if (user) {
      const userData = JSON.parse(user)
      return { valid: true, userId: userData.id }
    }

    return { valid: false }
  } catch (error) {
    console.error('Error validating initData:', error)
    return { valid: false }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Dev mode: skip auth and return mock user
    if (SKIP_AUTH) {
      console.log('[Auth] SKIP_TELEGRAM_AUTH enabled, using mock user ID=1')
      return NextResponse.json({ 
        authorized: true,
        userId: 1 
      })
    }

    const { initData } = await request.json()

    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    if (!BOT_TOKEN) {
      console.error('TELEGRAM_BOT_TOKEN not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const validation = validateInitData(initData)

    if (!validation.valid) {
      return NextResponse.json({ error: 'Invalid initData' }, { status: 401 })
    }

    const userId = validation.userId?.toString()
    
    if (!userId || !ADMIN_IDS.includes(userId)) {
      return NextResponse.json({ 
        error: 'Access denied',
        authorized: false 
      }, { status: 403 })
    }

    return NextResponse.json({ 
      authorized: true,
      userId: validation.userId 
    })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
