import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart3,
  Bookmark,
  BookOpen,
  BookOpenCheck,
  ChevronRight,
  CircleDashed,
  Clock3,
  Download,
  FileText,
  FolderOpen,
  Folders,
  Highlighter,
  Library,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  UploadCloud,
} from 'lucide-react'
import type { BookFormat, BookGroup, LibrarySection, ReaderBook, ReadingMark } from '../types'
import { formatBookContentStats } from '../utils/bookMetrics'
import { BookCover } from './BookCover'
import { BookMetadataDialog } from './BookMetadataDialog'
import { BookGroupManagerDialog } from './BookGroupManagerDialog'
import { ReadingMarksWorkspace } from './ReadingMarksWorkspace'
import { ReadingInsightsWorkspace } from './ReadingInsightsWorkspace'
import {
  buildResumeMemory,
  buildSmartShelves,
  loadReadingResumeSnapshot,
  type SmartShelfId
} from '../services/readingExperience'
import { loadDailyReadingGoal, summarizeReadingActivity } from '../services/readingInsights'
import { loadBookReadingStats } from '../services/readingStats'

type LibraryFilter = 'all' | 'recent' | BookFormat

interface LibraryViewProps {
  books: ReaderBook[]
  marks: ReadingMark[]
  section: LibrarySection
  query: string
  isImporting: boolean
  openingBookId: string | null
  groups: BookGroup[]
  activeGroupId: string | null
  importProgress?: { current: number; total: number; percent: number; name: string } | null
  onQueryChange: (query: string) => void
  onSectionChange: (section: LibrarySection) => void
  onOpenBook: (book: ReaderBook) => void
  onOpenMark: (mark: ReadingMark) => void
  onDeleteMark: (id: string) => void
  onUpdateMark?: (mark: ReadingMark) => void
  onFilesSelected: (files: File[]) => void
  onCancelImport?: () => void
  onUpdateBook?: (book: ReaderBook) => void
  onDeleteBook?: (book: ReaderBook) => void
  onSelectGroup: (id: string | null) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (id: string, name: string) => void
  onDeleteGroup: (id: string) => void
  onExportBackup?: () => void
  onImportBackup?: (file: File) => void
}

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: '全部书籍' },
  { id: 'recent', label: '最近阅读' },
  { id: 'epub', label: 'EPUB' },
  { id: 'txt', label: 'TXT' },
  { id: 'md', label: 'Markdown' }
]

