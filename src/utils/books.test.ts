import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getBookFormat,
  getTitleFromFilename,
  importBookFile,
  isSupportedBook,
  splitIntoChapters
} from './books'
import { decodeTextBuffer } from './textDecoder'
import JSZip from 'jszip'

const detectEncoding = vi.hoisted(() => vi.fn((input: string) => {
  String(input)
  return { encoding: 'utf-8' }
}))

vi.mock('jschardet', () => ({
  default: { detect: detectEncoding }
}))

beforeEach(() => detectEncoding.mockClear())

describe('book utilities', () => {
  it('accepts EPUB, TXT and Markdown files regardless of extension case', () => {
    expect(isSupportedBook('novel.EPUB')).toBe(true)
    expect(isSupportedBook('notes.txt')).toBe(true)
    expect(isSupportedBook('essays.MD')).toBe(true)
    expect(isSupportedBook('manual.pdf')).toBe(false)
  })

  it('returns the supported format or unknown', () => {
    expect(getBookFormat('三体.txt')).toBe('txt')
    expect(getBookFormat('Pride-and-Prejudice.epub')).toBe('epub')
    expect(getBookFormat('draft.md')).toBe('md')
    expect(getBookFormat('archive.zip')).toBe('unknown')
  })

  it('creates a readable title from a filename', () => {
    expect(getTitleFromFilename('the-left-hand-of-darkness.epub')).toBe(
      'the left hand of darkness'
    )
    expect(getTitleFromFilename(' 银河帝国_基地.txt ')).toBe('银河帝国 基地')
  })

  it('decodes UTF-8 text and removes a byte-order mark', () => {
    const bytes = new TextEncoder().encode('\uFEFF第一章\n你好，世界。')
    expect(decodeTextBuffer(bytes.buffer)).toBe('第一章\n你好，世界。')
  })

  it('samples large files for encoding detection instead of copying the entire novel', () => {
    const bytes = new Uint8Array(2 * 1024 * 1024)
    bytes.fill(65)

    decodeTextBuffer(bytes.buffer)

    expect(detectEncoding).toHaveBeenCalledTimes(1)
    expect(detectEncoding.mock.calls[0][0]).toHaveLength(256 * 1024)
  })

  it('detects chapter headings while preserving leading content', () => {
    const text = '导读\n这是序言。\n第一章 启程\n第一段。\n第二章 抵达\n第二段。'
    expect(splitIntoChapters(text)).toEqual([
      { title: '开始', start: 0 },
      { title: '第一章 启程', start: 9 },
      { title: '第二章 抵达', start: 21 }
    ])
  })

  it('recognizes common Chinese prologue, extra and epilogue headings', () => {
    const text = '序章 山雨欲来\n正文。\n楔子\n旧事。\n番外 春风\n小记。\n后记\n结束。'
    expect(splitIntoChapters(text).map((chapter) => chapter.title)).toEqual([
      '序章 山雨欲来',
      '楔子',
      '番外 春风',
      '后记'
    ])
  })

  it('reports import progress and validates excessively large files', async () => {
    const progress: number[] = []
    const file = new File(['第一章\n正文。'], '新书.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('第一章\n正文。').buffer
    })

    const imported = await importBookFile(file, (value) => progress.push(value))

    expect(imported.title).toBe('新书')
    expect(imported.textIndex).toEqual(expect.objectContaining({
      version: 1,
      paragraphs: ['第一章', '正文。'],
      chapters: [{ title: '第一章', paragraphIndex: 0 }]
    }))
    expect(imported).toEqual(expect.objectContaining({ chapterCount: 1, wordCount: 5 }))
    expect(progress.at(-1)).toBe(100)

    const oversized = new File(['x'], '过大.txt', { type: 'text/plain' })
    Object.defineProperty(oversized, 'size', { value: 513 * 1024 * 1024 })
    await expect(importBookFile(oversized)).rejects.toThrow('文件过大')
  })

  it('extracts EPUB chapter and word counts during import', async () => {
    const archive = new JSZip()
    archive.file('META-INF/container.xml', `<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/content.opf" /></rootfiles></container>`)
    archive.file('OPS/content.opf', `<?xml version="1.0"?><package><manifest>
      <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
      <item id="one" href="chapter-1.xhtml" media-type="application/xhtml+xml" />
      <item id="two" href="chapter-2.xhtml" media-type="application/xhtml+xml" />
    </manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>`)
    archive.file('OPS/nav.xhtml', `<html><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">第一章</a></li><li><a href="chapter-2.xhtml">第二章</a></li></ol></nav></body></html>`)
    archive.file('OPS/chapter-1.xhtml', '<html><body><h1>第一章</h1><p>山中有清风。</p></body></html>')
    archive.file('OPS/chapter-2.xhtml', '<html><body><h1>第二章</h1><p>Moon light returns.</p></body></html>')
    const bytes = await archive.generateAsync({ type: 'uint8array' })
    const file = new File([bytes], '山月.epub', { type: 'application/epub+zip' })
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    })

    const imported = await importBookFile(file)

    expect(imported.chapterCount).toBe(2)
    expect(imported.wordCount).toBe(14)
  })
})
