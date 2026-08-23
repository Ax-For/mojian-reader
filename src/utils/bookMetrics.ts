import type { ReaderBook, TextBookIndex } from '../types'
import { hasCurrentTextBookIndex } from './textBookIndex'

export interface BookContentMetrics {
  chapterCount: number
  wordCount: number
}

function isMetric(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function hasBookContentMetrics(book: ReaderBook): book is ReaderBook & BookContentMetrics {
  return isMetric(book.chapterCount) && isMetric(book.wordCount)
}

export function bookMetricsFromTextIndex(index: TextBookIndex): BookContentMetrics {
  return {
    chapterCount: index.chapters.length,
    wordCount: index.totalReadingUnits
  }
}

export function resolveBookContentMetrics(book: ReaderBook): BookContentMetrics | null {
  if (hasBookContentMetrics(book)) {
    return { chapterCount: book.chapterCount, wordCount: book.wordCount }
  }
  return hasCurrentTextBookIndex(book.textIndex) ? bookMetricsFromTextIndex(book.textIndex) : null
}

function formatWordCount(wordCount: number) {
  if (wordCount < 10_000) return `${Math.round(wordCount).toLocaleString('zh-CN')} 字`
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(wordCount / 10_000)} 万字`
}

export function formatBookContentStats(book: ReaderBook) {
  const metrics = resolveBookContentMetrics(book)
  if (!metrics) return '章节与字数统计中'
  return `${Math.round(metrics.chapterCount).toLocaleString('zh-CN')} 章 · ${formatWordCount(metrics.wordCount)}`
}
