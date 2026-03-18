"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { 
    Check, X, RefreshCw, Edit3, Sparkles, ChevronLeft, ChevronRight,
    ExternalLink, Loader2, Image as ImageIcon, Eye, Plus, Clock, Calendar
  } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BottomNav } from '@/components/bottom-nav'

// Hook for keyboard-aware scrolling
function useKeyboardScroll(ref: React.RefObject<HTMLElement | null>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return

    const handleResize = () => {
      if (ref.current && document.activeElement === ref.current) {
        setTimeout(() => {
          ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }

    const visualViewport = window.visualViewport
    if (visualViewport) {
      visualViewport.addEventListener('resize', handleResize)
      return () => visualViewport.removeEventListener('resize', handleResize)
    }
  }, [ref, isActive])
}

interface Variant {
  id: number
  variant_number: number
  generated_text: string
  generated_image_url: string | null
  title_for_cover: string | null
}

  interface Post {
    id: number
    external_id: string
    original_text: string
    original_image_url: string | null
    views: number
    reactions: number
    comments: number
    forwards: number
    arr_score: number
    err_score: number
    status: string
    parsed_at: string
    original_date: string | null
    source: {
      channel_id: string
      channel_name: string
      url: string
    }
    variants: Variant[]
    needsGeneration?: boolean
  }

  const getDisplayImageUrl = (url: string | null): string | null => {
    if (!url) return null
    if (url.startsWith('data:image') || url.startsWith('http')) return url

    const [path, query] = url.split('?')
    if (path.startsWith('/covers/')) {
      const filename = path.replace('/covers/', '')
      return `/api/covers/${filename}${query ? `?${query}` : ''}`
    }

    return url
  }

  const normalizeVariantNumber = (value: number | string): number => Number(value)


export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [grouped, setGrouped] = useState<Record<string, Post[]>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedTextVariant, setSelectedTextVariant] = useState(1)
  const [selectedImageVariant, setSelectedImageVariant] = useState(1)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
    const [editMode, setEditMode] = useState(false)
    const [editedText, setEditedText] = useState('')
    const [sourceUrl, setSourceUrl] = useState('')
    const [sourceAnchor, setSourceAnchor] = useState('Источник')
    const [upgradeMode, setUpgradeMode] = useState(false)

  const [upgradeFeedback, setUpgradeFeedback] = useState('')
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState('')
  const [generatingCover, setGeneratingCover] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
    const [viewMode, setViewMode] = useState<'all' | 'grouped'>('all')
    const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
    const [showTimeModal, setShowTimeModal] = useState(false)
    const [manualDate, setManualDate] = useState('')
    const [manualTime, setManualTime] = useState('12:00')
    const [slotsMessage, setSlotsMessage] = useState('')
    const textareaRef = useRef<HTMLTextAreaElement>(null)
  const upgradeTextareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Use keyboard scroll hook
  useKeyboardScroll(textareaRef, editMode)
  useKeyboardScroll(upgradeTextareaRef, upgradeMode)

  useEffect(() => {
    if (editMode && textareaRef.current) {
      textareaRef.current.focus()
      setTimeout(() => {
        textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [editMode])

  useEffect(() => {
    if (upgradeMode && upgradeTextareaRef.current) {
      upgradeTextareaRef.current.focus()
      setTimeout(() => {
        upgradeTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [upgradeMode])

  const displayPosts = viewMode === 'grouped' && selectedChannel 
    ? grouped[selectedChannel] || [] 
    : posts
  const currentPost = displayPosts[currentIndex]

  const currentImageVariant = currentPost?.variants?.find(v => 
    normalizeVariantNumber(v.variant_number) === selectedImageVariant && 
    v.generated_image_url
  )

  const currentTextVariant = currentPost?.variants?.find(v => 
    normalizeVariantNumber(v.variant_number) === selectedTextVariant
  )

  const allImageVariants = currentPost?.variants?.filter(v => v.generated_image_url) || []

  // Sync editedText when post or text variant changes
  useEffect(() => {
    if (currentTextVariant?.generated_text) {
      setEditedText(currentTextVariant.generated_text)
    } else {
      setEditedText('')
    }
  }, [currentPost?.id, selectedTextVariant, currentTextVariant?.generated_text])

  // Reset source fields when switching posts
  useEffect(() => {
    setSourceUrl('')
    setSourceAnchor('Источник')
    setEditMode(false)
    setUpgradeMode(false)
    setUpgradeFeedback('')
  }, [currentPost?.id])

  useEffect(() => {
    fetchQueue()
  }, [])

  useEffect(() => {
    if (!currentPost) return
    const hasSelected = allImageVariants.some(
      v => normalizeVariantNumber(v.variant_number) === selectedImageVariant
    )
    if (!hasSelected) {
      const firstImg = allImageVariants[0]
      if (firstImg) {
        setSelectedImageVariant(normalizeVariantNumber(firstImg.variant_number))
      }
    }
  }, [currentPost?.id, allImageVariants.length, selectedImageVariant])

  const fetchQueue = async () => {

    try {
      const res = await fetch('/api/posts/queue?groupBy=channel')
      const data = await res.json()
      setPosts(data.posts || [])
      setGrouped(data.grouped || {})
    } catch (error) {
      console.error('Failed to fetch queue:', error)
    } finally {
      setLoading(false)
    }
  }

  const updatePostInState = (postId: number, updater: (post: Post) => Post) => {
    setPosts(prev => prev.map(post => (post.id === postId ? updater(post) : post)))
    setGrouped(prev => {
      const updated = { ...prev }
      for (const key of Object.keys(updated)) {
        updated[key] = updated[key].map(post => (post.id === postId ? updater(post) : post))
      }
      return updated
    })
  }

  const handleGenerate = async () => {
    if (!currentPost || generating) return
    setGenerating(true)
    setGenerationStatus('Начинаю генерацию...')

    try {
      const res = await fetch(`/api/posts/${currentPost.id}/generate`, {
        method: 'POST',
        headers: { 'Accept': 'text/event-stream' }
      })

      if (res.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            let eventType = ''
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                eventType = line.slice(7)
              } else if (line.startsWith('data: ')) {
                const data = JSON.parse(line.slice(6))
                if (eventType === 'progress') {
                  setGenerationStatus(data.stage)
                } else if (eventType === 'complete' && data.variants) {
                  const variantsWithCache = data.variants.map((v: Variant) => ({
                    ...v,
                    generated_image_url: v.generated_image_url
                      ? `${v.generated_image_url}?t=${Date.now()}`
                      : null
                  }))
                  updatePostInState(currentPost.id, post => ({
                    ...post,
                    variants: variantsWithCache,
                    needsGeneration: false,
                    status: 'ready'
                  }))
                  setSelectedTextVariant(1)
                  const firstImg = variantsWithCache.find((v: Variant) => v.generated_image_url)
                  if (firstImg) {
                    setSelectedImageVariant(normalizeVariantNumber(firstImg.variant_number))
                  }
                } else if (eventType === 'error') {
                  console.error('Generation error:', data.message)
                }
              }
            }
          }
        }
      } else {
        // Fallback to JSON
        const data = await res.json()
        if (data.variants) {
          const variantsWithCache = data.variants.map((v: Variant) => ({
            ...v,
            generated_image_url: v.generated_image_url
              ? `${v.generated_image_url}?t=${Date.now()}`
              : null
          }))
          updatePostInState(currentPost.id, post => ({
            ...post,
            variants: variantsWithCache,
            needsGeneration: false,
            status: 'ready'
          }))
          setSelectedTextVariant(1)
          const firstImg = variantsWithCache.find((v: Variant) => v.generated_image_url)
          if (firstImg) {
            setSelectedImageVariant(normalizeVariantNumber(firstImg.variant_number))
          }
        }
      }

      hapticFeedback('success')
    } catch (error) {
      console.error('Failed to generate:', error)
    } finally {
      setGenerating(false)
      setGenerationStatus('')
    }
  }

  const handleGenerateMoreCovers = async () => {
    console.log('[Queue] handleGenerateMoreCovers called')
    
    if (!currentPost) {
      console.warn('[Queue] currentPost is null, cannot generate cover')
      alert('Ошибка: пост не выбран')
      return
    }
    if (generatingCover) {
      console.warn('[Queue] Generation already in progress')
      return
    }
    
    console.log(`[Queue] Starting cover generation for post ${currentPost.id}`)
    setGeneratingCover(true)

    try {
      // Extract title from first line of edited text
      const firstLine = editedText.trim().split('\n')[0]?.trim() || ''
      const titleForCover = firstLine.length > 0 && firstLine.length <= 90 
        ? firstLine 
        : currentTextVariant?.title_for_cover || null
      const payload = {
        variantNumber: selectedTextVariant,
        title: titleForCover
      }
      console.log('[Queue] Payload:', JSON.stringify(payload))

      const url = `/api/posts/${currentPost.id}/generate-cover`
      console.log('[Queue] Fetching URL:', url)

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      console.log('[Queue] Response status:', res.status)
      
      const text = await res.text()
      console.log('[Queue] Raw response:', text)
      
      let data
      try {
        data = JSON.parse(text)
      } catch (e) {
        console.error('[Queue] Failed to parse JSON:', e)
        alert('Ошибка парсинга ответа сервера')
        return
      }
        
        console.log('[Queue] Parsed data:', data)

        if (data.error) {
          console.error('[Queue] Server error:', data.error)
          alert('Ошибка сервера: ' + data.error)
          hapticFeedback('warning')
          return
        }

        if (data.imageUrl) {


          console.log('[Queue] Success! New image URL:', data.imageUrl)
          // Добавляем timestamp для предотвращения кэширования
          const imageUrlWithCache = data.imageUrl.includes('?') 
            ? `${data.imageUrl}&t=${Date.now()}` 
            : `${data.imageUrl}?t=${Date.now()}`

          const newVariantNumber = data.variantNumber || (Math.max(...currentPost.variants.map(v => v.variant_number), 0) + 1)
          const newVariant: Variant = {
            id: Date.now(),
            variant_number: newVariantNumber,
            generated_text: currentTextVariant?.generated_text || '',
            generated_image_url: imageUrlWithCache,
            title_for_cover: currentTextVariant?.title_for_cover || null
          }

          updatePostInState(currentPost.id, post => {
            const filteredVariants = post.variants.filter(v => v.variant_number !== newVariantNumber)
            return { 
              ...post, 
              variants: [...filteredVariants, newVariant].sort((a, b) => a.variant_number - b.variant_number)
            }
          })

            setSelectedImageVariant(normalizeVariantNumber(newVariantNumber))
            hapticFeedback('success')
        } else {
          console.error('[Queue] No imageUrl in response:', data)
          alert('Сервер не вернул URL изображения')
          hapticFeedback('warning')
        }

    } catch (error: any) {
      console.error('[Queue] Fetch error:', error)
      alert('Ошибка сети: ' + error.message)
      hapticFeedback('warning')
    } finally {
      setGeneratingCover(false)
    }
  }

  const getFirstImageVariantNumber = (post: Post | undefined): number => {
    if (!post) return 1
    const firstWithImage = post.variants.find(v => v.generated_image_url)
    return firstWithImage?.variant_number || 1
  }

  const goToPrev = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1
      const newPost = displayPosts[newIndex]
      setCurrentIndex(newIndex)
      setSelectedTextVariant(1)
      setSelectedImageVariant(getFirstImageVariantNumber(newPost))
      setShowOriginal(false)
    }
  }

  const goToNext = () => {
    if (currentIndex < displayPosts.length - 1) {
      const newIndex = currentIndex + 1
      const newPost = displayPosts[newIndex]
      setCurrentIndex(newIndex)
      setSelectedTextVariant(1)
      setSelectedImageVariant(getFirstImageVariantNumber(newPost))
      setShowOriginal(false)
    }
  }

  const handleApprove = useCallback(async (manualScheduledAt?: string) => {
      if (!currentPost || processing) return
      setProcessing(true)

      try {
        const res = await fetch(`/api/posts/${currentPost.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textVariant: selectedTextVariant,
            imageVariant: selectedImageVariant,
            finalText: editedText,
            sourceUrl,
            sourceAnchor,
            scheduledAt: manualScheduledAt || undefined
          })
        })

        const data = await res.json()

        // If server says slots are full, show manual time modal
        if (data.needsManualTime) {
          setSlotsMessage(data.message || 'Все слоты заняты. Укажите время вручную.')
          const today = new Date().toISOString().split('T')[0]
          setManualDate(today)
          setManualTime('12:00')
          setShowTimeModal(true)
          setProcessing(false)
          return
        }

        setSwipeDirection('right')
        hapticFeedback('success')
        
        setTimeout(() => {
          const postId = currentPost.id
          setPosts(prev => prev.filter(p => p.id !== postId))
          setGrouped(prev => {
            const updated = { ...prev }
            for (const key of Object.keys(updated)) {
              updated[key] = updated[key].filter(p => p.id !== postId)
            }
            return updated
          })
            setSwipeDirection(null)
            setSelectedTextVariant(1)
            if (currentIndex >= displayPosts.length - 1) {

            setCurrentIndex(Math.max(0, currentIndex - 1))
          }
        }, 400)
      } catch (error) {
        console.error('Failed to approve:', error)
        setSwipeDirection(null)
      } finally {
        setProcessing(false)
      }
    }, [currentPost, currentIndex, displayPosts.length, selectedTextVariant, selectedImageVariant, editedText, processing])

    const handleManualTimeApprove = useCallback(() => {
      if (!manualDate || !manualTime) return
      const scheduledAt = new Date(`${manualDate}T${manualTime}:00`).toISOString()
      setShowTimeModal(false)
      handleApprove(scheduledAt)
    }, [manualDate, manualTime, handleApprove])

  const handleReject = useCallback(async () => {
    if (!currentPost || processing) return
    setProcessing(true)
    setSwipeDirection('left')

    try {
      await fetch(`/api/posts/${currentPost.id}/reject`, {
        method: 'POST'
      })

      hapticFeedback('warning')
      
      setTimeout(() => {
        const postId = currentPost.id
        setPosts(prev => prev.filter(p => p.id !== postId))
        setGrouped(prev => {
          const updated = { ...prev }
          for (const key of Object.keys(updated)) {
            updated[key] = updated[key].filter(p => p.id !== postId)
          }
          return updated
        })
          setSwipeDirection(null)
          setSelectedTextVariant(1)
          if (currentIndex >= displayPosts.length - 1) {

          setCurrentIndex(Math.max(0, currentIndex - 1))
        }
      }, 400)
    } catch (error) {
      console.error('Failed to reject:', error)
      setSwipeDirection(null)
    } finally {
      setProcessing(false)
    }
  }, [currentPost, currentIndex, displayPosts.length, processing])

  const handleRegenerate = async () => {
    if (!currentPost || processing) return
    setProcessing(true)

    try {
      const res = await fetch(`/api/posts/${currentPost.id}/regenerate`, {
        method: 'POST'
      })
      const data = await res.json()
      
      if (data.variants) {
        setPosts(prev => prev.map((p, i) => 
          i === currentIndex ? { ...p, variants: data.variants } : p
        ))
        setSelectedTextVariant(1)
        setSelectedImageVariant(1)
      }
      
      hapticFeedback('medium')
    } catch (error) {
      console.error('Failed to regenerate:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleUpgrade = async () => {
    if (!currentPost || !upgradeFeedback || processing) return
    setProcessing(true)

    try {
      const res = await fetch(`/api/posts/${currentPost.id}/upgrade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: editedText,
          feedback: upgradeFeedback,
          variantNumber: selectedTextVariant
        })
      })
      const data = await res.json()
      
      if (data.improvedText) {
        setEditedText(data.improvedText)
        setPosts(prev => prev.map((p, i) => {
          if (i !== currentIndex) return p
          return {
            ...p,
            variants: p.variants.map(v => 
              v.variant_number === selectedTextVariant 
                ? { ...v, generated_text: data.improvedText }
                : v
            )
          }
        }))
      }
      
      setUpgradeMode(false)
      setUpgradeFeedback('')
      hapticFeedback('success')
    } catch (error) {
      console.error('Failed to upgrade:', error)
    } finally {
      setProcessing(false)
    }
  }

  const handleDrag = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 100) {
      if (info.offset.x > 0) {
        handleApprove()
      } else {
        handleReject()
      }
    }
  }

  const hapticFeedback = (type: 'light' | 'medium' | 'success' | 'warning') => {
    const tg = (window as Window & { Telegram?: { WebApp?: { HapticFeedback?: { impactOccurred: (s: string) => void; notificationOccurred: (s: string) => void } } } }).Telegram?.WebApp?.HapticFeedback
    if (tg) {
      if (type === 'success' || type === 'warning') {
        tg.notificationOccurred(type)
      } else {
        tg.impactOccurred(type)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-muted flex items-center justify-center">
              <Check className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Очередь пуста</h2>
            <p className="text-muted-foreground">
              Все посты обработаны. Новые появятся после парсинга.
            </p>
          </div>
        </div>
          <BottomNav active="queue" />
        </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b px-4 py-2">
        <div className="flex items-center justify-between mb-2">
          <button 
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="p-2 rounded-full hover:bg-secondary disabled:opacity-30"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">
            {currentIndex + 1} / {displayPosts.length}
          </h1>
          <button 
            onClick={goToNext}
            disabled={currentIndex >= displayPosts.length - 1}
            className="p-2 rounded-full hover:bg-secondary disabled:opacity-30"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => { setViewMode('all'); setSelectedChannel(null); setCurrentIndex(0) }}
            className={cn(
              "px-3 py-1 text-xs rounded-full whitespace-nowrap",
              viewMode === 'all' ? "bg-primary text-primary-foreground" : "bg-secondary"
            )}
          >
            Все ({posts.length})
          </button>
          {Object.entries(grouped).map(([channel, channelPosts]) => (
            <button
              key={channel}
              onClick={() => { setViewMode('grouped'); setSelectedChannel(channel); setCurrentIndex(0) }}
              className={cn(
                "px-3 py-1 text-xs rounded-full whitespace-nowrap",
                viewMode === 'grouped' && selectedChannel === channel 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary"
              )}
            >
              {channel} ({channelPosts.length})
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 p-4 pb-48 overflow-y-auto">
        <AnimatePresence mode="wait">
          {currentPost && (
            <motion.div
              key={currentPost.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ 
                opacity: swipeDirection ? 0 : 1, 
                scale: 1,
                x: swipeDirection === 'left' ? -300 : swipeDirection === 'right' ? 300 : 0,
                rotate: swipeDirection === 'left' ? -20 : swipeDirection === 'right' ? 20 : 0
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleDrag}
              className="swipe-card relative z-10"
            >
                  <div className="bg-card rounded-2xl overflow-hidden card-shadow border border-border/50">
                    {currentImageVariant?.generated_image_url && (
                      <div className="relative aspect-square bg-muted">
                        <img 
                          key={`main-image-${selectedImageVariant}-${currentImageVariant?.id}`}
                          src={getDisplayImageUrl(currentImageVariant.generated_image_url) || ''} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4 space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <a 
                                href={`https://t.me/${currentPost.source.channel_id.replace('@', '')}/${currentPost.external_id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-primary hover:underline flex items-center gap-1 transition-colors"
                              >
                                {currentPost.source.channel_name}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Eye className="w-3 h-3 shrink-0" />
                                <span>{currentPost.views.toLocaleString('ru-RU')} просмотров</span>
                                {currentPost.err_score != null && currentPost.err_score > 0 && (
                                  <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full ml-1">
                                    ER {Number(currentPost.err_score).toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            {currentPost.reactions > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span>👍</span>
                                <span>{currentPost.reactions} реакций</span>
                              </div>
                            )}
                            {currentPost.comments > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span>💬</span>
                                <span>{currentPost.comments} комментариев</span>
                              </div>
                            )}
                            {currentPost.forwards > 0 && (
                              <div className="flex items-center gap-1.5">
                                <span>↗</span>
                                <span>{currentPost.forwards} репостов</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {currentPost.original_date 
                                  ? new Date(currentPost.original_date).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                                  : '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                Спаршен {new Date(currentPost.parsed_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        </div>

                  {currentPost.needsGeneration || currentPost.variants.length === 0 ? (
                    <div className="space-y-4">
                      {showOriginal ? (
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-medium text-primary">Оригинал поста</span>
                            <button
                              onClick={() => setShowOriginal(false)}
                              className="text-xs text-muted-foreground"
                            >
                              Свернуть
                            </button>
                          </div>
                            <div 
                              className="text-sm whitespace-pre-wrap max-h-[250px] overflow-y-auto bg-secondary/50 p-3 rounded-lg touch-pan-y"
                              style={{ 
                                WebkitOverflowScrolling: 'touch',
                                overscrollBehavior: 'contain'
                              }}
                            >
                              {currentPost.original_text}
                            </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowOriginal(true)}
                          className="w-full py-2 bg-secondary text-secondary-foreground rounded-lg flex items-center justify-center gap-2 text-sm"
                        >
                          <Eye className="w-4 h-4" />
                          Подробнее (посмотреть оригинал)
                        </button>
                      )}
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="w-full py-3 bg-primary text-primary-foreground rounded-lg flex items-center justify-center gap-2"
                        >
                          {generating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              {generationStatus || 'Генерация...'}
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Сгенерировать варианты
                            </>
                          )}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1">
                        {[1, 2, 3].map(num => (
                          <button
                            key={num}
                            onClick={() => setSelectedTextVariant(num)}
                            className={cn(
                              "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
                              selectedTextVariant === num
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground"
                            )}
                          >
                            Текст {num}
                          </button>
                        ))}
                      </div>

                          <div className="space-y-3">
                            <textarea
                              ref={textareaRef}
                              value={editedText}
                              onChange={(e) => setEditedText(e.target.value)}
                              onFocus={(e) => {
                                setEditMode(true)
                                setTimeout(() => {
                                  e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }, 300)
                              }}
                              onBlur={() => setEditMode(false)}
                              className={cn(
                                "w-full min-h-[150px] max-h-[350px] p-3 text-sm rounded-lg resize-none overflow-y-auto touch-pan-y transition-colors",
                                editMode 
                                  ? "bg-secondary focus:outline-none focus:ring-2 focus:ring-primary" 
                                  : "bg-secondary/30 cursor-text"
                              )}
                              style={{ 
                                WebkitOverflowScrolling: 'touch',
                                overscrollBehavior: 'contain'
                              }}
                              placeholder="Текст поста..."
                            />
                            {editMode && (
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">URL источника</label>
                                  <input
                                    type="text"
                                    value={sourceUrl}
                                    onChange={(e) => setSourceUrl(e.target.value)}
                                    className="w-full p-2 text-xs bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="https://..."
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Текст ссылки</label>
                                  <input
                                    type="text"
                                    value={sourceAnchor}
                                    onChange={(e) => setSourceAnchor(e.target.value)}
                                    className="w-full p-2 text-xs bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="Источник"
                                  />
                                </div>
                              </div>
                            )}
                            {!editMode && sourceUrl && (
                              <div className="text-xs text-primary flex items-center gap-1">
                                <ExternalLink className="w-3 h-3" />
                                {sourceAnchor || 'Источник'}: {sourceUrl}
                              </div>
                            )}
                          </div>


                      {upgradeMode && (
                        <div className="space-y-2 pb-4">
                          <textarea
                            ref={upgradeTextareaRef}
                            value={upgradeFeedback}
                            onChange={(e) => setUpgradeFeedback(e.target.value)}
                            onFocus={(e) => {
                              setTimeout(() => {
                                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                              }, 300)
                            }}
                            placeholder="Опишите, что нужно изменить..."
                            className="w-full h-28 p-3 pb-6 text-sm bg-secondary rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary overflow-y-auto touch-pan-y"
                            style={{ 
                              WebkitOverflowScrolling: 'touch',
                              overscrollBehavior: 'contain'
                            }}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setUpgradeMode(false); setUpgradeFeedback('') }}
                              className="flex-1 py-2 text-sm bg-secondary rounded-lg"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={handleUpgrade}
                              disabled={!upgradeFeedback || processing}
                              className="flex-1 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
                            >
                              {processing ? <Loader2 className="w-4 h-4 mx-auto animate-spin" /> : 'Применить'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                          <button
                          onClick={() => setUpgradeMode(true)}
                          disabled={upgradeMode}
                          className="flex-1 py-2 text-sm bg-secondary rounded-lg flex items-center justify-center gap-1"
                        >
                          <Sparkles className="w-4 h-4" />
                          Upgrade
                        </button>
                        <button
                          onClick={handleRegenerate}
                          disabled={processing}
                          className="flex-1 py-2 text-sm bg-secondary rounded-lg flex items-center justify-center gap-1"
                        >
                          {processing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Regen
                        </button>
                      </div>

                      {currentPost.variants.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Обложки</span>
                            <button
                              onClick={handleGenerateMoreCovers}
                              disabled={generatingCover}
                              className="flex items-center gap-1 text-xs text-primary"
                            >
                              {generatingCover ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Plus className="w-3 h-3" />
                              )}
                              {allImageVariants.length > 0 ? 'Ещё обложку' : 'Сгенерировать обложку'}
                            </button>
                          </div>
                          
                          {allImageVariants.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {allImageVariants.map((v) => (
                                  <button
                                    key={v.variant_number}
                                    onClick={() => setSelectedImageVariant(normalizeVariantNumber(v.variant_number))}
                                  className={cn(
                                    "w-12 h-12 rounded-lg overflow-hidden border-2 transition-colors",
                                    selectedImageVariant === normalizeVariantNumber(v.variant_number)
                                      ? "border-primary"
                                      : "border-transparent"
                                  )}
                                >
                                    <img 
                                      src={getDisplayImageUrl(v.generated_image_url) || ''} 
                                      alt={`Cover ${v.variant_number}`}
                                      className="w-full h-full object-cover"
                                    />

                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-[72px] left-0 right-0 px-4 py-6 bg-gradient-to-t from-background via-background/90 to-transparent pointer-events-none z-50">
        <div className="flex justify-center gap-8 pointer-events-auto">
          <button
            onClick={handleReject}
            disabled={processing}
            className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shadow-xl border border-destructive/20 backdrop-blur-md active:scale-90 transition-all disabled:opacity-50"
          >
            <X className="w-8 h-8" />
          </button>
          <button
            onClick={() => handleApprove()}
            disabled={processing}
            className="w-16 h-16 rounded-full bg-green-500/10 text-green-500 flex items-center justify-center shadow-xl border border-green-500/20 backdrop-blur-md active:scale-90 transition-all disabled:opacity-50"
          >
            <Check className="w-8 h-8" />
          </button>
        </div>
      </div>

      {/* Manual Time Modal */}
      {showTimeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-sm space-y-4 border shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="font-semibold">Слоты заняты</h3>
                <p className="text-xs text-muted-foreground">{slotsMessage}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Дата</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full p-3 bg-background border rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Время</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="w-full p-3 bg-background border rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTimeModal(false)}
                className="flex-1 py-3 text-sm bg-secondary rounded-xl"
              >
                Отмена
              </button>
              <button
                onClick={handleManualTimeApprove}
                disabled={!manualDate || !manualTime}
                className="flex-1 py-3 text-sm bg-primary text-primary-foreground rounded-xl disabled:opacity-50"
              >
                Запланировать
              </button>
            </div>
          </div>
        </div>
      )}

        <BottomNav active="queue" />
      </div>
    )
  }
