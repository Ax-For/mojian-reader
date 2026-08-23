import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LibraryView } from './components/LibraryView'
import { sampleBooks } from './data/sampleBooks'
import {
  deleteLocalBook,
  deleteReadingMark,
  loadLocalBookPayload,
  loadLocalBooks,
  loadReadingMarks,
  saveLocalBook,
  saveLocalBookMetadata,
  saveLocalBookPayload,
  saveReadingMark
} from './services/libraryStorage'
import type { LocalBookPayload } from './services/libraryStorage'
import { loadReaderPreferences, saveReaderPreferences } from './services/readerPreferences'
import { loadBookGroups, normalizeBookGroups, saveBookGroups } from './services/bookGroups'
import type { BookGroup, LibrarySection, ReaderBook, ReadingMark, ReadingMarkDraft } from './types'
import { importBookFile, isSupportedBook } from './utils/books'
import { isSafeBookImageDataUrl } from './utils/bookImages'
import { normalizeReadingBackground } from './utils/bookMetadata'
import { hasCurrentTextBookIndex } from './utils/textBookIndex'
import { buildTextBookIndexAsync } from './services/textBookIndex'
import {
  hasBookContentMetrics,
  resolveBookContentMetrics,
  type BookContentMetrics
} from './utils/bookMetrics'
import './styles.css'

const ReaderView = lazy(() => import('./components/ReaderView').then((module) => ({ default: module.ReaderView })))

