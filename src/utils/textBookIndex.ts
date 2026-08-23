import type { TextBookIndex } from '../types'
import { isChapterHeading } from './chapterHeadings'

export const TEXT_BOOK_INDEX_VERSION = 1

const EAST_ASIAN_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

export function countTextReadingUnits(text: string) {
  let total = 0
  const eastAsianCharacters = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu
  while (eastAsianCharacters.exec(text)) total += 1
  for (const match of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!EAST_ASIAN_CHARACTER.test(match[0])) total += 1
  }
  return total
}

export function buildTextBookIndex(text: string): TextBookIndex {
  const paragraphs = text.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const chapters = paragraphs.flatMap((paragraph, paragraphIndex) => (
    isChapterHeading(paragraph) ? [{ title: paragraph, paragraphIndex }] : []
  ))
  if (chapters.length === 0 || chapters[0].paragraphIndex > 0) {
    chapters.unshift({ title: '开始', paragraphIndex: 0 })
  }
  return {
    version: TEXT_BOOK_INDEX_VERSION,
    paragraphs,
    chapters,
    totalReadingUnits: countTextReadingUnits(text)
  }
}

export function hasCurrentTextBookIndex(value: unknown): value is TextBookIndex {
  if (!value || typeof value !== 'object') return false
  const index = value as Partial<TextBookIndex>
  return index.version === TEXT_BOOK_INDEX_VERSION &&
    Array.isArray(index.paragraphs) &&
    Array.isArray(index.chapters) &&
    typeof index.totalReadingUnits === 'number' &&
    Number.isFinite(index.totalReadingUnits)
}
