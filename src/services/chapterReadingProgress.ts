const STORAGE_KEY = 'mojian-chapter-reading-progress'

export interface ChapterReadingRecord {
  progress: number
  lastReadAt: number
}

export type BookChapterProgress = Record<string, ChapterReadingRecord>
type StoredChapterProgress = Record<string, BookChapterProgress>

function clampProgress(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : 0
}

function normalizeBookProgress(value: unknown): BookChapterProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([chapterKey, record]) => {
      if (!record || typeof record !== 'object') return []
      const candidate = record as Partial<ChapterReadingRecord>
      if (typeof candidate.lastReadAt !== 'number' || !Number.isFinite(candidate.lastReadAt) || candidate.lastReadAt <= 0) return []
      return [[chapterKey, {
        progress: clampProgress(candidate.progress),
        lastReadAt: candidate.lastReadAt
      }]]
    })
  )
}

function loadAllChapterProgress(): StoredChapterProgress {
  if (typeof localStorage === 'undefined') return {}
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(
      Object.entries(stored).map(([bookId, value]) => [bookId, normalizeBookProgress(value)])
    )
  } catch {
    return {}
  }
}

export function loadBookChapterProgress(bookId: string): BookChapterProgress {
  return loadAllChapterProgress()[bookId] ?? {}
}

export function recordChapterReadingProgress(
  bookId: string,
  chapterKey: string,
  progress: number,
  readAt = Date.now()
) {
  const allProgress = loadAllChapterProgress()
  const bookProgress = allProgress[bookId] ?? {}
  const current = bookProgress[chapterKey]
  bookProgress[chapterKey] = {
    progress: Math.max(current?.progress ?? 0, clampProgress(progress)),
    lastReadAt: readAt
  }
  allProgress[bookId] = bookProgress
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(allProgress))
  return { ...bookProgress }
}

export function formatChapterReadingTime(timestamp: number, now = Date.now()) {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))} 小时前`
  if (elapsed < 7 * 24 * 60 * 60_000) return `${Math.floor(elapsed / (24 * 60 * 60_000))} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp)
}
