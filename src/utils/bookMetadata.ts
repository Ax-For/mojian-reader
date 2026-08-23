import type { BookReadingBackground, ReadingBackgroundPreset } from '../types'
import { isSafeBookImageDataUrl } from './bookImages'

export const READING_BACKGROUND_PRESETS: {
  id: ReadingBackgroundPreset
  label: string
  description: string
  color: string
}[] = [
  { id: 'default', label: '跟随主题', description: '使用当前阅读主题', color: '#e9e5dc' },
  { id: 'warm', label: '暖杏', description: '柔和暖色纸面', color: '#d9cbb6' },
  { id: 'sage', label: '松林', description: '低饱和绿灰色', color: '#c5cec1' },
  { id: 'slate', label: '暮蓝', description: '沉静的深蓝灰', color: '#303a3d' }
]

const PRESET_IDS = new Set<ReadingBackgroundPreset>(READING_BACKGROUND_PRESETS.map((preset) => preset.id))

export function normalizeReadingBackground(value?: BookReadingBackground): BookReadingBackground {
  const preset = value && PRESET_IDS.has(value.preset) ? value.preset : 'default'
  return {
    preset,
    image: isSafeBookImageDataUrl(value?.image) ? value.image : undefined
  }
}
