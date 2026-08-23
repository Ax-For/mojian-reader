import { describe, expect, it } from 'vitest'
import type { BookGroup, ReaderBook, ReadingMark } from '../types'
import { buildLibraryBackup, readLibraryBackup } from './libraryBackup'
import { DEFAULT_READER_PREFERENCES } from './readerPreferences'

const book: ReaderBook = {
  id: 'local-backup',
  title: '备份样书',
  author: '本地作者',
  format: 'txt',
  source: 'local',
  fileSize: 18,
  sizeLabel: '18 B',
  progress: 36,
  lastOpened: 12,
  content: '第一章\n需要被完整保存的正文。',
  cover: { background: '#334f4b', foreground: '#ffffff', image: 'data:image/png;base64,iVBORw0KGgo=' },
  note: '收藏版，适合雨天重读',
  readingBackground: { preset: 'sage', image: 'data:image/webp;base64,UklGRg==' },
  groupIds: ['reread']
}

const groups: BookGroup[] = [{ id: 'reread', name: '想重读', createdAt: 10 }]

const mark: ReadingMark = {
  id: 'backup-mark',
  bookId: book.id,
  kind: 'annotation',
  location: { type: 'text', value: '1' },
  label: '第一章',
  excerpt: '需要被完整保存的正文。',
  note: '备份这条笔记',
  progress: 36,
  createdAt: 20
}

describe('library backup', () => {
  it('round-trips books, payloads, marks and reader preferences', async () => {
    const backup = await buildLibraryBackup(
      [{ ...book, content: undefined }],
      [mark],
      async () => ({ content: book.content }),
      { ...DEFAULT_READER_PREFERENCES, theme: 'night', fontSize: 24 },
      groups
    )

    const restored = await readLibraryBackup(backup)

    expect(restored.books[0]).toEqual(book)
    expect(restored.marks).toEqual([mark])
    expect(restored.groups).toEqual(groups)
    expect(restored.preferences).toEqual(expect.objectContaining({ theme: 'night', fontSize: 24 }))
  })

  it('rejects archives without a valid Mojian manifest', async () => {
    await expect(readLibraryBackup(new Blob(['not-a-zip']))).rejects.toThrow('无效')
  })
})
