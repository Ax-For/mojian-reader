import { describe, expect, it } from 'vitest'
import type { ReaderBook } from '../types'
import { bookMetricsFromTextIndex, formatBookContentStats, hasBookContentMetrics } from './bookMetrics'

const book: ReaderBook = {
  id: 'metrics-book',
  title: '统计样书',
  author: '测试作者',
  format: 'txt',
  source: 'local',
  fileSize: 12,
  sizeLabel: '12 B',
  progress: 0,
  lastOpened: 1,
  cover: { background: '#333', foreground: '#fff' }
}

describe('book content metrics', () => {
  it('derives chapter and word counts from a persisted text index', () => {
    const metrics = bookMetricsFromTextIndex({
      version: 1,
      paragraphs: ['序言', '第一章', '正文'],
      chapters: [
        { title: '开始', paragraphIndex: 0 },
        { title: '第一章', paragraphIndex: 1 }
      ],
      totalReadingUnits: 123456
    })

    expect(metrics).toEqual({ chapterCount: 2, wordCount: 123456 })
    expect(hasBookContentMetrics({ ...book, ...metrics })).toBe(true)
  })

  it('formats compact shelf statistics and falls back while legacy books are being analyzed', () => {
    expect(formatBookContentStats({ ...book, chapterCount: 12, wordCount: 34567 })).toBe('12 章 · 3.5 万字')
    expect(formatBookContentStats({ ...book, chapterCount: 1, wordCount: 980 })).toBe('1 章 · 980 字')
    expect(formatBookContentStats(book)).toBe('章节与字数统计中')
  })
})
