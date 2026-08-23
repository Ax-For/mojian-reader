import type { ReaderFont, ReaderLayout, ReaderTheme } from '../types'

const STORAGE_KEY = 'mojian-reader-preferences'

export const DEFAULT_READER_TOC_WIDTH = 252
export const MIN_READER_TOC_WIDTH = 220
export const MAX_READER_TOC_WIDTH = 420

export interface ReaderPreferences {
  fontSize: number
  fontFamily: ReaderFont
  lineHeight: number
  columnWidth: number
  layoutMode: ReaderLayout
  theme: ReaderTheme
  autoScrollSpeed: number
  speechRate: number
  tocWidth: number
}

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  fontSize: 20,
  fontFamily: 'serif',
  lineHeight: 1.85,
  columnWidth: 680,
  layoutMode: 'continuous',
  theme: 'paper',
  autoScrollSpeed: 1,
  speechRate: 1,
  tocWidth: DEFAULT_READER_TOC_WIDTH
}

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback
}

export function normalizeReaderPreferences(stored: Partial<ReaderPreferences> | null | undefined): ReaderPreferences {
  return {
    fontSize: clamp(stored?.fontSize, 14, 32, DEFAULT_READER_PREFERENCES.fontSize),
    fontFamily: ['serif', 'song', 'sans'].includes(String(stored?.fontFamily))
      ? stored?.fontFamily as ReaderFont
      : DEFAULT_READER_PREFERENCES.fontFamily,
    lineHeight: clamp(stored?.lineHeight, 1.4, 2.4, DEFAULT_READER_PREFERENCES.lineHeight),
    columnWidth: clamp(stored?.columnWidth, 520, 860, DEFAULT_READER_PREFERENCES.columnWidth),
    layoutMode: ['continuous', 'double'].includes(String(stored?.layoutMode))
      ? stored?.layoutMode as ReaderLayout
      : DEFAULT_READER_PREFERENCES.layoutMode,
    theme: ['paper', 'sepia', 'night'].includes(String(stored?.theme))
      ? stored?.theme as ReaderTheme
      : DEFAULT_READER_PREFERENCES.theme,
    autoScrollSpeed: clamp(stored?.autoScrollSpeed, 0.5, 8, DEFAULT_READER_PREFERENCES.autoScrollSpeed),
    speechRate: clamp(stored?.speechRate, 0.5, 2.5, DEFAULT_READER_PREFERENCES.speechRate),
    tocWidth: Math.round(clamp(
      stored?.tocWidth,
      MIN_READER_TOC_WIDTH,
      MAX_READER_TOC_WIDTH,
      DEFAULT_READER_PREFERENCES.tocWidth
    ))
  }
}

export function loadReaderPreferences(): ReaderPreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_READER_PREFERENCES }
  try {
    return normalizeReaderPreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ReaderPreferences>)
  } catch {
    return { ...DEFAULT_READER_PREFERENCES }
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}
