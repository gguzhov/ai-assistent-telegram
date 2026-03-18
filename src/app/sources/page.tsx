"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, Trash2, Edit3, Radio, Circle, ExternalLink,
  Loader2, Search, MessageSquare, Play, CheckCircle2, AlertCircle, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BottomNav } from '@/components/bottom-nav'

interface Source {
  id: number
  channel_id: string
  channel_name: string
  url: string
  notes: string | null
  min_err: number
  is_active: boolean
  last_parsed_at: string | null
}

interface ParseResult {
  sourceId: number
  channelName: string
  processedCount: number
  error?: string
}

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newChannelId, setNewChannelId] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [editMinErr, setEditMinErr] = useState('')
  const [parsingId, setParsingId] = useState<number | null>(null)
  const [parsingAll, setParsingAll] = useState(false)
  const [parseResults, setParseResults] = useState<ParseResult[] | null>(null)
  const [singleParseResult, setSingleParseResult] = useState<ParseResult | null>(null)

  useEffect(() => {
    fetchSources()
  }, [])

  const fetchSources = async () => {
    try {
      const res = await fetch('/api/sources')
      const data = await res.json()
      setSources(data.sources || [])
    } catch (error) {
      console.error('Failed to fetch sources:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddSource = async () => {
    if (!newChannelId || adding) return
    setAdding(true)

    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: newChannelId, notes: newNotes })
      })
      
      if (res.ok) {
        setNewChannelId('')
        setNewNotes('')
        setShowAddForm(false)
        fetchSources()
      } else {
        const data = await res.json()
        alert(data.error || 'Ошибка добавления')
      }
    } catch (error) {
      console.error('Failed to add source:', error)
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteSource = async (id: number) => {
    if (!confirm('Удалить источник?')) return

    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' })
      fetchSources()
    } catch (error) {
      console.error('Failed to delete source:', error)
    }
  }

  const handleToggleActive = async (id: number, isActive: boolean) => {
    try {
      await fetch(`/api/sources/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      })
      fetchSources()
    } catch (error) {
      console.error('Failed to toggle source:', error)
    }
  }

    const handleUpdateNotes = async (id: number) => {
      try {
        await fetch(`/api/sources/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: editNotes, minErr: editMinErr })
        })
        setEditingId(null)
        fetchSources()
      } catch (error) {
        console.error('Failed to update notes:', error)
      }
    }

    const handleParseSource = async (id: number) => {
      if (parsingId !== null) return
      setParsingId(id)
      setSingleParseResult(null)
      try {
        const res = await fetch(`/api/sources/${id}/parse`, { method: 'POST' })
        const data = await res.json()
        if (res.ok) {
          const source = sources.find(s => s.id === id)
          setSingleParseResult({
            sourceId: id,
            channelName: source?.channel_name || '',
            processedCount: data.processedCount
          })
          setSources(prev => prev.map(s => 
            s.id === id ? { ...s, last_parsed_at: data.lastParsedAt } : s
          ))
        } else {
          const source = sources.find(s => s.id === id)
          setSingleParseResult({
            sourceId: id,
            channelName: source?.channel_name || '',
            processedCount: 0,
            error: data.error || 'Ошибка парсинга'
          })
        }
      } catch (error) {
        console.error('Failed to parse source:', error)
        const source = sources.find(s => s.id === id)
        setSingleParseResult({
          sourceId: id,
          channelName: source?.channel_name || '',
          processedCount: 0,
          error: 'Ошибка при парсинге источника'
        })
      } finally {
        setParsingId(null)
      }
    }

    const handleParseAll = async () => {
      if (parsingAll || parsingId !== null) return
      setParsingAll(true)
      setParseResults(null)
      try {
        const res = await fetch('/api/parse-all', { method: 'POST' })
        const data = await res.json()
        if (res.ok) {
          setParseResults(data.results || [])
          fetchSources()
        } else {
          setParseResults([{ sourceId: 0, channelName: 'Все', processedCount: 0, error: data.error || 'Ошибка парсинга' }])
        }
      } catch (error) {
        console.error('Failed to parse all:', error)
        setParseResults([{ sourceId: 0, channelName: 'Все', processedCount: 0, error: 'Ошибка при парсинге' }])
      } finally {
        setParsingAll(false)
      }
    }

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
            <h1 className="text-lg font-semibold">Источники</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={handleParseAll}
                disabled={parsingAll || parsingId !== null}
                className="h-8 px-3 rounded-full bg-green-500/10 text-green-500 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
              >
                {parsingAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Парсинг...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Спарсить все
                  </>
                )}
              </button>
              <button
                onClick={() => setShowAddForm(true)}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
      </header>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-card border-b"
          >
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  ID канала (без @)
                </label>
                <input
                  type="text"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  placeholder="channel_name"
                  className="w-full px-3 py-2 bg-secondary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  Заметки (опционально)
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Описание источника..."
                  className="w-full px-3 py-2 bg-secondary rounded-lg resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAddForm(false)
                    setNewChannelId('')
                    setNewNotes('')
                  }}
                  className="flex-1 py-2 bg-secondary rounded-lg"
                >
                  Отмена
                </button>
                <button
                  onClick={handleAddSource}
                  disabled={!newChannelId || adding}
                  className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg disabled:opacity-50 flex items-center justify-center"
                >
                  {adding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Добавить'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Parse results banners */}
        <AnimatePresence>
          {parseResults && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mt-3 p-3 bg-card rounded-xl border space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Результат парсинга всех источников</span>
                  <button onClick={() => setParseResults(null)} className="p-1 text-muted-foreground hover:text-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {parseResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.error ? (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    <span className="truncate">{r.channelName}</span>
                    <span className="ml-auto text-muted-foreground whitespace-nowrap">
                      {r.error ? r.error : `+${r.processedCount} постов`}
                    </span>
                  </div>
                ))}
                <div className="text-xs text-muted-foreground pt-1 border-t">
                  Итого: {parseResults.filter(r => !r.error).reduce((sum, r) => sum + r.processedCount, 0)} новых постов
                </div>
              </div>
            </motion.div>
          )}
          {singleParseResult && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className={cn(
                "mx-4 mt-3 p-3 rounded-xl border flex items-center gap-2",
                singleParseResult.error ? "bg-destructive/5 border-destructive/20" : "bg-green-500/5 border-green-500/20"
              )}>
                {singleParseResult.error ? (
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                )}
                <span className="text-sm truncate">
                  {singleParseResult.channelName}:&nbsp;
                  {singleParseResult.error
                    ? singleParseResult.error
                    : `+${singleParseResult.processedCount} новых постов`}
                </span>
                <button onClick={() => setSingleParseResult(null)} className="ml-auto p-1 text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 p-4 space-y-3">
        {sources.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Источники не добавлены</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
            >
              Добавить первый
            </button>
          </div>
        ) : (
          sources.map(source => (
            <motion.div
              key={source.id}
              layout
              className="bg-card rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center",
                    source.is_active ? "bg-green-500/10" : "bg-muted"
                  )}>
                    <MessageSquare className={cn(
                      "w-5 h-5",
                      source.is_active ? "text-green-500" : "text-muted-foreground"
                    )} />
                  </div>
                  <div>
                    <div className="font-medium">{source.channel_name}</div>
                    <div className="text-xs text-muted-foreground">
                      @{source.channel_id}
                    </div>
                  </div>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-primary"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {editingId === source.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Заметки..."
                    className="w-full px-3 py-2 bg-secondary rounded-lg resize-none h-20 text-sm"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                        Мин. ER % (0 = глобальная настройка)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editMinErr}
                      onChange={(e) => setEditMinErr(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 bg-secondary rounded-lg text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingId(null)}
                      className="flex-1 py-1.5 text-sm bg-secondary rounded-lg"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => handleUpdateNotes(source.id)}
                      className="flex-1 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg"
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : source.notes ? (
                <p className="text-sm text-muted-foreground">{source.notes}</p>
              ) : null}

              {!editingId && source.min_err > 0 && (
                <div className="text-xs text-muted-foreground">
                    Мин. ER: {source.min_err}%
                </div>
              )}

              {source.last_parsed_at && (
                <div className="text-xs text-muted-foreground">
                  Последний парсинг: {new Date(source.last_parsed_at).toLocaleString('ru-RU')}
                </div>
              )}

                <div className="flex flex-col gap-2 pt-2 border-t">
                  <button
                    onClick={() => handleParseSource(source.id)}
                      disabled={parsingId !== null || parsingAll}
                      className="w-full py-2 text-sm bg-primary/10 text-primary rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {parsingId === source.id ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Парсинг...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Спарсить сейчас
                      </>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(source.id, source.is_active)}
                      className={cn(
                        "flex-1 py-1.5 text-sm rounded-lg flex items-center justify-center gap-1",
                        source.is_active 
                          ? "bg-green-500/10 text-green-500" 
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                        {source.is_active ? (
                          <>
                            <Radio className="w-4 h-4" />
                            Активен
                          </>
                        ) : (
                          <>
                            <Circle className="w-4 h-4" />
                            Выключен
                          </>
                        )}
                    </button>
                    <button
                    onClick={() => {
                      setEditingId(source.id)
                      setEditNotes(source.notes || '')
                      setEditMinErr(String(source.min_err || 0))
                    }}
                      className="flex-1 py-1.5 text-sm bg-secondary rounded-lg flex items-center justify-center gap-1"
                    >
                      <Edit3 className="w-4 h-4" />
                      Настройки
                    </button>
                    <button
                      onClick={() => handleDeleteSource(source.id)}
                      className="py-1.5 px-3 text-sm bg-destructive/10 text-destructive rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
            </motion.div>
          ))
        )}
      </div>

      <BottomNav active="sources" />
    </div>
  )
}