export function LibraryView({
  books,
  marks,
  section,
  query,
  isImporting,
  openingBookId,
  groups,
  activeGroupId,
  importProgress,
  onQueryChange,
  onSectionChange,
  onOpenBook,
  onOpenMark,
  onDeleteMark,
  onUpdateMark,
  onFilesSelected,
  onCancelImport,
  onUpdateBook,
  onDeleteBook,
  onSelectGroup,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onExportBackup,
  onImportBackup
}: LibraryViewProps) {
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [isDragging, setIsDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const [editingBook, setEditingBook] = useState<ReaderBook | null>(null)
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false)
  const [smartShelfId, setSmartShelfId] = useState<SmartShelfId | null>(null)
  const [dailyGoal, setDailyGoal] = useState(loadDailyReadingGoal)

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  const sortedBooks = useMemo(
    () => [...books].sort((a, b) => b.lastOpened - a.lastOpened),
    [books]
  )
  const smartShelves = useMemo(() => buildSmartShelves(books, marks), [books, marks])
  const activeSmartShelf = smartShelves.find((shelf) => shelf.id === smartShelfId) ?? null
  const todayGoal = useMemo(
    () => summarizeReadingActivity(books.map((book) => loadBookReadingStats(book.id)), dailyGoal),
    [books, dailyGoal]
  )

  const filteredBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return sortedBooks.filter((book) => {
      const matchesQuery =
        !normalizedQuery ||
        `${book.title} ${book.author} ${book.note ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'recent' && book.progress > 0) ||
        book.format === filter
      const matchesGroup = !activeGroupId || book.groupIds?.includes(activeGroupId)
      const matchesSmartShelf = !activeSmartShelf || activeSmartShelf.books.some((item) => item.id === book.id)
      return matchesQuery && matchesFilter && matchesGroup && matchesSmartShelf
    })
  }, [activeGroupId, activeSmartShelf, filter, query, sortedBooks])

  const continueBook = sortedBooks.find((book) => book.progress > 0 && book.progress < 100) ?? sortedBooks[0]
  const continueMemory = useMemo(() => continueBook
    ? buildResumeMemory(
        continueBook,
        marks,
        loadReadingResumeSnapshot(continueBook.id)
      )
    : null, [continueBook, marks])
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null

  function chooseFiles() {
    if (isImporting) return
    fileInput.current?.click()
  }

  function showLibrary(nextFilter: LibraryFilter) {
    setFilter(nextFilter)
    setSmartShelfId(null)
    onSelectGroup(null)
    onSectionChange('library')
  }

  function showGroup(id: string) {
    setFilter('all')
    setSmartShelfId(null)
    onSelectGroup(id)
    onSectionChange('library')
  }

  function showSmartShelf(id: SmartShelfId) {
    setFilter('all')
    setSmartShelfId(id)
    onSelectGroup(null)
    onSectionChange('library')
  }

  function showInsights() {
    setSmartShelfId(null)
    onSelectGroup(null)
    onSectionChange('insights')
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDragging(false)
    if (isImporting) return
    onFilesSelected(Array.from(event.dataTransfer.files))
  }

  function openBookManager(book: ReaderBook) {
    setEditingBook(book)
  }

  function closeBookManager() {
    setEditingBook(null)
  }

  return (
    <div className="library-shell">
      <aside className="library-sidebar">
        <div className="brand-lockup" aria-label="墨简本地阅读器">
          <div className="brand-mark"><BookOpen size={21} strokeWidth={1.7} /></div>
          <div>
            <strong>墨简</strong>
            <span>MOJIAN READER</span>
          </div>
        </div>

        <nav className="library-nav" aria-label="书架导航">
          <p className="sidebar-label">书库</p>
          <button
            className={section === 'library' && filter === 'all' && !activeGroupId && !smartShelfId ? 'nav-item nav-item--active' : 'nav-item'}
            type="button"
            onClick={() => showLibrary('all')}
          >
            <Library size={18} />
            我的书架
            <span>{books.length}</span>
          </button>
          <button
            className={section === 'library' && filter === 'recent' ? 'nav-item nav-item--active' : 'nav-item'}
            type="button"
            onClick={() => showLibrary('recent')}
          >
            <Clock3 size={18} />
            最近阅读
          </button>
          <button
            className={section === 'insights' ? 'nav-item nav-item--active' : 'nav-item'}
            type="button"
            onClick={showInsights}
          >
            <BarChart3 size={18} />
            阅读洞察
          </button>
          <button
            className={section === 'marks' ? 'nav-item nav-item--active' : 'nav-item'}
            type="button"
            onClick={() => {
              onSelectGroup(null)
              onSectionChange('marks')
            }}
          >
            <Bookmark size={18} />
            书签与标注
            <span>{marks.length}</span>
          </button>

          <p className="sidebar-label sidebar-label--spaced">智能书架</p>
          <div className="smart-shelf-list">
            {smartShelves.map((shelf) => {
              const Icon = shelf.id === 'reading'
                ? BookOpenCheck
                : shelf.id === 'finishing'
                  ? CircleDashed
                  : shelf.id === 'stalled'
                    ? Clock3
                    : Highlighter
              return (
                <button
                  key={shelf.id}
                  type="button"
                  className={section === 'library' && smartShelfId === shelf.id ? 'nav-item nav-item--active' : 'nav-item'}
                  aria-label={`${shelf.label} ${shelf.books.length} 本`}
                  title={shelf.description}
                  onClick={() => showSmartShelf(shelf.id)}
                >
                  <Icon size={17} />
                  <span className="nav-item__label">{shelf.label}</span>
                  <span>{shelf.books.length}</span>
                </button>
              )
            })}
          </div>

          <div className="sidebar-section-heading">
            <p className="sidebar-label">自建分组</p>
            <button type="button" aria-label="管理自建分组" onClick={() => setIsGroupManagerOpen(true)}><Plus size={14} /></button>
          </div>
          <div className="custom-group-list">
            {groups.map((group) => {
              const count = books.filter((book) => book.groupIds?.includes(group.id)).length
              return (
                <button
                  key={group.id}
                  className={section === 'library' && activeGroupId === group.id ? 'nav-item nav-item--active' : 'nav-item'}
                  type="button"
                  onClick={() => showGroup(group.id)}
                >
                  <Folders size={17} />
                  <span className="nav-item__label">{group.name}</span>
                  <span>{count} 本</span>
                </button>
              )
            })}
            {groups.length === 0 && (
              <button className="nav-item nav-item--empty" type="button" onClick={() => setIsGroupManagerOpen(true)}>
                <Plus size={16} /> 创建第一个分组
              </button>
            )}
          </div>

          <p className="sidebar-label sidebar-label--spaced">本地分类</p>
          <button className="nav-item" type="button" onClick={() => showLibrary('epub')}>
            <FolderOpen size={18} />
            EPUB 书籍
          </button>
          <button className="nav-item" type="button" onClick={() => showLibrary('txt')}>
            <FileText size={18} />
            文本文件
          </button>
        </nav>

        <button
          className="sidebar-reading-goal"
          type="button"
          aria-label={`今日阅读 ${todayGoal.todayMinutes}/${dailyGoal} 分钟`}
          onClick={showInsights}
        >
          <Target size={17} />
          <span>
            <strong>今日 {todayGoal.todayMinutes} / {dailyGoal} 分钟</strong>
            <i><b style={{ width: `${todayGoal.goalProgress}%` }} /></i>
          </span>
        </button>
        <div className="local-note">
          <ShieldCheck size={18} />
          <div>
            <strong>本地优先</strong>
            <span>文件只保留在这台设备</span>
          </div>
        </div>
      </aside>

      <main
        className={`library-main ${isDragging ? 'library-main--dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setIsDragging(false)
        }}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drop-overlay">
            <UploadCloud size={28} />
            <strong>松开即可导入</strong>
            <span>支持 EPUB、TXT 与 Markdown</span>
          </div>
        )}

        <header className="library-header">
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              ref={searchInput}
              type="search"
              aria-label={section === 'marks' ? '搜索书名、章节或标注' : '搜索书名、作者或备注'}
              placeholder={section === 'marks' ? '搜索书名、章节或标注' : '搜索书名、作者或备注'}
              value={query}
              onChange={(event) => {
                if (section === 'insights') onSectionChange('library')
                onQueryChange(event.target.value)
              }}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="header-actions">
            <span className="format-note">EPUB · TXT · MD</span>
            {onExportBackup && (
              <button className="quiet-action header-tool" type="button" onClick={onExportBackup}>
                <Download size={16} />
                备份书架
              </button>
            )}
            {onImportBackup && (
              <button className="quiet-action header-tool" type="button" onClick={() => backupInput.current?.click()}>
                <Upload size={16} />
                恢复备份
              </button>
            )}
            {isImporting && onCancelImport && (
              <button className="quiet-action import-cancel" type="button" onClick={onCancelImport}>取消导入</button>
            )}
            <button
              className="primary-button"
              type="button"
              aria-label={isImporting ? '正在导入书籍' : '导入书籍'}
              aria-busy={isImporting}
              disabled={isImporting}
              onClick={chooseFiles}
            >
              {isImporting ? <LoaderCircle className="loading-spinner" size={17} /> : <Plus size={17} />}
              {isImporting
                ? importProgress
                  ? `${importProgress.current}/${importProgress.total} · ${importProgress.percent}%`
                  : '正在导入…'
                : '导入书籍'}
            </button>
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              disabled={isImporting}
              accept=".epub,.txt,.md,text/plain,text/markdown,application/epub+zip"
              multiple
              onChange={(event) => {
                onFilesSelected(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            {onImportBackup && (
              <input
                ref={backupInput}
                data-backup-input
                className="visually-hidden"
                type="file"
                accept=".zip,.mojian.zip,application/zip"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onImportBackup(file)
                  event.target.value = ''
                }}
              />
            )}
          </div>
        </header>

        {isImporting && importProgress && (
          <div className="import-progress" role="status" aria-label="书籍导入进度">
            <span style={{ width: `${importProgress.percent}%` }} />
            <small>正在处理《{importProgress.name}》</small>
          </div>
        )}

        <div className="library-content">
          {section === 'marks' ? (
            <ReadingMarksWorkspace
              books={books}
              marks={marks}
              query={query}
              onOpenMark={onOpenMark}
              onDeleteMark={onDeleteMark}
              onUpdateMark={onUpdateMark}
            />
          ) : section === 'insights' ? (
            <ReadingInsightsWorkspace
              books={books}
              marks={marks}
              onOpenBook={onOpenBook}
              onOpenMark={onOpenMark}
              dailyGoal={dailyGoal}
              onDailyGoalChange={setDailyGoal}
            />
          ) : (
            <>
          <section className="page-heading">
            <div>
              <p className="eyebrow">{activeGroup ? '自建分组' : activeSmartShelf ? '智能书架' : '本地书库'}</p>
              <h1>{activeGroup?.name ?? activeSmartShelf?.label ?? '我的书架'}</h1>
              <p>{activeGroup
                ? `已收纳 ${filteredBooks.length} 本书，可从书籍管理入口调整归属。`
                : activeSmartShelf
                  ? `${activeSmartShelf.description}，当前共 ${filteredBooks.length} 本。`
                  : '导入、整理并继续阅读存放在设备上的书籍。'}</p>
            </div>
            <div className="sync-status">
              <span />
              已保存到浏览器
            </div>
          </section>

          {continueBook && continueMemory && !activeGroup && !activeSmartShelf && !query && filter === 'all' && (
            <section className="continue-section" aria-labelledby="continue-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">上次读到</p>
                  <h2 id="continue-heading">继续阅读</h2>
                </div>
                <button type="button" className="quiet-action" onClick={() => setFilter('recent')}>
                  阅读记录 <ChevronRight size={16} />
                </button>
              </div>
              <button
                type="button"
                className="continue-book"
                aria-label={openingBookId === continueBook.id ? `正在打开${continueBook.title}` : `继续阅读${continueBook.title}`}
                aria-busy={openingBookId === continueBook.id}
                disabled={Boolean(openingBookId)}
                onClick={() => onOpenBook(continueBook)}
              >
                <BookCover book={continueBook} compact />
                <div className="continue-copy">
                  <span className="book-kicker">{continueBook.format.toUpperCase()} · {continueBook.author}</span>
                  <h3>{continueBook.title}</h3>
                  <span className="continue-location">上次停在 · {continueMemory.chapterLabel}</span>
                  <p className="continue-excerpt">{continueMemory.excerpt}</p>
                  <div className="continue-memory-meta">
                    <time dateTime={new Date(continueMemory.lastReadAt).toISOString()}>{continueMemory.timeLabel}</time>
                    <span>{marks.filter((mark) => mark.bookId === continueBook.id).length} 条阅读记录</span>
                  </div>
                  <div className="progress-track" aria-label={`阅读进度 ${continueBook.progress}%`}>
                    <span style={{ width: `${continueBook.progress}%` }} />
                  </div>
                  <small>已读 {continueBook.progress}%</small>
                </div>
                <span className="continue-cta">
                  {openingBookId === continueBook.id ? <LoaderCircle className="loading-spinner" size={18} /> : <BookOpen size={18} />}
                  {openingBookId === continueBook.id ? '正在准备正文…' : '打开阅读器'}
                </span>
              </button>
            </section>
          )}

          <section className="shelf-section" aria-labelledby="shelf-heading">
            <div className="section-heading section-heading--shelf">
              <div>
                <p className="eyebrow">{filteredBooks.length} 本书</p>
                <h2 id="shelf-heading">{activeGroup ? '分组书籍' : activeSmartShelf ? activeSmartShelf.label : '书架'}</h2>
              </div>
              <div className="filter-tabs" aria-label="书架筛选">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={filter === item.id ? 'filter-tab filter-tab--active' : 'filter-tab'}
                    onClick={() => {
                      setSmartShelfId(null)
                      setFilter(item.id)
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredBooks.length > 0 ? (
              <div className="book-grid" data-testid="book-shelf">
                {filteredBooks.map((book) => (
                  <div className="book-tile-shell" key={book.id}>
                    <button
                      className={openingBookId === book.id ? 'book-tile book-tile--opening' : 'book-tile'}
                      type="button"
                      disabled={Boolean(openingBookId)}
                      onClick={() => onOpenBook(book)}
                      aria-label={openingBookId === book.id ? `正在打开${book.title}` : `打开${book.title}`}
                      aria-busy={openingBookId === book.id}
                    >
                      <BookCover book={book} />
                      {openingBookId === book.id && <span className="book-tile__loading"><LoaderCircle className="loading-spinner" size={15} />正在准备正文…</span>}
                      <span className="book-tile__format">{book.format.toUpperCase()}</span>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                      <div className="book-tile__stats">{formatBookContentStats(book)}</div>
                      <div className="book-tile__meta">
                        <span>{book.progress > 0 ? `${book.progress}%` : '未开始'}</span>
                        <span>{book.sizeLabel}</span>
                      </div>
                    </button>
                    {book.source === 'local' && (onUpdateBook || onDeleteBook) && (
                      <button
                        className="book-manage-button"
                        type="button"
                        aria-label={`管理${book.title}`}
                        onClick={() => openBookManager(book)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-shelf">
                <Sparkles size={24} />
                <h3>{activeGroup ? '这个分组还没有书' : '没有找到匹配的书籍'}</h3>
                <p>{activeGroup ? '从书籍右上角的管理入口添加到此分组。' : '试试其他关键词，或导入一本新书。'}</p>
                <button type="button" className="secondary-button" onClick={chooseFiles}>
                  导入本地文件
                </button>
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </main>
      {editingBook && onUpdateBook && (
        <BookMetadataDialog
          book={editingBook}
          groups={groups}
          onClose={closeBookManager}
          onSave={onUpdateBook}
          onDelete={onDeleteBook}
        />
      )}
      {isGroupManagerOpen && (
        <BookGroupManagerDialog
          groups={groups}
          books={books.filter((book) => book.source === 'local')}
          onClose={() => setIsGroupManagerOpen(false)}
          onCreate={onCreateGroup}
          onRename={onRenameGroup}
          onDelete={onDeleteGroup}
        />
      )}
    </div>
  )
}
