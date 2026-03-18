"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, ArrowLeft, RefreshCw, DollarSign, CheckCircle, XCircle, Search, Eye, Image } from 'lucide-react'
import { BottomNav } from '@/components/bottom-nav'

interface CreditsData {
  balance: number
  totalCredits: number
  totalUsage: number
}

export default function SettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [credits, setCredits] = useState<CreditsData | null>(null)
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [channelCheck, setChannelCheck] = useState<{ checking: boolean; result: null | { valid: boolean; isAdmin?: boolean; message?: string; channelTitle?: string } }>({ checking: false, result: null })
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [coverPreviewLoading, setCoverPreviewLoading] = useState(false)
  const [coverPosts, setCoverPosts] = useState<{ raw_post_id: number; title_for_cover: string }[]>([])
  const [selectedCoverPost, setSelectedCoverPost] = useState<string>('')

  useEffect(() => {
    fetchSettings()
    fetchCredits()
    fetchCoverPosts()
  }, [])

  const fetchCredits = async () => {
    try {
      setCreditsLoading(true)
      const response = await fetch('/api/credits')
      if (response.ok) {
        const data = await response.json()
        setCredits(data)
      }
    } catch {
      // ignore
    } finally {
      setCreditsLoading(false)
    }
  }

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const initData = localStorage.getItem('tg_init_data')
      const response = await fetch('/api/settings', {
        headers: { 'x-tg-init-data': initData || '' }
      })
      if (!response.ok) throw new Error('Failed to fetch settings')
      const data = await response.json()
      setSettings(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleUpdate = async (key: string, value: string) => {
    try {
      setSaving(key)
      const initData = localStorage.getItem('tg_init_data')
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-tg-init-data': initData || ''
        },
        body: JSON.stringify({ key, value })
      })
      if (!response.ok) throw new Error('Failed to update setting')
      setSettings(prev => ({ ...prev, [key]: value }))
    } catch {
      alert('Ошибка при сохранении')
    } finally {
      setSaving(null)
    }
  }

  const checkChannel = async (channelId: string) => {
    if (!channelId) return
    setChannelCheck({ checking: true, result: null })
    try {
      const res = await fetch('/api/channel-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      })
      const data = await res.json()
      setChannelCheck({ checking: false, result: data })
    } catch {
      setChannelCheck({ checking: false, result: { valid: false, message: 'Ошибка проверки' } })
    }
  }

  const fetchCoverPosts = async () => {
    try {
      const res = await fetch('/api/covers/preview')
      const data = await res.json()
      if (data.posts?.length) {
        setCoverPosts(data.posts)
        setSelectedCoverPost(String(data.posts[0].raw_post_id))
      }
    } catch { /* ignore */ }
  }

  const generateCoverPreview = async () => {
    setCoverPreviewLoading(true)
    setCoverPreview(null)
    try {
      const res = await fetch('/api/covers/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleCharsPerLine: settings.cover_chars_per_line || '22',
          maxLines: settings.cover_max_lines || '6',
          titleFontSize: settings.cover_font_size || '56',
          titleX: settings.cover_title_x || '65',
          titleBottomOffset: settings.cover_bottom_offset || '80',
          postId: selectedCoverPost || undefined,
        })
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || 'Ошибка генерации превью')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setCoverPreview(url)
    } catch (e: any) {
      alert('Ошибка: ' + e.message)
    } finally {
      setCoverPreviewLoading(false)
    }
  }

  // Модели для изображений
  const imageModels = [
    { value: 'google/gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' },
    { value: 'google/gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image' },
    { value: 'google/gemini-2.5-flash-image-preview', label: 'Gemini 2.5 Flash Image Preview' },
    { value: 'bytedance-seed/seedream-4.5', label: 'Seedream 4.5' },
    { value: 'openai/gpt-5-image-mini', label: 'GPT-5 Image Mini' },
    { value: 'openai/gpt-5-image', label: 'GPT-5 Image' },
    { value: 'black-forest-labs/flux.2-max', label: 'Flux 2 Max' },
  ]

  // Модели для текста
  const textModels = [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2' },
    { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
    { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat V3.1' },
    { value: 'x-ai/grok-3-mini-beta', label: 'Grok 3 Mini' },
    { value: 'openai/gpt-4o-mini', label: 'GPT 4o Mini' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  ]

  // Модели для генерации промпта
  const promptModels = [
    { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2' },
    { value: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
    { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'deepseek/deepseek-chat-v3.1', label: 'DeepSeek Chat V3.1' },
    { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
    { value: 'openai/gpt-4o-mini', label: 'GPT 4o Mini' },
    { value: 'x-ai/grok-3-mini-beta', label: 'Grok 3 Mini' },
  ]

  // Качество изображений
  const qualityOptions = [
    { value: '2048', label: '2K (2048x2048)' },
    { value: '4096', label: '4K (4096x4096)' }
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="p-4 flex items-center gap-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <button onClick={() => router.back()} className="p-2 hover:bg-accent rounded-full">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold">Настройки системы</h1>
      </div>

        <div className="p-4 space-y-6">
          {/* Секция: Баланс OpenRouter */}
          <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 p-4 rounded-2xl border border-green-500/20 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-xl">
                  <DollarSign className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Баланс OpenRouter</p>
                  {creditsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mt-1" />
                  ) : credits ? (
                    <p className={`text-xl font-bold ${credits.balance < 1 ? 'text-red-500' : 'text-green-500'}`}>
                      ${credits.balance.toFixed(2)}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Не удалось загрузить</p>
                  )}
                </div>
              </div>
              <button
                onClick={fetchCredits}
                disabled={creditsLoading}
                className="p-2 hover:bg-accent rounded-xl transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${creditsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {credits && (
              <div className="mt-3 pt-3 border-t border-green-500/20 flex justify-between text-xs text-muted-foreground">
                <span>Потрачено: ${credits.totalUsage.toFixed(2)}</span>
                <span>Всего: ${credits.totalCredits.toFixed(2)}</span>
              </div>
            )}
          </div>

          {/* Секция: Генерация изображений */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Генерация изображений
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Настройки моделей и качества для создания киберпанк-обложек. 
                Влияет на этап <b>Генерации контента</b>.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Модель</label>
              <div className="flex gap-2">
                <select
                  value={settings.image_model || imageModels[0].value}
                  onChange={(e) => setSettings(prev => ({ ...prev, image_model: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                >
                  {imageModels.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdate('image_model', settings.image_model || imageModels[0].value)}
                  disabled={saving === 'image_model'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'image_model' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Качество вывода</label>
              <div className="flex gap-2">
                <select
                  value={settings.image_quality || '2048'}
                  onChange={(e) => setSettings(prev => ({ ...prev, image_quality: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                >
                  {qualityOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdate('image_quality', settings.image_quality || '2048')}
                  disabled={saving === 'image_quality'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'image_quality' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Модель для генерации промпта</label>
              <div className="flex gap-2">
                <select
                  value={settings.prompt_model || promptModels[0].value}
                  onChange={(e) => setSettings(prev => ({ ...prev, prompt_model: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                >
                  {promptModels.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdate('prompt_model', settings.prompt_model || promptModels[0].value)}
                  disabled={saving === 'prompt_model'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'prompt_model' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Секция: Настройки обложки */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Текст на обложке
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Настройте размещение заголовка на обложке. Выберите пост для превью и подгоните параметры.
              </p>
            </div>

            {/* Выбор поста для превью */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Пост для превью</label>
              <select
                value={selectedCoverPost}
                onChange={(e) => setSelectedCoverPost(e.target.value)}
                className="w-full bg-background border rounded-xl p-3 text-sm"
              >
                <option value="">Любой последний пост</option>
                {coverPosts.map(p => (
                  <option key={p.raw_post_id} value={String(p.raw_post_id)}>
                    #{p.raw_post_id} — {p.title_for_cover?.substring(0, 50) || 'Без заголовка'}
                  </option>
                ))}
              </select>
            </div>

            {/* Символов в строке */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Символов в строке: <span className="text-primary font-bold">{settings.cover_chars_per_line || '22'}</span>
              </label>
              <input
                type="range"
                min="10"
                max="40"
                value={settings.cover_chars_per_line || '22'}
                onChange={(e) => setSettings(prev => ({ ...prev, cover_chars_per_line: e.target.value }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>10 (крупный)</span>
                <span>40 (мелкий)</span>
              </div>
            </div>

            {/* Макс. строк */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Макс. строк: <span className="text-primary font-bold">{settings.cover_max_lines || '6'}</span>
              </label>
              <input
                type="range"
                min="1"
                max="10"
                value={settings.cover_max_lines || '6'}
                onChange={(e) => setSettings(prev => ({ ...prev, cover_max_lines: e.target.value }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Размер шрифта */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Размер шрифта: <span className="text-primary font-bold">{settings.cover_font_size || '56'}px</span>
              </label>
              <input
                type="range"
                min="24"
                max="96"
                step="2"
                value={settings.cover_font_size || '56'}
                onChange={(e) => setSettings(prev => ({ ...prev, cover_font_size: e.target.value }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>24px</span>
                <span>96px</span>
              </div>
            </div>

            {/* Отступ слева */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Отступ слева (X): <span className="text-primary font-bold">{settings.cover_title_x || '65'}px</span>
              </label>
              <input
                type="range"
                min="10"
                max="200"
                value={settings.cover_title_x || '65'}
                onChange={(e) => setSettings(prev => ({ ...prev, cover_title_x: e.target.value }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>10px</span>
                <span>200px</span>
              </div>
            </div>

            {/* Отступ снизу */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Отступ снизу: <span className="text-primary font-bold">{settings.cover_bottom_offset || '80'}px</span>
              </label>
              <input
                type="range"
                min="10"
                max="300"
                value={settings.cover_bottom_offset || '80'}
                onChange={(e) => setSettings(prev => ({ ...prev, cover_bottom_offset: e.target.value }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>10px</span>
                <span>300px</span>
              </div>
            </div>

            {/* Кнопка превью */}
            <button
              onClick={generateCoverPreview}
              disabled={coverPreviewLoading}
              className="w-full py-3 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {coverPreviewLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Генерация превью...</>
              ) : (
                <><Eye className="w-4 h-4" /> Показать превью</>
              )}
            </button>

            {/* Превью изображение */}
            {coverPreview && (
              <div className="space-y-2">
                <img 
                  src={coverPreview} 
                  alt="Cover preview" 
                  className="w-full rounded-xl border"
                />
              </div>
            )}

            {/* Кнопка сохранения всех параметров */}
            <button
              onClick={async () => {
                const keys = ['cover_chars_per_line', 'cover_max_lines', 'cover_font_size', 'cover_title_x', 'cover_bottom_offset']
                const defaults: Record<string, string> = { cover_chars_per_line: '22', cover_max_lines: '6', cover_font_size: '56', cover_title_x: '65', cover_bottom_offset: '80' }
                for (const key of keys) {
                  await handleUpdate(key, settings[key] || defaults[key])
                }
                alert('Настройки обложки сохранены!')
              }}
              disabled={saving !== null}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить настройки обложки
            </button>
          </div>

          {/* Секция: Генерация текста */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Генерация текста
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Выбор моделей для переписывания новостей. Каждый вариант может создаваться разной моделью.
                Влияет на этап <b>Генерации контента</b>.
              </p>
            </div>
            
            {[1, 2, 3].map(num => (
              <div key={num} className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Модель для Текста {num}</label>
                <div className="flex gap-2">
                  <select
                    value={settings[`text_model_${num}`] || textModels[0].value}
                    onChange={(e) => setSettings(prev => ({ ...prev, [`text_model_${num}`]: e.target.value }))}
                    className="flex-1 bg-background border rounded-xl p-3 text-sm"
                  >
                    {textModels.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleUpdate(`text_model_${num}`, settings[`text_model_${num}`] || textModels[0].value)}
                    disabled={saving === `text_model_${num}`}
                    className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                  >
                    {saving === `text_model_${num}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Секция: Превью ссылок */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Отображение
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Настройки внешнего вида постов при публикации в Telegram.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Показывать превью ссылок</label>
              <div className="flex gap-2">
                <div 
                  className="flex-1 flex items-center gap-3 p-3 bg-background border rounded-xl cursor-pointer" 
                  onClick={() => {
                    const newValue = settings.show_link_preview === 'true' ? 'false' : 'true'
                    setSettings(prev => ({ ...prev, show_link_preview: newValue }))
                  }}
                >
                  <div className={`w-12 h-6 rounded-full transition-colors relative ${settings.show_link_preview === 'true' ? 'bg-primary' : 'bg-muted'}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.show_link_preview === 'true' ? 'translate-x-6' : ''}`} />
                  </div>
                  <span className="text-sm font-medium">
                    {settings.show_link_preview === 'true' ? 'Включено' : 'Выключено'}
                  </span>
                </div>
                <button
                  onClick={() => handleUpdate('show_link_preview', settings.show_link_preview || 'false')}
                  disabled={saving === 'show_link_preview'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'show_link_preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Секция: Фильтры парсинга */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">

            {/* Целевой канал */}
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Целевой канал
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Канал, в который бот будет публиковать готовые посты. Бот должен быть администратором этого канала.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Ссылка / ID канала</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.target_channel_id || ''}
                  onChange={(e) => {
                    setSettings(prev => ({ ...prev, target_channel_id: e.target.value }))
                    setChannelCheck({ checking: false, result: null })
                  }}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                  placeholder="@channel_name или -100..."
                />
                <button
                  onClick={() => checkChannel(settings.target_channel_id || '')}
                  disabled={channelCheck.checking || !settings.target_channel_id}
                  className="px-3 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                  title="Проверить канал"
                >
                  {channelCheck.checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    if (channelCheck.result && !channelCheck.result.isAdmin) {
                      alert('Бот не является администратором в этом канале. Сначала добавьте бота как администратора.')
                      return
                    }
                    handleUpdate('target_channel_id', settings.target_channel_id || '')
                  }}
                  disabled={saving === 'target_channel_id'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'target_channel_id' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
              
              {channelCheck.result && (
                <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs ${
                  channelCheck.result.isAdmin 
                    ? 'bg-green-500/10 text-green-600' 
                    : 'bg-red-500/10 text-red-500'
                }`}>
                  {channelCheck.result.isAdmin 
                    ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> 
                    : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  }
                  <span>{channelCheck.result.message}</span>
                </div>
              )}
              
              <p className="text-[9px] text-muted-foreground/80">
                Нажмите 🔍 чтобы проверить права бота. Формат: @channel_name или числовой ID (-100...).
              </p>
            </div>
          </div>

          {/* Секция: Фильтры парсинга */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Фильтры парсинга
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  ER (Engagement Rate) = просмотры / подписчики * 100%.
                  Посты с ER ниже порога будут отфильтрованы при парсинге.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Минимальный ER по умолчанию (%)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={settings.default_min_err || '0'}
                  onChange={(e) => setSettings(prev => ({ ...prev, default_min_err: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                  placeholder="0 = без фильтра"
                />
                <button
                  onClick={() => handleUpdate('default_min_err', settings.default_min_err || '0')}
                  disabled={saving === 'default_min_err'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'default_min_err' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground/80">
                0 = без фильтра. Можно переопределить для каждого источника отдельно.
              </p>
            </div>
          </div>

          {/* Секция: Автопилот и расписание */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Автопилот и расписание
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Автопилот выбирает пост с наивысшим ER и публикует его автоматически, 
                если вы не совершаете действий в течение заданного времени.
              </p>
            </div>

            {/* Автопилот вкл/выкл */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Режим автопилота</label>
              <div className="flex gap-2">
                <div 
                  className="flex-1 flex items-center gap-3 p-3 bg-background border rounded-xl cursor-pointer" 
                  onClick={() => {
                    const newValue = settings.autopilot_enabled === 'true' ? 'false' : 'true'
                    setSettings(prev => ({ ...prev, autopilot_enabled: newValue }))
                  }}
                >
                  <div className={`w-12 h-6 rounded-full transition-colors relative ${settings.autopilot_enabled === 'true' ? 'bg-primary' : 'bg-muted'}`}>
                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.autopilot_enabled === 'true' ? 'translate-x-6' : ''}`} />
                  </div>
                  <span className="text-sm font-medium">
                    {settings.autopilot_enabled === 'true' ? 'Включён' : 'Выключен'}
                  </span>
                </div>
                <button
                  onClick={() => handleUpdate('autopilot_enabled', settings.autopilot_enabled || 'false')}
                  disabled={saving === 'autopilot_enabled'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'autopilot_enabled' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Время неактивности */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Время неактивности (часы)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="24"
                  value={settings.autopilot_inactivity_hours || '4'}
                  onChange={(e) => setSettings(prev => ({ ...prev, autopilot_inactivity_hours: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm"
                  placeholder="4"
                />
                <button
                  onClick={() => handleUpdate('autopilot_inactivity_hours', settings.autopilot_inactivity_hours || '4')}
                  disabled={saving === 'autopilot_inactivity_hours'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'autopilot_inactivity_hours' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground/80">
                Через сколько часов без действий автопилот опубликует лучший пост.
              </p>
            </div>

            {/* Слоты расписания */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Слоты публикации (через запятую)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.schedule_slots || '12:00,16:00,20:00'}
                  onChange={(e) => setSettings(prev => ({ ...prev, schedule_slots: e.target.value }))}
                  className="flex-1 bg-background border rounded-xl p-3 text-sm font-mono"
                  placeholder="12:00,16:00,20:00"
                />
                <button
                  onClick={() => handleUpdate('schedule_slots', settings.schedule_slots || '12:00,16:00,20:00')}
                  disabled={saving === 'schedule_slots'}
                  className="px-4 bg-primary text-primary-foreground rounded-xl text-sm font-medium disabled:opacity-50"
                >
                  {saving === 'schedule_slots' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[9px] text-muted-foreground/80">
                Формат: HH:MM через запятую. Посты будут ставиться в ближайший свободный слот. 
                Если все слоты заняты — будет запрошено ручное время.
              </p>
            </div>
          </div>

          {/* Секция: Промпты */}
          <div className="bg-card p-4 rounded-2xl border shadow-sm space-y-4">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-wider">
                Промпты
              </h2>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                Инструкции для ИИ, определяющие логику работы на всех этапах.
              </p>
            </div>
            
            {[
              { 
                key: 'system_prompt', 
                label: 'Промпт для генерации постов',
                desc: 'Инструкция для переписывания текста. Первая строка ответа = заголовок для обложки (не попадает в текст). Этап: Генерация контента.'
              },
              { 
                key: 'system_prompt_editor', 
                label: 'Промпт для редактирования',
                desc: 'Используется при ручных правках текста через кнопку "Edit". Этап: Ручное редактирование.'
              },
              { 
                key: 'image_prompt', 
                label: 'Промпт для генерации фона',
                desc: 'Инструкция для создания описания киберпанк-картинки. Этап: Генерация обложки.'
              },
              { 
                key: 'selection_prompt', 
                label: 'Промпт для отбора новостей',
                desc: 'Логика выбора лучших постов. ИИ получает все посты и возвращает ID лучших ("Отобранные ID" — это ID постов, прошедших фильтр). Этап: Парсинг и отбор.'
              }
            ].map(({ key, label, desc }) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-xs font-medium text-muted-foreground">{label}</label>
                    <p className="text-[9px] text-muted-foreground/80 leading-tight pr-4">
                      {desc}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUpdate(key, settings[key] || '')}
                    disabled={saving === key}
                    className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium disabled:opacity-50 h-fit"
                  >
                    {saving === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Сохранить
                  </button>
                </div>
                <textarea
                  value={settings[key] || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                  rows={6}
                  className="w-full bg-background border rounded-xl p-3 text-sm font-mono resize-none"
                />
              </div>
            ))}
          </div>
        </div>

      <div className="p-4">
        <button 
          onClick={fetchSettings}
          className="w-full py-4 flex items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Сбросить изменения
        </button>
      </div>

      <BottomNav active="settings" />
    </div>
  )
}