function lightweightBook(book: ReaderBook): ReaderBook {
  if (book.source !== 'local') return book
  return { ...book, content: undefined, data: undefined, textIndex: undefined }
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

export default function App() {
  const [books, setBooks] = useState<ReaderBook[]>(sampleBooks)
  const [marks, setMarks] = useState<ReadingMark[]>([])
  const [groups, setGroups] = useState<BookGroup[]>(loadBookGroups)
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [section, setSection] = useState<LibrarySection>('library')
  const [selectedBook, setSelectedBook] = useState<ReaderBook | null>(null)
  const [initialMark, setInitialMark] = useState<ReadingMark | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [openingBookId, setOpeningBookId] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; percent: number; name: string } | null>(null)
  const localPayloadCache = useRef(new Map<string, LocalBookPayload>())
  const textIndexJobs = useRef(new Map<string, Promise<LocalBookPayload>>())
  const bookMetricsJobs = useRef(new Map<string, Promise<BookContentMetrics | null>>())
  const importAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let isMounted = true
    loadLocalBooks()
      .then((localBooks) => {
        if (isMounted && localBooks.length > 0) {
          setBooks([...localBooks, ...sampleBooks])
          void preIndexLocalTextBooks(localBooks)
        }
      })
      .catch(() => setNotice('读取本地书架失败，可重新导入书籍。'))
    return () => {
      isMounted = false
    }
    // The migration is intentionally mount-only; later imports already contain an index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let isMounted = true
    loadReadingMarks()
      .then((savedMarks) => {
        if (isMounted) setMarks(savedMarks)
      })
      .catch(() => setNotice('读取书签与标注失败，请稍后重试。'))
    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])

  async function openBook(book: ReaderBook, mark: ReadingMark | null = null) {
    if (openingBookId) return
    setOpeningBookId(book.id)
    await yieldToBrowser()

    try {
      let hydratedBook = book
      if (book.source === 'local' && book.content === undefined && book.data === undefined) {
        const storedPayload = localPayloadCache.current.get(book.id) ?? await loadLocalBookPayload(book.id)
        const payload = storedPayload ? await ensureTextPayloadIndex(book, storedPayload) : null
        if (!payload || (book.format === 'epub' ? !payload.data : payload.content === undefined)) {
          throw new Error('missing-book-payload')
        }
        localPayloadCache.current.set(book.id, payload)
        const measuredBook = await ensureBookContentMetrics(book, payload)
        hydratedBook = { ...measuredBook, ...payload }
      }

      const updatedBook = {
        ...hydratedBook,
        lastOpened: Date.now(),
        progress: mark?.progress ?? book.progress
      }
      setInitialMark(mark)
      setSelectedBook(updatedBook)
      setBooks((current) => current.map((item) => item.id === book.id ? lightweightBook(updatedBook) : item))
      if (updatedBook.source === 'local') void saveLocalBookMetadata(updatedBook)
    } catch {
      setNotice('正文载入失败，请重新导入这本书后再试。')
    } finally {
      setOpeningBookId(null)
    }
  }

  async function ensureTextPayloadIndex(book: ReaderBook, payload: LocalBookPayload): Promise<LocalBookPayload> {
    localPayloadCache.current.set(book.id, payload)
    if (book.format === 'epub' || !payload.content || hasCurrentTextBookIndex(payload.textIndex)) return payload

    const activeJob = textIndexJobs.current.get(book.id)
    if (activeJob) return activeJob
    const job = buildTextBookIndexAsync(payload.content)
      .then(async (textIndex) => {
        const indexedPayload = { ...payload, textIndex }
        localPayloadCache.current.set(book.id, indexedPayload)
        await saveLocalBookPayload(book.id, indexedPayload)
        return indexedPayload
      })
      .catch(() => payload)
      .finally(() => textIndexJobs.current.delete(book.id))
    textIndexJobs.current.set(book.id, job)
    return job
  }

  async function measureBookContent(book: ReaderBook, payload: LocalBookPayload): Promise<BookContentMetrics | null> {
    const resolved = resolveBookContentMetrics({ ...book, ...payload })
    if (resolved) return resolved
    if (book.format !== 'epub' || !payload.data) return null

    const activeJob = bookMetricsJobs.current.get(book.id)
    if (activeJob) return activeJob
    const job = import('./utils/epubBookMetrics')
      .then(({ analyzeEpubBook }) => analyzeEpubBook(payload.data!))
      .catch(() => null)
      .finally(() => bookMetricsJobs.current.delete(book.id))
    bookMetricsJobs.current.set(book.id, job)
    return job
  }

  async function ensureBookContentMetrics(book: ReaderBook, payload: LocalBookPayload): Promise<ReaderBook> {
    const metrics = await measureBookContent(book, payload)
    if (!metrics) return book
    const measuredBook = { ...book, ...metrics }
    if (hasBookContentMetrics(book)) return measuredBook

    setBooks((current) => current.map((item) => item.id === book.id ? { ...item, ...metrics } : item))
    setSelectedBook((current) => current?.id === book.id ? { ...current, ...metrics } : current)
    await saveLocalBookMetadata(measuredBook)
    return measuredBook
  }

  async function preIndexLocalTextBooks(localBooks: ReaderBook[]) {
    await yieldToBrowser()
    const candidates = localBooks
      .filter((book) => book.format !== 'epub' || !hasBookContentMetrics(book))
      .sort((left, right) => right.lastOpened - left.lastOpened)
      .slice(0, 3)
    for (const [position, book] of candidates.entries()) {
      const payload = localPayloadCache.current.get(book.id) ?? await loadLocalBookPayload(book.id)
      if (!payload) continue
      const indexedPayload = await ensureTextPayloadIndex(book, payload)
      await ensureBookContentMetrics(book, indexedPayload)
      if (position > 0) localPayloadCache.current.delete(book.id)
      await yieldToBrowser()
    }
  }

  async function importFiles(files: File[]) {
    const supportedFiles = files.filter((file) => isSupportedBook(file.name))
    const rejectedCount = files.length - supportedFiles.length

    if (supportedFiles.length === 0) {
      setNotice('未找到可导入文件，目前支持 EPUB、TXT 与 Markdown。')
      return
    }

    setIsImporting(true)
    const controller = new AbortController()
    importAbortRef.current?.abort()
    importAbortRef.current = controller
    await yieldToBrowser()

    try {
      const importedBooks: ReaderBook[] = []
      for (const [fileIndex, file] of supportedFiles.entries()) {
        setImportProgress({ current: fileIndex + 1, total: supportedFiles.length, percent: 0, name: file.name.replace(/\.[^.]+$/, '') })
        const importedBook = await importBookFile(file, (fileProgress) => {
          const completedShare = (fileIndex / supportedFiles.length) * 100
          const currentShare = fileProgress / supportedFiles.length
          setImportProgress({
            current: fileIndex + 1,
            total: supportedFiles.length,
            percent: Math.round(completedShare + currentShare),
            name: file.name.replace(/\.[^.]+$/, '')
          })
        }, controller.signal)
        await saveLocalBook(importedBook)
        localPayloadCache.current.set(importedBook.id, {
          content: importedBook.content,
          data: importedBook.data,
          textIndex: importedBook.textIndex
        })
        importedBooks.push(importedBook)
        await yieldToBrowser()
      }
      setBooks((currentBooks) => {
        const importedIds = new Set(importedBooks.map((book) => book.id))
        return [...importedBooks.map(lightweightBook), ...currentBooks.filter((book) => !importedIds.has(book.id))]
      })
      setNotice(`已导入 ${importedBooks.length} 本书${rejectedCount ? `，忽略 ${rejectedCount} 个不支持文件` : ''}。`)
      void navigator.storage?.persist?.().catch(() => false)
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === 'AbortError'
        ? '已取消本次导入。'
        : '导入失败，请确认文件没有损坏、格式受支持且不超过 512 MB。')
    } finally {
      setIsImporting(false)
      setImportProgress(null)
      if (importAbortRef.current === controller) importAbortRef.current = null
    }
  }

  function updateProgress(progress: number) {
    if (!selectedBook) return
    const updatedBook = { ...selectedBook, progress }
    setSelectedBook(updatedBook)
    setBooks((current) => current.map((book) => book.id === updatedBook.id ? lightweightBook(updatedBook) : book))
    if (updatedBook.source === 'local') void saveLocalBookMetadata(updatedBook)
  }

  function addMark(draft: ReadingMarkDraft) {
    if (!selectedBook) return
    const mark: ReadingMark = {
      ...draft,
      id: `${selectedBook.id}-${draft.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookId: selectedBook.id,
      createdAt: Date.now()
    }
    setMarks((current) => [mark, ...current])
    void saveReadingMark(mark).catch(() => setNotice('保存阅读记录失败，请稍后重试。'))
    setNotice(draft.kind === 'bookmark' ? '书签已保存到本地。' : '标注已保存到本地。')
  }

  function removeMark(id: string) {
    setMarks((current) => current.filter((mark) => mark.id !== id))
    void deleteReadingMark(id).catch(() => setNotice('删除阅读记录失败，请稍后重试。'))
  }

  function updateMark(mark: ReadingMark) {
    setMarks((current) => current.map((item) => item.id === mark.id ? mark : item))
    void saveReadingMark(mark).catch(() => setNotice('更新标注失败，请稍后重试。'))
    setNotice('标注已更新。')
  }

  function openMark(mark: ReadingMark) {
    const book = books.find((item) => item.id === mark.bookId)
    if (!book) {
      setNotice('这条记录对应的书籍已不在书架中。')
      return
    }
    void openBook(book, mark)
  }

  function createGroup(name: string) {
    const normalizedName = name.trim().slice(0, 40)
    if (!normalizedName) return
    if (groups.some((group) => group.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      setNotice('已经有同名分组了。')
      return
    }
    const group: BookGroup = {
      id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: normalizedName,
      createdAt: Date.now()
    }
    const nextGroups = [...groups, group]
    setGroups(nextGroups)
    saveBookGroups(nextGroups)
    setNotice(`已创建分组“${normalizedName}”。`)
  }

  function renameGroup(id: string, name: string) {
    const normalizedName = name.trim().slice(0, 40)
    if (!normalizedName) return
    if (groups.some((group) => group.id !== id && group.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      setNotice('已经有同名分组了。')
      return
    }
    const nextGroups = groups.map((group) => group.id === id ? { ...group, name: normalizedName } : group)
    setGroups(nextGroups)
    saveBookGroups(nextGroups)
    setNotice(`分组已重命名为“${normalizedName}”。`)
  }

  function deleteGroup(id: string) {
    const group = groups.find((item) => item.id === id)
    if (!group) return
    const nextGroups = groups.filter((item) => item.id !== id)
    const updatedBooks = books.map((book) => {
      if (!book.groupIds?.includes(id)) return book
      const nextGroupIds = book.groupIds.filter((groupId) => groupId !== id)
      return { ...book, groupIds: nextGroupIds.length ? nextGroupIds : undefined }
    })
    setGroups(nextGroups)
    saveBookGroups(nextGroups)
    setBooks(updatedBooks)
    setSelectedBook((current) => {
      if (!current?.groupIds?.includes(id)) return current
      const nextGroupIds = current.groupIds.filter((groupId) => groupId !== id)
      return { ...current, groupIds: nextGroupIds.length ? nextGroupIds : undefined }
    })
    if (activeGroupId === id) setActiveGroupId(null)
    const changedLocalBooks = updatedBooks.filter((book) => book.source === 'local' && books.find((item) => item.id === book.id)?.groupIds?.includes(id))
    void Promise.all(changedLocalBooks.map(saveLocalBookMetadata)).catch(() => setNotice('分组已删除，但部分书籍归属保存失败。'))
    setNotice(`已删除分组“${group.name}”，书籍仍保留在书架。`)
  }

  async function updateLocalBook(book: ReaderBook) {
    const validGroupIds = Array.from(new Set(book.groupIds ?? [])).filter((id) => groups.some((group) => group.id === id))
    const normalizedBook = {
      ...book,
      title: book.title.trim().slice(0, 300),
      author: book.author.trim().slice(0, 300) || '未知作者',
      note: book.note?.trim().slice(0, 2000) || undefined,
      groupIds: validGroupIds.length ? validGroupIds : undefined,
      cover: {
        ...book.cover,
        image: isSafeBookImageDataUrl(book.cover.image) ? book.cover.image : undefined
      },
      readingBackground: normalizeReadingBackground(book.readingBackground)
    }
    setBooks((current) => current.map((item) => item.id === book.id ? lightweightBook(normalizedBook) : item))
    if (selectedBook?.id === book.id) setSelectedBook({ ...selectedBook, ...normalizedBook })
    try {
      await saveLocalBookMetadata(normalizedBook)
      setNotice('书籍信息已更新。')
    } catch {
      setNotice('书籍信息保存失败，请稍后重试。')
    }
  }

  async function removeLocalBook(book: ReaderBook) {
    try {
      await deleteLocalBook(book.id)
      localPayloadCache.current.delete(book.id)
      setBooks((current) => current.filter((item) => item.id !== book.id))
      setMarks((current) => current.filter((mark) => mark.bookId !== book.id))
      if (selectedBook?.id === book.id) setSelectedBook(null)
      setNotice(`已从本地书架删除《${book.title}》。`)
    } catch {
      setNotice('删除书籍失败，请稍后重试。')
    }
  }

  async function exportLibraryBackup() {
    const localBooks = books.filter((book) => book.source === 'local')
    if (localBooks.length === 0) {
      setNotice('本地书架还是空的，导入书籍后即可备份。')
      return
    }
    setNotice('正在整理书架备份…')
    try {
      const { buildLibraryBackup } = await import('./services/libraryBackup')
      const blob = await buildLibraryBackup(localBooks, marks, async (id) => (
        localPayloadCache.current.get(id) ?? await loadLocalBookPayload(id)
      ), loadReaderPreferences(), groups)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `墨简书架备份-${new Date().toISOString().slice(0, 10)}.mojian.zip`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`已备份 ${localBooks.length} 本本地书籍。`)
    } catch {
      setNotice('备份失败，请确认浏览器还有足够的可用空间。')
    }
  }

  async function importLibraryBackup(file: File) {
    setIsImporting(true)
    setNotice('正在校验并恢复书架备份…')
    await yieldToBrowser()
    try {
      const { readLibraryBackup } = await import('./services/libraryBackup')
      const restored = await readLibraryBackup(file)
      const groupIdRemap = new Map<string, string>()
      const appendedGroups: BookGroup[] = []
      for (const restoredGroup of restored.groups) {
        const matchingGroup = groups.find((group) => group.id === restoredGroup.id || group.name.toLocaleLowerCase() === restoredGroup.name.toLocaleLowerCase())
        if (matchingGroup) {
          groupIdRemap.set(restoredGroup.id, matchingGroup.id)
        } else {
          groupIdRemap.set(restoredGroup.id, restoredGroup.id)
          appendedGroups.push(restoredGroup)
        }
      }
      const mergedGroups = normalizeBookGroups([...groups, ...appendedGroups])
      const restoredBooks = restored.books.map((book) => {
        const groupIds = [...new Set(book.groupIds?.map((id) => groupIdRemap.get(id)).filter((id): id is string => Boolean(id)) ?? [])]
        return { ...book, groupIds: groupIds.length ? groupIds : undefined }
      })
      for (const book of restoredBooks) {
        await saveLocalBook(book)
        localPayloadCache.current.set(book.id, { content: book.content, data: book.data, textIndex: book.textIndex })
        await yieldToBrowser()
      }
      for (const mark of restored.marks) await saveReadingMark(mark)
      saveReaderPreferences(restored.preferences)
      setGroups(mergedGroups)
      saveBookGroups(mergedGroups)

      setBooks((current) => {
        const restoredIds = new Set(restoredBooks.map((book) => book.id))
        return [
          ...restoredBooks.map(lightweightBook),
          ...current.filter((book) => !restoredIds.has(book.id))
        ]
      })
      setMarks((current) => {
        const restoredIds = new Set(restored.marks.map((mark) => mark.id))
        return [...restored.marks, ...current.filter((mark) => !restoredIds.has(mark.id))]
      })
      void preIndexLocalTextBooks(restoredBooks)
      void navigator.storage?.persist?.().catch(() => false)
      setNotice(`已恢复 ${restored.books.length} 本书和 ${restored.marks.length} 条阅读记录。`)
    } catch {
      setNotice('恢复失败：备份文件无效、已损坏或版本不受支持。')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      {selectedBook ? (
        <Suspense fallback={<div className="reader-loading" role="status"><span /><strong>正在打开阅读器</strong><small>准备排版与本地阅读记录…</small></div>}>
          <ReaderView
            book={selectedBook}
            marks={marks.filter((mark) => mark.bookId === selectedBook.id)}
            initialMark={initialMark}
            onBack={() => {
              setSelectedBook(null)
              setInitialMark(null)
            }}
            onProgressChange={updateProgress}
            onAddMark={addMark}
            onRemoveMark={removeMark}
            onUpdateMark={updateMark}
            groups={groups}
            onUpdateBook={(book) => { void updateLocalBook(book) }}
          />
        </Suspense>
      ) : (
        <LibraryView
          books={books}
          marks={marks}
          section={section}
          query={query}
          isImporting={isImporting}
          openingBookId={openingBookId}
          groups={groups}
          activeGroupId={activeGroupId}
          importProgress={importProgress}
          onQueryChange={setQuery}
          onSectionChange={setSection}
          onOpenBook={(book) => { void openBook(book) }}
          onOpenMark={openMark}
          onDeleteMark={removeMark}
          onUpdateMark={updateMark}
          onFilesSelected={importFiles}
          onCancelImport={() => importAbortRef.current?.abort()}
          onUpdateBook={(book) => { void updateLocalBook(book) }}
          onDeleteBook={(book) => { void removeLocalBook(book) }}
          onSelectGroup={setActiveGroupId}
          onCreateGroup={createGroup}
          onRenameGroup={renameGroup}
          onDeleteGroup={deleteGroup}
          onExportBackup={() => { void exportLibraryBackup() }}
          onImportBackup={(file) => { void importLibraryBackup(file) }}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </>
  )
}
