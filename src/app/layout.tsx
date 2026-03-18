import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

export const metadata: Metadata = {
  title: 'Telegram Automation',
  description: 'Система автоматизации Telegram-канала',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body className="telegram-theme min-h-screen" suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
