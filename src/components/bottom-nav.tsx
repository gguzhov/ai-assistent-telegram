"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutList, Calendar, Rss, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  active: 'queue' | 'plan' | 'sources' | 'settings'
}

export function BottomNav({ active }: BottomNavProps) {
  const pathname = usePathname()

  const items = [
    { id: 'queue', label: 'Очередь', icon: LayoutList, href: '/queue' },
    { id: 'plan', label: 'План', icon: Calendar, href: '/plan' },
    { id: 'sources', label: 'Источники', icon: Rss, href: '/sources' },
    { id: 'settings', label: 'Настройки', icon: Settings, href: '/settings' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t safe-area-bottom z-50 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
      <div className="flex justify-around py-2">
        {items.map(item => {
          const Icon = item.icon
          const isActive = active === item.id

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-4 rounded-lg transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn(
                "w-5 h-5",
                isActive && "fill-primary/20"
              )} />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
