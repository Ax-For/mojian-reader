import { beforeEach, describe, expect, it } from 'vitest'
import {
  countReadingUnits,
  estimateRemainingMinutes,
  formatReadingEstimate,
  formatReadingDuration,
  loadBookReadingStats,
  recordReadingActivity
} from './readingStats'

describe('reading statistics', () => {
  beforeEach(() => localStorage.clear())

  it('counts Chinese characters and Latin words as comparable reading units', () => {
    expect(countReadingUnits('山风吹过 the quiet library 2026')).toBe(8)
  })

  it('records durable per-book time, sessions and active days', () => {
    const firstReadAt = new Date(2026, 7, 23, 9, 30).getTime()
    recordReadingActivity('book-1', 90_000, firstReadAt, true, 40)
    recordReadingActivity('book-1', 30_000, firstReadAt + 30_000, false, 42)

    expect(loadBookReadingStats('book-1')).toEqual(expect.objectContaining({
      bookId: 'book-1',
      totalReadingMs: 120_000,
      sessionCount: 1,
      lastReadAt: firstReadAt + 30_000,
      trackingStartedProgress: 40,
      lastProgress: 42
    }))
    expect(Object.values(loadBookReadingStats('book-1').dailyReadingMs)).toEqual([120_000])
  })

  it('uses observed pace when available and a text-size fallback for a new book', () => {
    expect(estimateRemainingMinutes({ progress: 25, totalReadingMs: 15 * 60_000, totalUnits: 10_000 })).toBe(45)
    expect(estimateRemainingMinutes({ progress: 60, totalReadingMs: 30 * 60_000, totalUnits: 10_000, observedProgress: 2 })).toBe(600)
    expect(estimateRemainingMinutes({ progress: 25, totalReadingMs: 0, totalUnits: 10_000 })).toBe(15)
  })

  it('formats short and long durations without false precision', () => {
    expect(formatReadingDuration(45_000)).toBe('不足 1 分钟')
    expect(formatReadingDuration(18 * 60_000)).toBe('18 分钟')
    expect(formatReadingDuration(2 * 60 * 60_000 + 12 * 60_000)).toBe('2 小时 12 分钟')
    expect(formatReadingEstimate(45)).toBe('约 45 分钟')
    expect(formatReadingEstimate(125)).toBe('约 2 小时 5 分钟')
  })
})
