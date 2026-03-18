import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { channelId } = await request.json()
    
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 })
    }

    // Check if bot is admin in the channel
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(channelId)}&user_id=${botToken.split(':')[0]}`)
    const data = await res.json()

    if (!data.ok) {
      return NextResponse.json({ 
        valid: false, 
        error: data.description || 'Канал не найден или бот не добавлен' 
      })
    }

    const status = data.result?.status
    const isAdmin = status === 'administrator' || status === 'creator'

    // Get channel info
    const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(channelId)}`)
    const chatData = await chatRes.json()
    const chatTitle = chatData.ok ? chatData.result?.title : channelId

    return NextResponse.json({ 
      valid: true,
      isAdmin,
      status,
      channelTitle: chatTitle,
      message: isAdmin 
        ? `Бот является администратором в "${chatTitle}"` 
        : `Бот не является администратором в "${chatTitle}" (статус: ${status})`
    })
  } catch (error) {
    console.error('Channel check error:', error)
    return NextResponse.json({ error: 'Failed to check channel' }, { status: 500 })
  }
}
