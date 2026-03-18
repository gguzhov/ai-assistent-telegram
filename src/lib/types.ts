export interface Source {
  id: number
  channel_id: string
  channel_name: string
  url: string
  notes: string | null
  is_active: boolean
  min_err: number
  last_parsed_at: Date | null
  created_at: Date
}

export interface RawPost {
  id: number
  source_id: number
  external_id: string
  original_text: string
  original_image_url: string | null
  original_video_url: string | null
  views: number
  reactions: number
  comments: number
  forwards: number
  arr_score: number
  err_score: number
  original_date: Date
  parsed_at: Date
  status: 'new' | 'processing' | 'ready' | 'approved' | 'rejected' | 'posted'
}

export interface GeneratedVariant {
  id: number
  raw_post_id: number
  variant_number: number
  generated_text: string
  generated_image_url: string | null
  title_for_cover: string | null
  created_at: Date
}

export interface ScheduledPost {
  id: number
  raw_post_id: number
  selected_text_variant: number
  selected_image_variant: number
  final_text: string
  final_image_url: string | null
  scheduled_at: Date
  published_at: Date | null
  is_auto_published: boolean
  created_at: Date
}

export interface PostWithVariants extends RawPost {
  source: Source
  variants: GeneratedVariant[]
  scheduled?: ScheduledPost
}

export type PostStatus = 'new' | 'processing' | 'ready' | 'approved' | 'rejected' | 'posted'
