import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ReaderBook, ReadingMark } from '../types'
import {
  clearLocalLibrary,
  clearReadingMarks,
  deleteLocalBook,
  deleteReadingMark,
  loadLocalBookPayload,
  loadLocalBooks,
  loadReadingMarks,
  saveLocalBook,
  saveLocalBookMetadata,
  saveReadingMark
} from './libraryStorage'

const localBook: ReaderBook = {
  id: 'local-1',
  title: '离线样书',
  author: '未知作者',
  format: 'txt',
  source: 'local',
  fileSize: 12,
  sizeLabel: '12 B',
  progress: 0,
  lastOpened: 1,
  content: '第一章\n离线文本。',
  textIndex: {
    version: 1,
    paragraphs: ['第一章', '离线文本。'],
    chapters: [{ title: '第一章', paragraphIndex: 0 }],
    totalReadingUnits: 6
  },
  cover: { background: '#a4442d', foreground: '#fff6e8' }
}

const bookmark: ReadingMark = {
  id: 'mark-1',
  bookId: 'local-1',
  kind: 'bookmark',
  location: { type: 'text', value: '3' },
  label: '第一章',
  excerpt: '离线文本。',
  progress: 28,
  createdAt: 100
}

describe('local library migration', () => {
  it('moves existing version-2 book content into the lazy payload store', async () => {
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('mojian-library')
      deletion.onsuccess = () => resolve()
      deletion.onerror = () => reject(deletion.error)
    })
    const oldDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('mojian-library', 2)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('books', { keyPath: 'id' })
        request.result.createObjectStore('reading-marks', { keyPath: 'id' }).createIndex('bookId', 'bookId')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = oldDatabase.transaction('books', 'readwrite')
      transaction.objectStore('books').put(localBook)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    oldDatabase.close()

    expect(await loadLocalBooks()).toEqual([{ ...localBook, content: undefined, data: undefined, textIndex: undefined }])
    expect(await loadLocalBookPayload(localBook.id)).toEqual({ content: localBook.content, textIndex: localBook.textIndex })
  })
})

describe('local library storage', () => {
  beforeEach(async () => {
    await clearLocalLibrary()
    await clearReadingMarks()
  })

  it('keeps large book payloads separate from lightweight shelf metadata', async () => {
    await saveLocalBook(localBook)
    expect(await loadLocalBooks()).toEqual([{ ...localBook, content: undefined, textIndex: undefined }])
    expect(await loadLocalBookPayload(localBook.id)).toEqual({ content: localBook.content, textIndex: localBook.textIndex })
  })

  it('updates progress metadata without rewriting the stored novel payload', async () => {
    await saveLocalBook(localBook)
    await saveLocalBookMetadata({ ...localBook, progress: 42, content: undefined })
    const books = await loadLocalBooks()
    expect(books).toHaveLength(1)
    expect(books[0].progress).toBe(42)
    expect(await loadLocalBookPayload(localBook.id)).toEqual({ content: localBook.content, textIndex: localBook.textIndex })
  })

  it('stores, restores and deletes reading marks independently from books', async () => {
    const annotation = { ...bookmark, id: 'mark-2', kind: 'annotation' as const, note: '稍后重读' }
    await saveReadingMark(bookmark)
    await saveReadingMark(annotation)

    expect(await loadReadingMarks()).toEqual([bookmark, annotation])
    await deleteReadingMark('mark-1')
    expect(await loadReadingMarks()).toEqual([annotation])
  })

  it('deletes book metadata, payload and associated reading marks atomically', async () => {
    await saveLocalBook(localBook)
    await saveReadingMark(bookmark)

    await deleteLocalBook(localBook.id)

    expect(await loadLocalBooks()).toEqual([])
    expect(await loadLocalBookPayload(localBook.id)).toBeNull()
    expect(await loadReadingMarks()).toEqual([])
  })
})
