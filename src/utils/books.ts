import type { BookCover, BookFormat, ChapterMarker, ReaderBook, TextBookIndex } from '../types'
import { CHAPTER_HEADING_SOURCE } from './chapterHeadings'
import { buildTextBookIndex } from './textBookIndex'
import { bookMetricsFromTextIndex } from './bookMetrics'

const SUPPORTED_FORMATS = new Set<BookFormat>(['txt', 'epub', 'md'])
const CHAPTER_PATTERN = new RegExp(CHAPTER_HEADING_SOURCE, 'gim')
const MAX_BOOK_FILE_SIZE = 512 * 1024 * 1024
const COVER_PALETTE: BookCover[] = [
  { background: '#9f4634', foreground: '#fff6e8' },
  { background: '#334f4b', foreground: '#f4ead4' },
  { background: '#c49a57', foreground: '#27231d' },
  { background: '#47576c', foreground: '#f3eee3' },
  { background: '#6e4b3e', foreground: '#fff4dc' },
  { background: '#796c4e', foreground: '#fff9e9' }
]

export function getBookFormat(filename: string): BookFormat | 'unknown' {
  const match = filename.trim().toLowerCase().match(/\.([^.]+)$/)
  const extension = match?.[1] as BookFormat | undefined
  return extension && SUPPORTED_FORMATS.has(extension) ? extension : 'unknown'
}

export function isSupportedBook(filename: string): boolean {
  return getBookFormat(filename) !== 'unknown'
}

export function getTitleFromFilename(filename: string): string {
  return filename
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitIntoChapters(text: string): ChapterMarker[] {
  const chapters: ChapterMarker[] = []
  for (const match of text.matchAll(CHAPTER_PATTERN)) {
    if (typeof match.index === 'number') {
      chapters.push({ title: match[0].trim(), start: match.index })
    }
  }
  if (chapters.length === 0 || chapters[0].start > 0) chapters.unshift({ title: '开始', start: 0 })
  return chapters
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function coverForTitle(title: string): BookCover {
  const hash = [...title].reduce((total, character) => total + character.charCodeAt(0), 0)
  return COVER_PALETTE[hash % COVER_PALETTE.length]
}

function decodeTextInWorker(
  buffer: ArrayBuffer,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
) {
  if (typeof Worker === 'undefined' || buffer.byteLength < 512 * 1024) {
    if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError')
    onProgress?.(62)
    return import('./textDecoder').then(({ decodeTextBuffer }) => {
      const content = decodeTextBuffer(buffer)
      onProgress?.(82)
      return { content, textIndex: buildTextBookIndex(content) }
    })
  }
  return new Promise<{ content: string; textIndex: TextBookIndex }>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/bookImport.worker.ts', import.meta.url), { type: 'module' })
    const abort = () => {
      worker.terminate()
      reject(new DOMException('导入已取消', 'AbortError'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ type: 'progress'; value: number } | { type: 'complete'; content: string; textIndex: TextBookIndex } | { type: 'error' }>) => {
      if (event.data.type === 'progress') {
        onProgress?.(event.data.value)
        return
      }
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      if (event.data.type === 'complete') resolve({ content: event.data.content, textIndex: event.data.textIndex })
      else reject(new Error('无法解析文本文件'))
    }
    worker.onerror = () => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      reject(new Error('无法解析文本文件'))
    }
    worker.postMessage({ buffer }, [buffer])
  })
}

export async function importBookFile(
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<ReaderBook> {
  const format = getBookFormat(file.name)
  if (format === 'unknown') {
    throw new Error(`暂不支持 ${file.name}`)
  }
  if (file.size > MAX_BOOK_FILE_SIZE) throw new Error(`文件过大：${file.name} 最大支持 512 MB`)
  if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError')

  onProgress?.(8)
  const data = await file.arrayBuffer()
  if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError')
  onProgress?.(35)
  const title = getTitleFromFilename(file.name) || '未命名书籍'
  const decoded = format === 'epub' ? undefined : await decodeTextInWorker(data, onProgress, signal)
  const epubMetrics = format === 'epub'
    ? await import('./epubBookMetrics').then(({ analyzeEpubBook }) => analyzeEpubBook(data, onProgress, signal))
    : undefined
  const textMetrics = decoded ? bookMetricsFromTextIndex(decoded.textIndex) : undefined
  onProgress?.(100)

  return {
    id: `local-${file.name}-${file.size}-${file.lastModified}`,
    title,
    author: '本地书籍',
    format,
    source: 'local',
    fileSize: file.size,
    sizeLabel: formatFileSize(file.size),
    progress: 0,
    lastOpened: Date.now(),
    content: decoded?.content,
    textIndex: decoded?.textIndex,
    chapterCount: textMetrics?.chapterCount ?? epubMetrics?.chapterCount,
    wordCount: textMetrics?.wordCount ?? epubMetrics?.wordCount,
    data: format === 'epub' ? data : undefined,
    cover: coverForTitle(title)
  }
}
