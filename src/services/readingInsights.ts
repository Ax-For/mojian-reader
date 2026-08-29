import type { ReaderBook, ReadingMark } from '../types'
import { estimateRemainingMinutes, type BookReadingStats } from './readingStats'

const GOAL_STORAGE_KEY = 'mojian-daily-reading-goal'
const DEFAULT_GOAL_MINUTES = 30
const MIN_GOAL_MINUTES = 10
const MAX_GOAL_MINUTES = 120
const DAY_MS = 24 * 60 * 60 * 1000

export interface ReadingActivityDay {
  key: string
  label: string
  minutes: number
  isToday: boolean
  goalMet: boolean
}

export interface ReadingActivitySummary {
  todayMinutes: number
  goalProgress: number
  streakDays: number
  totalMinutes: number
  sessionCount: number
  activeDays: number
  week: ReadingActivityDay[]
}

export interface CompletionPlan {
  book: ReaderBook
  remainingMinutes: number
  daysRemaining: number
  estimatedFinishAt: number
  usesObservedPace: boolean
}

function normalizeGoal(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_GOAL_MINUTES
  return Math.min(MAX_GOAL_MINUTES, Math.max(MIN_GOAL_MINUTES, Math.round(value)))
}

function localDayStart(timestamp: number) {
  const date = new Date(timestamp)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayKey(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sumDailyReading(stats: BookReadingStats[]) {
  const totals: Record<string, number> = {}
  stats.forEach((bookStats) => {
    Object.entries(bookStats.dailyReadingMs).forEach(([key, duration]) => {
      if (!Number.isFinite(duration) || duration <= 0) return
      totals[key] = (totals[key] ?? 0) + duration
    })
  })
  return totals
}

export function loadDailyReadingGoal() {
  if (typeof localStorage === 'undefined') return DEFAULT_GOAL_MINUTES
  try {
    const stored = localStorage.getItem(GOAL_STORAGE_KEY)
    return stored === null ? DEFAULT_GOAL_MINUTES : normalizeGoal(Number(stored))
  } catch {
    return DEFAULT_GOAL_MINUTES
  }
}

export function saveDailyReadingGoal(minutes: number) {
  const normalized = normalizeGoal(minutes)
  if (typeof localStorage !== 'undefined') localStorage.setItem(GOAL_STORAGE_KEY, String(normalized))
  return normalized
}

export function summarizeReadingActivity(
  stats: BookReadingStats[],
  dailyGoalMinutes: number,
  now = Date.now()
): ReadingActivitySummary {
  const goalMinutes = normalizeGoal(dailyGoalMinutes)
  const goalMs = goalMinutes * 60_000
  const dailyTotals = sumDailyReading(stats)
  const todayStart = localDayStart(now)
  const todayKey = dayKey(todayStart)
  const todayMs = dailyTotals[todayKey] ?? 0
  const week = Array.from({ length: 7 }, (_, index) => {
    const timestamp = todayStart - (6 - index) * DAY_MS
    const key = dayKey(timestamp)
    const duration = dailyTotals[key] ?? 0
    return {
      key,
      label: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(timestamp),
      minutes: Math.round(duration / 60_000),
      isToday: key === todayKey,
      goalMet: duration >= goalMs
    }
  })

  let streakCursor = todayStart
  if (todayMs < goalMs) streakCursor -= DAY_MS
  let streakDays = 0
  while ((dailyTotals[dayKey(streakCursor)] ?? 0) >= goalMs) {
    streakDays += 1
    streakCursor -= DAY_MS
  }

  const totalReadingMs = stats.reduce((total, bookStats) => total + Math.max(0, bookStats.totalReadingMs), 0)
  return {
    todayMinutes: Math.round(todayMs / 60_000),
    goalProgress: Math.min(100, Math.round((todayMs / goalMs) * 100)),
    streakDays,
    totalMinutes: Math.round(totalReadingMs / 60_000),
    sessionCount: stats.reduce((total, bookStats) => total + Math.max(0, bookStats.sessionCount), 0),
    activeDays: Object.values(dailyTotals).filter((duration) => duration > 0).length,
    week
  }
}

export function buildCompletionPlans(
  books: ReaderBook[],
  stats: BookReadingStats[],
  dailyGoalMinutes: number,
  now = Date.now()
): CompletionPlan[] {
  const goalMinutes = normalizeGoal(dailyGoalMinutes)
  const statsByBookId = new Map(stats.map((bookStats) => [bookStats.bookId, bookStats]))
  return books
    .filter((book) => book.progress > 0 && book.progress < 100)
    .flatMap((book) => {
      const bookStats = statsByBookId.get(book.id)
      const observedProgress = bookStats?.trackingStartedProgress === undefined
        ? 0
        : Math.max(0, (bookStats.lastProgress ?? book.progress) - bookStats.trackingStartedProgress)
      const usesObservedPace = Boolean(bookStats && bookStats.totalReadingMs >= 60_000 && observedProgress >= 1)
      const remainingMinutes = estimateRemainingMinutes({
        progress: book.progress,
        totalReadingMs: bookStats?.totalReadingMs ?? 0,
        totalUnits: book.wordCount ?? 0,
        observedProgress
      })
      if (remainingMinutes <= 0) return []
      const daysRemaining = Math.max(1, Math.ceil(remainingMinutes / goalMinutes))
      return [{
        book,
        remainingMinutes,
        daysRemaining,
        estimatedFinishAt: now + daysRemaining * DAY_MS,
        usesObservedPace
      }]
    })
    .sort((left, right) => left.daysRemaining - right.daysRemaining || right.book.progress - left.book.progress)
}

export function getDailyReviewMark(marks: ReadingMark[], offset = 0, now = Date.now()) {
  const annotations = marks
    .filter((mark) => mark.kind === 'annotation' && mark.excerpt.trim().length > 0)
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id))
  if (annotations.length === 0) return null
  const date = new Date(now)
  const dailySeed = date.getFullYear() * 372 + (date.getMonth() + 1) * 31 + date.getDate()
  const normalizedOffset = ((Math.round(offset) % annotations.length) + annotations.length) % annotations.length
  return annotations[(dailySeed + normalizedOffset) % annotations.length]
}
