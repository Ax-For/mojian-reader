import type { ReaderFont, ReaderLayout, ReaderTheme } from '../types'
import { DEFAULT_READER_PREFERENCES, normalizeReaderPreferences, type ReaderPreferences } from './readerPreferences'

const STORAGE_KEY = 'mojian-reader-profiles'
type ReaderProfilePreferences = Pick<
  ReaderPreferences,
  'fontSize' | 'fontFamily' | 'lineHeight' | 'columnWidth' | 'layoutMode' | 'theme'
>

export interface ReaderProfile {
  id: string
  name: string
  fontSize: number
  fontFamily: ReaderFont
  lineHeight: number
  columnWidth: number
  layoutMode: ReaderLayout
  theme: ReaderTheme
  builtIn?: boolean
}

export const BUILT_IN_READER_PROFILES: ReaderProfile[] = [
  {
    id: 'paper', name: '纸页阅读', builtIn: true,
    fontSize: 20, fontFamily: 'serif', lineHeight: 1.85, columnWidth: 680, layoutMode: 'continuous', theme: 'paper'
  },
  {
    id: 'longform', name: '长篇沉浸', builtIn: true,
    fontSize: 22, fontFamily: 'serif', lineHeight: 2.05, columnWidth: 720, layoutMode: 'continuous', theme: 'sepia'
  },
  {
    id: 'night', name: '夜间专注', builtIn: true,
    fontSize: 20, fontFamily: 'sans', lineHeight: 1.9, columnWidth: 640, layoutMode: 'continuous', theme: 'night'
  }
]

function profileFromPreferences(id: string, name: string, preferences: ReaderProfilePreferences): ReaderProfile {
  const normalized = normalizeReaderPreferences({ ...DEFAULT_READER_PREFERENCES, ...preferences })
  return {
    id,
    name,
    fontSize: normalized.fontSize,
    fontFamily: normalized.fontFamily,
    lineHeight: normalized.lineHeight,
    columnWidth: normalized.columnWidth,
    layoutMode: normalized.layoutMode,
    theme: normalized.theme
  }
}

function normalizeStoredProfile(value: unknown): ReaderProfile | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ReaderProfile>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 24) : ''
  if (!id || !name) return null
  return profileFromPreferences(id, name, {
    ...DEFAULT_READER_PREFERENCES,
    fontSize: candidate.fontSize ?? DEFAULT_READER_PREFERENCES.fontSize,
    fontFamily: candidate.fontFamily ?? DEFAULT_READER_PREFERENCES.fontFamily,
    lineHeight: candidate.lineHeight ?? DEFAULT_READER_PREFERENCES.lineHeight,
    columnWidth: candidate.columnWidth ?? DEFAULT_READER_PREFERENCES.columnWidth,
    layoutMode: candidate.layoutMode ?? DEFAULT_READER_PREFERENCES.layoutMode,
    theme: candidate.theme ?? DEFAULT_READER_PREFERENCES.theme
  })
}

function persistProfiles(profiles: ReaderProfile[]) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
}

export function loadCustomReaderProfiles(): ReaderProfile[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return stored.map(normalizeStoredProfile).filter((profile): profile is ReaderProfile => Boolean(profile))
  } catch {
    return []
  }
}

export function saveCustomReaderProfile(name: string, preferences: ReaderProfilePreferences) {
  const safeName = name.trim().slice(0, 24) || '自定义方案'
  const profiles = loadCustomReaderProfiles()
  const existing = profiles.find((profile) => profile.name === safeName)
  const id = existing?.id ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  const saved = profileFromPreferences(id, safeName, preferences)
  persistProfiles(existing ? profiles.map((profile) => profile.id === id ? saved : profile) : [...profiles, saved])
  return saved
}

export function deleteCustomReaderProfile(id: string) {
  persistProfiles(loadCustomReaderProfiles().filter((profile) => profile.id !== id))
}
