import { beforeEach, describe, expect, it } from 'vitest'
import type { ReaderBook, ReadingMark } from '../types'
import type { BookReadingStats } from './readingStats'
import {
  buildCompletionPlans,
  getDailyReviewMark,
  loadDailyReadingGoal,
  saveDailyReadingGoal,
  summarizeReadingActivity
} from './readingInsights'

const MINUTE = 60_000
const NOW = new Date(2026, 7, 29, 12).getTime()

function stats(bookId: string, dailyReadingMs: Record<string, number>, overrides: Partial<BookReadingStats> = {}): BookReadingStats {
  return {
    bookId,
    totalReadingMs: Object.values(dailyReadingMs).reduce((total, duration) => total + duration, 0),
    sessionCount: 2,
    lastReadAt: NOW,
    dailyReadingMs,
    ...overrides
  }
}

describe('reading insights', () => {
  beforeEach(() => localStorage.clear())

  it('persists a bounded daily goal with a useful default', () => {
    expect(loadDailyReadingGoal()).toBe(30)
    expect(saveDailyReadingGoal(45)).toBe(45)
    expect(loadDailyReadingGoal()).toBe(45)
    expect(saveDailyReadingGoal(999)).toBe(120)
    expect(saveDailyReadingGoal(Number.NaN)).toBe(30)
  })

  it('merges activity across books into a seven-day rhythm and keeps an unfinished-today streak', () => {
    const summary = summarizeReadingActivity([
      stats('book-1', {
        '2026-08-27': 45 * MINUTE,
        '2026-08-28': 30 * MINUTE,
        '2026-08-29': 12 * MINUTE
      }),
      stats('book-2', { '2026-08-29': 8 * MINUTE }, { sessionCount: 1 })
    ], 30, NOW)

    expect(summary.todayMinutes).toBe(20)
    expect(summary.goalProgress).toBe(67)
    expect(summary.streakDays).toBe(2)
    expect(summary.totalMinutes).toBe(95)
    expect(summary.sessionCount).toBe(3)
    expect(summary.week).toHaveLength(7)
    expect(summary.week.at(-1)).toEqual(expect.objectContaining({ key: '2026-08-29', minutes: 20, isToday: true }))
  })

  it('uses observed pace when available and word count as a fallback for finish plans', () => {
    const pacedBook = {
      id: 'paced', title: '按节奏阅读', author: '作者', progress: 25, wordCount: 10_000
    } as ReaderBook
    const newBook = {
      id: 'new', title: '刚刚开始', author: '作者', progress: 50, wordCount: 10_000
    } as ReaderBook
    const plans = buildCompletionPlans([
      pacedBook,
      newBook,
      { ...newBook, id: 'done', progress: 100 }
    ], [
      stats('paced', { '2026-08-29': 15 * MINUTE }, {
        totalReadingMs: 15 * MINUTE,
        trackingStartedProgress: 10,
        lastProgress: 25
      })
    ], 30, NOW)

    expect(plans).toHaveLength(2)
    expect(plans.find((plan) => plan.book.id === 'paced')).toEqual(expect.objectContaining({
      remainingMinutes: 75,
      daysRemaining: 3,
      usesObservedPace: true
    }))
    expect(plans.find((plan) => plan.book.id === 'new')).toEqual(expect.objectContaining({
      remainingMinutes: 10,
      daysRemaining: 1,
      usesObservedPace: false
    }))
  })

  it('rotates only annotation excerpts in a stable daily review queue', () => {
    const marks: ReadingMark[] = [
      { id: 'bookmark', bookId: 'book', kind: 'bookmark', location: { type: 'text', value: '1' }, label: '书签', excerpt: '书签摘录', progress: 10, createdAt: 1 },
      { id: 'annotation-a', bookId: 'book', kind: 'annotation', location: { type: 'text', value: '2' }, label: '第一章', excerpt: '第一条值得回顾的句子。', progress: 20, createdAt: 2 },
      { id: 'annotation-b', bookId: 'book', kind: 'annotation', location: { type: 'text', value: '3' }, label: '第二章', excerpt: '第二条值得回顾的句子。', progress: 30, createdAt: 3 }
    ]

    const first = getDailyReviewMark(marks, 0, NOW)
    const second = getDailyReviewMark(marks, 1, NOW)
    expect(first?.kind).toBe('annotation')
    expect(second?.kind).toBe('annotation')
    expect(second?.id).not.toBe(first?.id)
    expect(getDailyReviewMark([marks[0]], 0, NOW)).toBeNull()
  })
})
