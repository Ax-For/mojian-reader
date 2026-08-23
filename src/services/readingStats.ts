import { countTextReadingUnits } from '../utils/textBookIndex'

const STORAGE_KEY = 'mojian-reading-statistics'
const DEFAULT_READING_UNITS_PER_MINUTE = 500

export interface BookReadingStats {
  bookId: string
  totalReadingMs: number
  sessionCount: number
  lastReadAt: number
  dailyReadingMs: Record<string, number>
  trackingStartedProgress?: number
  lastProgress?: number
}

interface RemainingTimeInput {
  progress: number
  totalReadingMs: number
  totalUnits: number
  observedProgress?: number
}

function emptyBookStats(bookId: string): BookReadingStats {
  return { bookId, totalReadingMs: 0, sessionCount: 0, lastReadAt: 0, dailyReadingMs: {} }
}

function safePositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeBookStats(bookId: string, value: unknown): BookReadingStats {
  if (!value || typeof value !== 'object') return emptyBookStats(bookId)
  const candidate = value as Partial<BookReadingStats>
  const dailyReadingMs = Object.fromEntries(
    Object.entries(candidate.dailyReadingMs ?? {})
      .filter(([day, duration]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && safePositiveNumber(duration) > 0)
      .map(([day, duration]) => [day, safePositiveNumber(duration)])
  )
  const trackingStartedProgress = typeof candidate.trackingStartedProgress === 'number' && Number.isFinite(candidate.trackingStartedProgress)
    ? Math.min(100, Math.max(0, candidate.trackingStartedProgress))
    : undefined
  const lastProgress = typeof candidate.lastProgress === 'number' && Number.isFinite(candidate.lastProgress)
    ? Math.min(100, Math.max(0, candidate.lastProgress))
    : undefined
  return {
    bookId,
    totalReadingMs: safePositiveNumber(candidate.totalReadingMs),
    sessionCount: Math.floor(safePositiveNumber(candidate.sessionCount)),
    lastReadAt: safePositiveNumber(candidate.lastReadAt),
    dailyReadingMs,
    ...(trackingStartedProgress === undefined ? {} : { trackingStartedProgress }),
    ...(lastProgress === undefined ? {} : { lastProgress })
  }
}

function loadAllStats(): Record<string, BookReadingStats> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).map(([bookId, value]) => [bookId, normalizeBookStats(bookId, value)]))
  } catch {
    return {}
  }
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function loadBookReadingStats(bookId: string): BookReadingStats {
  return loadAllStats()[bookId] ?? emptyBookStats(bookId)
}

export function recordReadingActivity(bookId: string, elapsedMs: number, readAt = Date.now(), newSession = false, progress?: number) {
  const duration = Math.round(safePositiveNumber(elapsedMs))
  const allStats = loadAllStats()
  const current = allStats[bookId] ?? emptyBookStats(bookId)
  if (duration === 0) return current
  const key = dayKey(readAt)
  const safeProgress = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress))
    : undefined
  const next: BookReadingStats = {
    ...current,
    totalReadingMs: current.totalReadingMs + duration,
    sessionCount: current.sessionCount + (newSession ? 1 : 0),
    lastReadAt: readAt,
    dailyReadingMs: {
      ...current.dailyReadingMs,
      [key]: (current.dailyReadingMs[key] ?? 0) + duration
    },
    ...(safeProgress === undefined ? {} : {
      trackingStartedProgress: current.trackingStartedProgress ?? safeProgress,
      lastProgress: safeProgress
    })
  }
  allStats[bookId] = next
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(allStats))
  return next
}

export function countReadingUnits(text: string) {
  return countTextReadingUnits(text)
}

export function estimateRemainingMinutes({ progress, totalReadingMs, totalUnits, observedProgress }: RemainingTimeInput) {
  const safeProgress = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
  if (safeProgress >= 100) return 0
  const paceProgress = observedProgress === undefined ? safeProgress : Math.max(0, observedProgress)
  if (totalReadingMs >= 60_000 && paceProgress >= 1) {
    return Math.max(1, Math.round((totalReadingMs / paceProgress) * (100 - safeProgress) / 60_000))
  }
  const remainingUnits = safePositiveNumber(totalUnits) * (1 - safeProgress / 100)
  return remainingUnits === 0 ? 0 : Math.max(1, Math.round(remainingUnits / DEFAULT_READING_UNITS_PER_MINUTE))
}

export function formatReadingDuration(durationMs: number) {
  const minutes = Math.floor(safePositiveNumber(durationMs) / 60_000)
  if (minutes < 1) return '不足 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes > 0 ? `${hours} 小时 ${remainingMinutes} 分钟` : `${hours} 小时`
}

export function formatReadingEstimate(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0))
  if (safeMinutes < 60) return `约 ${safeMinutes} 分钟`
  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60
  return remainingMinutes > 0 ? `约 ${hours} 小时 ${remainingMinutes} 分钟` : `约 ${hours} 小时`
}
