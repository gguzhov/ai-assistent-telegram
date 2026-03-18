"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'error' | 'redirecting'>('loading')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const initAuth = async () => {
      if (typeof window === 'undefined') return

      const tg = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp
      const initData = tg?.initData || ''

      // Always try to verify with server first (handles both dev mode and real auth)
      try {
        const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        })

        const data = await response.json()

        if (response.ok && data.authorized) {
          // Success - either dev mode or real Telegram auth
          localStorage.setItem('tg_init_data', initData || 'dev_mode')
          if (tg) {
            tg.ready()
            tg.expand()
          }
          setStatus('redirecting')
          router.push('/queue')
          return
        }

        // Not authorized
        setStatus('error')
        setError(data.error || 'Доступ запрещён')
      } catch (err) {
        setStatus('error')
        setError('Ошибка подключения к серверу')
      }
    }

    initAuth()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
      <div className="text-center space-y-4 p-8">
        {status === 'loading' && (
          <>
            <div className="relative">
              <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full bg-primary/20 pulse-animation" />
            </div>
            <p className="text-muted-foreground">Авторизация...</p>
          </>
        )}

        {status === 'redirecting' && (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-muted-foreground">Добро пожаловать!</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
              <svg className="w-10 h-10 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-destructive font-medium">{error}</p>
          </>
        )}
      </div>
    </div>
  )
}

interface TelegramWebApp {
  ready: () => void
  expand: () => void
  close: () => void
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
    }
  }
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
  }
}
