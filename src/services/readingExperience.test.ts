import { afterEach, describe, expect, it } from 'vitest'
import type { ReaderBook, ReadingMark } from '../types'
import {
  buildResumeMemory,
  buildSmartShelves,
  buildStoryMapSegments,
  loadReadingResumeSnapshot,
  saveReadingResumeSnapshot,
  type StoryMapChapter
} from './readingExperience'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-08-29T12:00:00+08:00').getTime()

function book(overrides: Partial<ReaderBook>): ReaderBook {
  return {
    id: 'book',
    title: '测试长篇',
    author: '作者',
    format: 'txt',
    source: 'local',
    fileSize: 10,
    sizeLabel: '10 KB',
    progress: 0,
    lastOpened: now,
    cover: { background: '#333', foreground: '#fff' },
    ...overrides
  }
}

function mark(overrides: Partial<ReadingMark>): ReadingMark {
  return {
    id: 'mark',
    bookId: 'book',
    kind: 'annotation',
    location: { type: 'text', value: '1' },
    label: '第一章',
    excerpt: '这里是被记住的一句话。',
    progress: 25,
    createdAt: now,
    ...overrides
  }
}

afterEach(() => localStorage.clear())

describe('reading experience derivations', () => {
  it('builds useful smart shelves without treating completed or unread books as active', () => {
    const reading = book({ id: 'reading', progress: 42 })
    const finishing = book({ id: 'finishing', progress: 88 })
    const stalled = book({ id: 'stalled', progress: 35, lastOpened: now - 21 * DAY })
    const completed = book({ id: 'completed', progress: 100 })
    const unread = book({ id: 'unread', progress: 0 })
    const shelves = buildSmartShelves(
      [reading, finishing, stalled, completed, unread],
      [mark({ bookId: 'reading' })],
      now
    )

    expect(shelves.find((shelf) => shelf.id === 'reading')?.books.map((item) => item.id)).toEqual([
      'reading', 'finishing', 'stalled'
    ])
    expect(shelves.find((shelf) => shelf.id === 'finishing')?.books.map((item) => item.id)).toEqual(['finishing'])
    expect(shelves.find((shelf) => shelf.id === 'stalled')?.books.map((item) => item.id)).toEqual(['stalled'])
    expect(shelves.find((shelf) => shelf.id === 'annotated')?.books.map((item) => item.id)).toEqual(['reading'])
  })

  it('persists a compact resume snapshot and prefers it over older marks', () => {
    saveReadingResumeSnapshot({
      bookId: 'book',
      chapterLabel: '第九章 雨夜',
      excerpt: '檐下的雨声逐渐清晰，远处有人推门而入。',
      progress: 63,
      lastReadAt: now - 3 * DAY
    })

    const snapshot = loadReadingResumeSnapshot('book')
    const memory = buildResumeMemory(book({ progress: 63 }), [mark({ createdAt: now - 5 * DAY })], snapshot, now)

    expect(memory).toMatchObject({
      chapterLabel: '第九章 雨夜',
      excerpt: '檐下的雨声逐渐清晰，远处有人推门而入。',
      timeLabel: '3 天前',
      source: 'snapshot'
    })
  })

  it('falls back to the latest reading mark when no resume snapshot exists', () => {
    const memory = buildResumeMemory(book({ progress: 35 }), [
      mark({ id: 'old', label: '第二章', createdAt: now - 5 * DAY }),
      mark({ id: 'latest', label: '第三章 山中', excerpt: '山门前落满松针。', createdAt: now - DAY })
    ], null, now)

    expect(memory).toMatchObject({
      chapterLabel: '第三章 山中',
      excerpt: '山门前落满松针。',
      source: 'mark'
    })
  })

  it('bounds very large story maps and aggregates progress, records and active state', () => {
    const chapters: StoryMapChapter[] = Array.from({ length: 240 }, (_, index) => ({
      id: `chapter-${index}`,
      title: `第 ${index + 1} 章`,
      progress: index < 80 ? 100 : index === 80 ? 40 : 0,
      startProgress: index / 240 * 100,
      endProgress: (index + 1) / 240 * 100,
      lastReadAt: index === 80 ? now : undefined
    }))
    const segments = buildStoryMapSegments(chapters, [mark({ progress: 34 })], 80, 48)

    expect(segments).toHaveLength(48)
    expect(segments.some((segment) => segment.isActive)).toBe(true)
    expect(segments.reduce((total, segment) => total + segment.markCount, 0)).toBe(1)
    expect(segments[0].startIndex).toBe(0)
    expect(segments.at(-1)?.endIndex).toBe(239)
  })
})
