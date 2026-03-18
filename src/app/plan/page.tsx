"use client"

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Calendar, Clock, Trash2, Edit3, ChevronDown, ChevronUp, Loader2, Send, Eye
} from 'lucide-react'
import { format, parseISO, isToday, isTomorrow } from 'date-fns'
import { ru } from 'date-fns/locale'
import { BottomNav } from '@/components/bottom-nav'
import { cn } from '@/lib/utils'

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
  raw_post_id: number
  variant_number: number
  generated_text: string
  generated_image_url: string | null
  title_for_cover: string | null
}

  interface ScheduledPost {
    id: number
    raw_post_id: number
    final_text: string
    final_image_url: string | null
    scheduled_at: string
    source_channel_name: string
    source_url?: string | null
    source_anchor?: string | null
    views: number
    reactions: number
    selected_text_variant: number
    selected_image_variant: number
    variants: Variant[]
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


export default function PlanPage() {
  const [plan, setPlan] = useState<Record<string, ScheduledPost[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [editingPost, setEditingPost] = useState<number | null>(null)
  const [editedText, setEditedText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceAnchor, setSourceAnchor] = useState('')
  const [reschedulingPost, setReschedulingPost] = useState<number | null>(null)
  const [selectedTextVariant, setSelectedTextVariant] = useState<Record<number, number>>({})
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('12:00')
  const [publishingPost, setPublishingPost] = useState<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Use keyboard scroll hook
  useKeyboardScroll(textareaRef, editingPost !== null)

  useEffect(() => {
    fetchPlan()
  }, [])

  useEffect(() => {
    if (editingPost && textareaRef.current) {
      textareaRef.current.focus()
      setTimeout(() => {
        textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
    }
  }, [editingPost])

  const fetchPlan = async () => {
    try {
      const res = await fetch('/api/plan')
      const data = await res.json()
      setPlan(data.plan || {})
      
      const dates = Object.keys(data.plan || {}).sort()
      if (dates.length > 0) {
        setExpandedDate(dates[0])
      }
      
      // Initialize selected text variants
      const initialVariants: Record<number, number> = {}
      const allPosts = Object.values(data.plan || {}).flat() as ScheduledPost[]
      allPosts.forEach((post) => {
        initialVariants[post.id] = post.selected_text_variant || 1
      })
      setSelectedTextVariant(initialVariants)
    } catch (error) {
      console.error('Failed to fetch plan:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePost = async (postId: number) => {
    try {
      await fetch(`/api/plan/${postId}`, { method: 'DELETE' })
      fetchPlan()
    } catch (error) {
      console.error('Failed to delete post:', error)
    }
  }

  const handleUpdatePost = async (postId: number) => {
    if (!editedText) return

    try {
      await fetch(`/api/plan/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          finalText: editedText,
          sourceUrl,
          sourceAnchor,
          textVariant: selectedTextVariant[postId]
        })
      })
      setEditingPost(null)
      fetchPlan()
    } catch (error) {
      console.error('Failed to update post:', error)
    }
  }

  const handleSelectTextVariant = (postId: number, variantNum: number, post: ScheduledPost) => {
    setSelectedTextVariant(prev => ({ ...prev, [postId]: variantNum }))
    const variant = post.variants.find(v => v.variant_number === variantNum)
    if (variant) {
      setEditedText(variant.generated_text)
    }
  }

  const handleReschedule = async (postId: number) => {
    if (!newDate || !newTime) return

    const scheduledAt = new Date(`${newDate}T${newTime}:00`)

    try {
      await fetch(`/api/plan/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: scheduledAt.toISOString() })
      })
      setReschedulingPost(null)
      setNewDate('')
      fetchPlan()
    } catch (error) {
      console.error('Failed to reschedule:', error)
    }
  }

  const handlePublishNow = async (postId: number) => {
    if (publishingPost) return
    
    setPublishingPost(postId)
    try {
      const res = await fetch(`/api/plan/${postId}/publish`, { method: 'POST' })
      const data = await res.json()
      
      if (data.success) {
        fetchPlan()
      } else {
        alert(data.error || 'Ошибка публикации')
      }
    } catch (error) {
      console.error('Failed to publish:', error)
      alert('Ошибка публикации')
    } finally {
      setPublishingPost(null)
    }
  }

  const formatDateHeader = (dateStr: string) => {
    const date = parseISO(dateStr)
    if (isToday(date)) return 'Сегодня'
    if (isTomorrow(date)) return 'Завтра'
    return format(date, 'd MMMM', { locale: ru })
  }

  const getLeadText = (text: string) => {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length > 1) {
      return lines[1].substring(0, 120) + (lines[1].length > 120 ? '...' : '')
    }
    return text.substring(0, 120) + (text.length > 120 ? '...' : '')
  }

  const getTitle = (post: ScheduledPost) => {
    const selectedVariant = post.variants.find(v => v.variant_number === (selectedTextVariant[post.id] || post.selected_text_variant))
    if (selectedVariant?.title_for_cover) {
      return selectedVariant.title_for_cover
    }
    const lines = post.final_text.split('\n').filter(l => l.trim())
    return lines[0]?.substring(0, 60) || 'Без заголовка'
  }

  const getCurrentText = (post: ScheduledPost) => {
    const varNum = selectedTextVariant[post.id] || post.selected_text_variant || 1
    const variant = post.variants.find(v => v.variant_number === varNum)
    return variant?.generated_text || post.final_text
  }

  const sortedDates = Object.keys(plan).sort()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-lg border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Контент-план</h1>
          <span className="text-sm text-muted-foreground">
            {Object.values(plan).flat().length} постов
          </span>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {sortedDates.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">План публикаций пуст</p>
          </div>
        ) : (
          sortedDates.map(date => (
            <div key={date} className="bg-card rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedDate(expandedDate === date ? null : date)}
                className="w-full px-4 py-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{formatDateHeader(date)}</div>
                    <div className="text-xs text-muted-foreground">
                      {plan[date].length} {plan[date].length === 1 ? 'пост' : 'постов'}
                    </div>
                  </div>
                </div>
                {expandedDate === date ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              <AnimatePresence>
                {expandedDate === date && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-4">
                      {plan[date].map(post => (
                        <div
                          key={post.id}
                          className="bg-secondary/50 rounded-xl overflow-hidden"
                        >
                          {/* Cover Image */}
                            {getDisplayImageUrl(post.final_image_url) && (
                              <div className="relative aspect-square bg-muted">
                                <img 
                                  src={getDisplayImageUrl(post.final_image_url) || ''} 
                                  alt="" 
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 rounded text-white text-xs flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {format(parseISO(post.scheduled_at), 'HH:mm')}
                                </div>
                              </div>
                            )}


                          <div className="p-3 space-y-3">
                            {/* Header with time if no image */}
                            {!post.final_image_url && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {format(parseISO(post.scheduled_at), 'HH:mm')}
                              </div>
                            )}

                            {/* Title */}
                            <h3 className="font-semibold text-sm line-clamp-2">
                              {getTitle(post)}
                            </h3>

                            {/* Lead text */}
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {getLeadText(getCurrentText(post))}
                            </p>

                            {/* Source and Views */}
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{post.source_channel_name}</span>
                              <span className="flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                {post.views?.toLocaleString() || 0} просмотров
                              </span>
                            </div>

                            {/* Text variant tabs */}
                            {post.variants.length > 0 && (
                              <div className="flex gap-1">
                                {[1, 2, 3].map(num => {
                                  const variant = post.variants.find(v => v.variant_number === num)
                                  if (!variant) return null
                                  return (
                                    <button
                                      key={num}
                                      onClick={() => handleSelectTextVariant(post.id, num, post)}
                                      className={cn(
                                        "flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors",
                                        (selectedTextVariant[post.id] || post.selected_text_variant) === num
                                          ? "bg-primary text-primary-foreground"
                                          : "bg-background text-secondary-foreground"
                                      )}
                                    >
                                      Текст {num}
                                    </button>
                                  )
                                })}
                              </div>
                            )}

                            {/* Edit mode */}
                            {editingPost === post.id ? (
                              <div className="space-y-2 pb-4">
                                <div className="relative">
                                  <textarea
                                    ref={textareaRef}
                                    value={editedText}
                                    onChange={(e) => setEditedText(e.target.value)}
                                    onFocus={(e) => {
                                      setTimeout(() => {
                                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      }, 300)
                                    }}
                                    className="w-full min-h-[150px] max-h-[350px] p-3 pb-8 text-sm bg-background rounded-lg resize-none overflow-y-auto touch-pan-y focus:outline-none focus:ring-2 focus:ring-primary"
                                    style={{ 
                                      WebkitOverflowScrolling: 'touch',
                                      overscrollBehavior: 'contain'
                                    }}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    value={sourceUrl}
                                    onChange={(e) => setSourceUrl(e.target.value)}
                                    className="px-2 py-1.5 text-xs bg-background rounded-lg border border-border/50"
                                    placeholder="URL источника"
                                  />
                                  <input
                                    type="text"
                                    value={sourceAnchor}
                                    onChange={(e) => setSourceAnchor(e.target.value)}
                                    className="px-2 py-1.5 text-xs bg-background rounded-lg border border-border/50"
                                    placeholder="Текст ссылки"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setEditingPost(null)}
                                    className="flex-1 py-1.5 text-sm bg-background rounded-lg"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    onClick={() => handleUpdatePost(post.id)}
                                    className="flex-1 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg"
                                  >
                                    Сохранить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* Full text preview - scrollable */}
                                <div 
                                  className="text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto bg-background/50 p-2 rounded-lg touch-pan-y"
                                  style={{ 
                                    WebkitOverflowScrolling: 'touch',
                                    overscrollBehavior: 'contain'
                                  }}
                                >
                                  {getCurrentText(post)}
                                </div>
                                {post.source_url && (
                                  <div className="text-[10px] text-primary truncate">
                                    {post.source_anchor || 'Источник'}: {post.source_url}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Reschedule mode */}
                            {reschedulingPost === post.id ? (
                              <div className="space-y-2 pt-2 border-t border-border/30">
                                <div className="flex gap-2">
                                  <input
                                    type="date"
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-sm bg-background rounded-lg"
                                  />
                                  <input
                                    type="time"
                                    value={newTime}
                                    onChange={(e) => setNewTime(e.target.value)}
                                    className="w-24 px-2 py-1.5 text-sm bg-background rounded-lg"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      setReschedulingPost(null)
                                      setNewDate('')
                                    }}
                                    className="flex-1 py-1.5 text-sm bg-background rounded-lg"
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    onClick={() => handleReschedule(post.id)}
                                    className="flex-1 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg"
                                  >
                                    Перенести
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setEditingPost(post.id)
                                    setEditedText(getCurrentText(post))
                                    setSourceUrl(post.source_url || '')
                                    setSourceAnchor(post.source_anchor || 'Источник')
                                  }}
                                  className="p-2 rounded-lg bg-background hover:bg-secondary"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeletePost(post.id)}
                                  className="p-2 rounded-lg bg-background hover:bg-destructive/10 text-destructive"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    const postDate = parseISO(post.scheduled_at)
                                    setReschedulingPost(post.id)
                                    setNewDate(format(postDate, 'yyyy-MM-dd'))
                                    setNewTime(format(postDate, 'HH:mm'))
                                  }}
                                  className="flex-1 py-1.5 text-xs bg-background rounded-lg flex items-center justify-center gap-1"
                                >
                                  <Clock className="w-3 h-3" />
                                  Изменить время
                                </button>
                                <button
                                  onClick={() => handlePublishNow(post.id)}
                                  disabled={publishingPost === post.id}
                                  className="flex-1 py-1.5 text-xs bg-green-600 text-white rounded-lg flex items-center justify-center gap-1 disabled:opacity-50"
                                >
                                  {publishingPost === post.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Send className="w-3 h-3" />
                                  )}
                                  Выложить
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      <BottomNav active="plan" />
    </div>
  )
}
