import JSZip from 'jszip'
import type { BookFormat, BookGroup, ReaderBook, ReadingMark } from '../types'
import type { LocalBookPayload } from './libraryStorage'
import { isSafeBookImageDataUrl } from '../utils/bookImages'
import { normalizeReadingBackground } from '../utils/bookMetadata'
import {
  normalizeReaderPreferences,
  type ReaderPreferences
} from './readerPreferences'
import { normalizeBookGroups } from './bookGroups'

const BACKUP_APP = 'mojian-reader'
const BACKUP_VERSION = 1
const MAX_BACKUP_BYTES = 1024 * 1024 * 1024
const MAX_BOOK_BYTES = 512 * 1024 * 1024
const MAX_BOOKS = 5000

interface BackupBookEntry {
  metadata: ReaderBook
  path: string
}

interface BackupManifest {
  app: typeof BACKUP_APP
  version: typeof BACKUP_VERSION
  createdAt: number
  books: BackupBookEntry[]
  marks: ReadingMark[]
  preferences: ReaderPreferences
  groups?: BookGroup[]
}

export interface LibraryBackupContents {
  books: ReaderBook[]
  marks: ReadingMark[]
  preferences: ReaderPreferences
  groups: BookGroup[]
}

function invalidBackup(): never {
  throw new Error('无效的墨简备份文件')
}

function isFormat(value: unknown): value is BookFormat {
  return value === 'txt' || value === 'md' || value === 'epub'
}

function safeCoverColor(value: string, fallback: string) {
  return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback
}

function validateBook(value: unknown): ReaderBook {
  if (!value || typeof value !== 'object') invalidBackup()
  const book = value as Partial<ReaderBook>
  if (
    typeof book.id !== 'string' || book.id.length < 1 || book.id.length > 240 ||
    typeof book.title !== 'string' || book.title.length < 1 || book.title.length > 300 ||
    typeof book.author !== 'string' || book.author.length > 300 ||
    !isFormat(book.format) || book.source !== 'local' ||
    typeof book.fileSize !== 'number' || book.fileSize < 0 || book.fileSize > MAX_BOOK_BYTES ||
    typeof book.sizeLabel !== 'string' || typeof book.progress !== 'number' ||
    typeof book.lastOpened !== 'number' || !book.cover ||
    typeof book.cover.background !== 'string' || typeof book.cover.foreground !== 'string'
  ) invalidBackup()

  const groupIds = Array.isArray(book.groupIds)
    ? [...new Set(book.groupIds
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean))].slice(0, 100)
    : []

  return {
    id: book.id,
    title: book.title.trim(),
    author: book.author.trim() || '未知作者',
    format: book.format,
    source: 'local',
    fileSize: book.fileSize,
    sizeLabel: book.sizeLabel.slice(0, 40),
    progress: Math.min(100, Math.max(0, book.progress)),
    lastOpened: book.lastOpened,
    cover: {
      background: safeCoverColor(book.cover.background, '#344e4a'),
      foreground: safeCoverColor(book.cover.foreground, '#f0e8d5'),
      image: isSafeBookImageDataUrl(book.cover.image) ? book.cover.image : undefined
    },
    note: typeof book.note === 'string' ? book.note.trim().slice(0, 2000) || undefined : undefined,
    readingBackground: normalizeReadingBackground(book.readingBackground),
    groupIds: groupIds.length ? groupIds : undefined
  }
}

