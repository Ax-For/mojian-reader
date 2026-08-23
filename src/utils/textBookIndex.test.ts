import { describe, expect, it } from 'vitest'
import { buildTextBookIndex, hasCurrentTextBookIndex } from './textBookIndex'

describe('text book index', () => {
  it('precomputes paragraphs, chapter positions and reading units once', () => {
    const index = buildTextBookIndex('导读\n\n第一章 起风\n山风吹过。\n\n第二章 入夜\nMoon light 2026。')

    expect(index).toEqual({
      version: 1,
      paragraphs: ['导读', '第一章 起风', '山风吹过。', '第二章 入夜', 'Moon light 2026。'],
      chapters: [
        { title: '开始', paragraphIndex: 0 },
        { title: '第一章 起风', paragraphIndex: 1 },
        { title: '第二章 入夜', paragraphIndex: 3 }
      ],
      totalReadingUnits: 19
    })
    expect(hasCurrentTextBookIndex(index)).toBe(true)
  })

  it('rejects stale or incomplete cached indexes without scanning their contents', () => {
    expect(hasCurrentTextBookIndex(undefined)).toBe(false)
    expect(hasCurrentTextBookIndex({ version: 0, paragraphs: [], chapters: [], totalReadingUnits: 0 })).toBe(false)
    expect(hasCurrentTextBookIndex({ version: 1, paragraphs: 'invalid', chapters: [], totalReadingUnits: 0 })).toBe(false)
  })
})
