import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatChapterReadingTime,
  loadBookChapterProgress,
  recordChapterReadingProgress
} from './chapterReadingProgress'

describe('chapter reading progress', () => {
  beforeEach(() => localStorage.clear())

  it('keeps chapter progress and recent reading time separate for every book', () => {
    recordChapterReadingProgress('book-a', 'text:0', 42, 1_725_000_000_000)
    recordChapterReadingProgress('book-a', 'text:1', 18, 1_725_000_060_000)
    recordChapterReadingProgress('book-b', 'text:0', 75, 1_725_000_120_000)

    expect(loadBookChapterProgress('book-a')).toEqual({
      'text:0': { progress: 42, lastReadAt: 1_725_000_000_000 },
      'text:1': { progress: 18, lastReadAt: 1_725_000_060_000 }
    })
    expect(loadBookChapterProgress('book-b')).toEqual({
      'text:0': { progress: 75, lastReadAt: 1_725_000_120_000 }
    })
  })

  it('never loses completed progress when a reader revisits an earlier position', () => {
    recordChapterReadingProgress('book-a', 'text:0', 100, 1_725_000_000_000)
    recordChapterReadingProgress('book-a', 'text:0', 20, 1_725_000_060_000)

    expect(loadBookChapterProgress('book-a')['text:0']).toEqual({
      progress: 100,
      lastReadAt: 1_725_000_060_000
    })
  })

  it('formats useful relative timestamps and ignores malformed local data', () => {
    const now = new Date(2026, 7, 23, 18, 0).getTime()
    expect(formatChapterReadingTime(now - 20_000, now)).toBe('刚刚')
    expect(formatChapterReadingTime(now - 12 * 60_000, now)).toBe('12 分钟前')
    expect(formatChapterReadingTime(now - 3 * 60 * 60_000, now)).toBe('3 小时前')
    expect(formatChapterReadingTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3 天前')

    localStorage.setItem('mojian-chapter-reading-progress', '{broken')
    expect(loadBookChapterProgress('book-a')).toEqual({})
  })
})