function validateMarks(value: unknown, bookIds: Set<string>): ReadingMark[] {
  if (!Array.isArray(value) || value.length > 100_000) invalidBackup()
  return value.filter((item): item is ReadingMark => {
    if (!item || typeof item !== 'object') return false
    const mark = item as Partial<ReadingMark>
    return typeof mark.id === 'string' && mark.id.length <= 300 &&
      typeof mark.bookId === 'string' && bookIds.has(mark.bookId) &&
      (mark.kind === 'bookmark' || mark.kind === 'annotation') &&
      Boolean(mark.location) && (mark.location?.type === 'text' || mark.location?.type === 'epub') &&
      typeof mark.location?.value === 'string' && mark.location.value.length <= 2000 &&
      typeof mark.label === 'string' && mark.label.length <= 500 &&
      typeof mark.excerpt === 'string' && mark.excerpt.length <= 20_000 &&
      (mark.note === undefined || (typeof mark.note === 'string' && mark.note.length <= 100_000)) &&
      typeof mark.progress === 'number' && typeof mark.createdAt === 'number'
  })
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

export async function buildLibraryBackup(
  books: ReaderBook[],
  marks: ReadingMark[],
  loadPayload: (id: string) => Promise<LocalBookPayload | null>,
  preferences: ReaderPreferences,
  groups: BookGroup[] = []
): Promise<Blob> {
  const zip = new JSZip()
  const entries: BackupBookEntry[] = []

  for (const book of books.filter((item) => item.source === 'local').slice(0, MAX_BOOKS)) {
    const payload = book.content !== undefined || book.data !== undefined
      ? { content: book.content, data: book.data }
      : await loadPayload(book.id)
    if (!payload || (book.format === 'epub' ? !payload.data : payload.content === undefined)) continue

    const safeId = encodeURIComponent(book.id)
    const path = `books/${safeId}.${book.format}`
    zip.file(path, book.format === 'epub' ? payload.data! : payload.content!)
    entries.push({ metadata: { ...book, content: undefined, data: undefined }, path })
  }

  const bookIds = new Set(entries.map((entry) => entry.metadata.id))
  const manifest: BackupManifest = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    books: entries,
    marks: marks.filter((mark) => bookIds.has(mark.bookId)),
    preferences: normalizeReaderPreferences(preferences),
    groups: normalizeBookGroups(groups)
  }
  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export async function readLibraryBackup(blob: Blob): Promise<LibraryBackupContents> {
  if (blob.size < 1 || blob.size > MAX_BACKUP_BYTES) invalidBackup()
  try {
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(blob), { checkCRC32: true })
    const manifestFile = zip.file('manifest.json')
    if (!manifestFile) invalidBackup()
    const manifest = JSON.parse(await manifestFile.async('string')) as Partial<BackupManifest>
    if (manifest.app !== BACKUP_APP || manifest.version !== BACKUP_VERSION || !Array.isArray(manifest.books) || manifest.books.length > MAX_BOOKS) {
      invalidBackup()
    }

    const books: ReaderBook[] = []
    for (const entryValue of manifest.books) {
      if (!entryValue || typeof entryValue !== 'object') invalidBackup()
      const entry = entryValue as Partial<BackupBookEntry>
      const metadata = validateBook(entry.metadata)
      if (typeof entry.path !== 'string' || !entry.path.startsWith('books/') || entry.path.includes('..')) invalidBackup()
      const payloadFile = zip.file(entry.path)
      if (!payloadFile) invalidBackup()

      if (metadata.format === 'epub') {
        const data = await payloadFile.async('arraybuffer')
        if (data.byteLength > MAX_BOOK_BYTES) invalidBackup()
        books.push({ ...metadata, data })
      } else {
        const content = await payloadFile.async('string')
        if (new Blob([content]).size > MAX_BOOK_BYTES) invalidBackup()
        books.push({ ...metadata, content })
      }
    }

    const bookIds = new Set(books.map((book) => book.id))
    const groups = normalizeBookGroups(manifest.groups)
    const groupIds = new Set(groups.map((group) => group.id))
    return {
      books: books.map((book) => {
        const validGroupIds = book.groupIds?.filter((id) => groupIds.has(id)) ?? []
        return { ...book, groupIds: validGroupIds.length ? validGroupIds : undefined }
      }),
      marks: validateMarks(manifest.marks, bookIds),
      preferences: normalizeReaderPreferences(manifest.preferences),
      groups
    }
  } catch (error) {
    if (error instanceof Error && error.message === '无效的墨简备份文件') throw error
    invalidBackup()
  }
}
