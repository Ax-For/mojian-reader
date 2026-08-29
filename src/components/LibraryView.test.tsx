import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sampleBooks } from '../data/sampleBooks'
import type { BookGroup, ReadingMark } from '../types'
import { LibraryView } from './LibraryView'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const bookmark: ReadingMark = {
  id: 'bookmark-1',
  bookId: sampleBooks[0].id,
  kind: 'bookmark',
  location: { type: 'text', value: '3' },
  label: '第一章 清晨的书桌',
  excerpt: '窗帘留了一线，天光顺着桌角慢慢移过来。',
  progress: 35,
  createdAt: new Date('2026-08-23T08:00:00').getTime()
}

const groups: BookGroup[] = [
  { id: 'reread', name: '想重读', createdAt: 1 },
  { id: 'research', name: '资料书', createdAt: 2 }
]

function renderLibrary(overrides: Partial<React.ComponentProps<typeof LibraryView>> = {}) {
  const props: React.ComponentProps<typeof LibraryView> = {
    books: sampleBooks,
    query: '',
    section: 'library',
    marks: [bookmark],
    isImporting: false,
    openingBookId: null,
    groups,
    activeGroupId: null,
    onQueryChange: vi.fn(),
    onSectionChange: vi.fn(),
    onOpenBook: vi.fn(),
    onOpenMark: vi.fn(),
    onDeleteMark: vi.fn(),
    onUpdateBook: vi.fn(),
    onDeleteBook: vi.fn(),
    onSelectGroup: vi.fn(),
    onCreateGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
    onExportBackup: vi.fn(),
    onImportBackup: vi.fn(),
    onFilesSelected: vi.fn(),
    ...overrides
  }
  return { ...render(<LibraryView {...props} />), props }
}

describe('LibraryView interactions', () => {
  it('filters by format and opens a matching book', async () => {
    const user = userEvent.setup()
    const { props } = renderLibrary()

    await user.click(screen.getByRole('button', { name: 'TXT' }))
    const shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开人间草木' })).toBeInTheDocument()
    expect(within(shelf).queryByRole('button', { name: '打开月亮与六便士' })).not.toBeInTheDocument()
    await user.click(within(shelf).getByRole('button', { name: '打开人间草木' }))
    expect(props.onOpenBook).toHaveBeenCalledWith(sampleBooks[0])
  })

  it('passes selected and dropped files to the importer', async () => {
    const user = userEvent.setup()
    const { container, props } = renderLibrary()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const bookFile = new File(['第一章'], '离线阅读.txt', { type: 'text/plain' })

    await user.upload(input, bookFile)
    expect(props.onFilesSelected).toHaveBeenLastCalledWith([bookFile])

    const main = container.querySelector('main')!
    fireEvent.dragEnter(main)
    expect(screen.getByText('松开即可导入')).toBeInTheDocument()
    fireEvent.drop(main, { dataTransfer: { files: [bookFile] } })
    expect(props.onFilesSelected).toHaveBeenLastCalledWith([bookFile])
  })

  it('shows immediate feedback while importing or opening a large local book', () => {
    const { rerender, props } = renderLibrary({ isImporting: true })

    expect(screen.getByRole('button', { name: '正在导入书籍' })).toBeDisabled()
    rerender(<LibraryView {...props} isImporting={false} openingBookId={sampleBooks[0].id} />)
    expect(screen.getAllByRole('button', { name: `正在打开${sampleBooks[0].title}` })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: `正在打开${sampleBooks[0].title}` }).every((button) => button.hasAttribute('disabled'))).toBe(true)
    expect(screen.getAllByText('正在准备正文…')).not.toHaveLength(0)
  })

  it('offers import from the empty state and handles drag exit', async () => {
    const user = userEvent.setup()
    const { container } = renderLibrary({ query: '不存在的书' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    await user.click(screen.getByRole('button', { name: '导入本地文件' }))
    expect(clickSpy).toHaveBeenCalled()

    const main = container.querySelector('main')!
    fireEvent.dragEnter(main)
    fireEvent.dragLeave(main)
    expect(screen.queryByText('松开即可导入')).not.toBeInTheDocument()
  })

  it('opens the reading marks workspace and exposes jump and delete actions', async () => {
    const user = userEvent.setup()
    const { props, rerender } = renderLibrary()

    await user.click(screen.getByRole('button', { name: /书签与标注/ }))
    expect(props.onSectionChange).toHaveBeenCalledWith('marks')

    rerender(<LibraryView {...props} section="marks" />)
    expect(screen.getByRole('heading', { name: '书签与标注' })).toBeInTheDocument()
    expect(screen.getByText('窗帘留了一线，天光顺着桌角慢慢移过来。')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '跳转到第一章 清晨的书桌' }))
    expect(props.onOpenMark).toHaveBeenCalledWith(bookmark)
    await user.click(screen.getByRole('button', { name: '删除第一章 清晨的书桌' }))
    expect(props.onDeleteMark).toHaveBeenCalledWith(bookmark.id)
  })

  it('opens a dedicated reading insights workspace from the primary navigation', async () => {
    const user = userEvent.setup()
    const { props, rerender } = renderLibrary()

    await user.click(screen.getByRole('button', { name: '阅读洞察' }))
    expect(props.onSectionChange).toHaveBeenCalledWith('insights')

    rerender(<LibraryView {...props} section="insights" />)
    expect(screen.getByRole('heading', { name: '阅读洞察' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '读完计划' })).toBeInTheDocument()
  })

  it('switches between library navigation and reading-mark filters', async () => {
    const user = userEvent.setup()
    const { props, rerender } = renderLibrary()

    await user.click(screen.getAllByRole('button', { name: '最近阅读' })[0])
    await user.click(screen.getByRole('button', { name: 'EPUB 书籍' }))
    await user.click(screen.getByRole('button', { name: /我的书架/ }))
    expect(props.onSectionChange).toHaveBeenCalledTimes(3)
    expect(props.onSectionChange).toHaveBeenLastCalledWith('library')

    await user.type(screen.getByRole('searchbox', { name: '搜索书名、作者或备注' }), '草木')
    expect(props.onQueryChange).toHaveBeenCalled()

    rerender(<LibraryView {...props} section="marks" />)
    await user.click(screen.getByRole('button', { name: '标注' }))
    expect(screen.getByText('没有找到匹配的记录')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '全部记录' }))
    expect(screen.getByText(bookmark.excerpt)).toBeInTheDocument()
  })

  it('edits and deletes a local book from its management dialog', async () => {
    const user = userEvent.setup()
    const localBook = { ...sampleBooks[0], id: 'local-manage', source: 'local' as const }
    const { props } = renderLibrary({ books: [localBook] })

    await user.click(screen.getByRole('button', { name: '管理人间草木' }))
    await user.clear(screen.getByRole('textbox', { name: '书名' }))
    await user.type(screen.getByRole('textbox', { name: '书名' }), '新的书名')
    await user.type(screen.getByRole('textbox', { name: '书籍备注' }), '适合周末重读')
    await user.click(screen.getByRole('button', { name: '松林阅读背景' }))
    await user.click(screen.getByRole('button', { name: '保存书籍信息' }))
    expect(props.onUpdateBook).toHaveBeenCalledWith(expect.objectContaining({
      id: localBook.id,
      title: '新的书名',
      note: '适合周末重读',
      readingBackground: { preset: 'sage', image: undefined }
    }))

    await user.click(screen.getByRole('button', { name: '管理人间草木' }))
    await user.click(screen.getByRole('button', { name: '删除书籍' }))
    await user.click(screen.getByRole('button', { name: '确认删除书籍' }))
    expect(props.onDeleteBook).toHaveBeenCalledWith(localBook)
  })

  it('filters the shelf by custom group and manages group lifecycle without touching books', async () => {
    const user = userEvent.setup()
    const groupedBook = { ...sampleBooks[0], id: 'local-grouped', source: 'local' as const, groupIds: ['reread'] }
    const ungroupedBook = { ...sampleBooks[1], id: 'local-ungrouped', source: 'local' as const }
    const { props, rerender } = renderLibrary({ books: [groupedBook, ungroupedBook] })

    await user.click(screen.getByRole('button', { name: '想重读 1 本' }))
    expect(props.onSelectGroup).toHaveBeenCalledWith('reread')

    rerender(<LibraryView {...props} books={[groupedBook, ungroupedBook]} activeGroupId="reread" />)
    const shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开人间草木' })).toBeInTheDocument()
    expect(within(shelf).queryByRole('button', { name: '打开月亮与六便士' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '管理自建分组' }))
    await user.type(screen.getByRole('textbox', { name: '新分组名称' }), '待读')
    await user.click(screen.getByRole('button', { name: '创建分组' }))
    expect(props.onCreateGroup).toHaveBeenCalledWith('待读')

    await user.click(screen.getByRole('button', { name: '重命名想重读' }))
    await user.clear(screen.getByRole('textbox', { name: '重命名分组' }))
    await user.type(screen.getByRole('textbox', { name: '重命名分组' }), '年度重读')
    await user.click(screen.getByRole('button', { name: '保存重命名' }))
    expect(props.onRenameGroup).toHaveBeenCalledWith('reread', '年度重读')

    await user.click(screen.getByRole('button', { name: '删除想重读' }))
    await user.click(screen.getByRole('button', { name: '确认删除想重读' }))
    expect(props.onDeleteGroup).toHaveBeenCalledWith('reread')
  })

  it('assigns a local book to multiple custom groups from its management dialog', async () => {
    const user = userEvent.setup()
    const localBook = { ...sampleBooks[0], id: 'local-groups', source: 'local' as const, groupIds: ['reread'] }
    const { props } = renderLibrary({ books: [localBook] })

    await user.click(screen.getByRole('button', { name: '管理人间草木' }))
    expect(screen.getByRole('button', { name: '想重读分组' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: '资料书分组' }))
    await user.click(screen.getByRole('button', { name: '保存书籍信息' }))

    expect(props.onUpdateBook).toHaveBeenCalledWith(expect.objectContaining({
      id: localBook.id,
      groupIds: ['reread', 'research']
    }))
  })

  it('uploads safe cover art, previews it and rejects active image formats', async () => {
    const user = userEvent.setup()
    const localBook = { ...sampleBooks[0], id: 'local-artwork', source: 'local' as const }
    const { container, props } = renderLibrary({ books: [localBook] })

    await user.click(screen.getByRole('button', { name: '管理人间草木' }))
    const coverInput = container.querySelector('input[data-cover-input]') as HTMLInputElement
    const png = new File(['cover'], 'cover.png', { type: 'image/png' })
    await user.upload(coverInput, png)

    await waitFor(() => expect(screen.getByRole('img', { name: '人间草木封面预览' })).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: '保存书籍信息' }))
    expect(props.onUpdateBook).toHaveBeenCalledWith(expect.objectContaining({
      cover: expect.objectContaining({ image: expect.stringMatching(/^data:image\/png;base64,/) })
    }))

    await user.click(screen.getByRole('button', { name: '管理人间草木' }))
    const svg = new File(['<svg/>'], 'cover.svg', { type: 'image/svg+xml' })
    fireEvent.change(container.querySelector('input[data-cover-input]')!, { target: { files: [svg] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('请选择 JPG、PNG、WebP 或 AVIF 图片。')
  })

  it('includes book notes in library search results', () => {
    const localBook = { ...sampleBooks[0], id: 'local-note', source: 'local' as const, note: '旅行随身书' }
    renderLibrary({ books: [localBook], query: '旅行' })
    expect(screen.getByRole('button', { name: '打开人间草木' })).toBeInTheDocument()
  })

  it('shows chapter and word counts on each shelf book', () => {
    const measuredBook = { ...sampleBooks[0], chapterCount: 12, wordCount: 34567 }
    renderLibrary({ books: [measuredBook] })

    expect(within(screen.getByRole('button', { name: '打开人间草木' })).getByText('12 章 · 3.5 万字')).toBeInTheDocument()
  })

  it('filters books with rule-based smart shelves', async () => {
    const user = userEvent.setup()
    const now = Date.now()
    const reading = { ...sampleBooks[0], id: 'smart-reading', progress: 45, lastOpened: now }
    const finishing = { ...sampleBooks[1], id: 'smart-finishing', progress: 88, lastOpened: now - 60_000 }
    const stalled = { ...sampleBooks[2], id: 'smart-stalled', progress: 24, lastOpened: now - 20 * 24 * 60 * 60_000 }
    const unread = { ...sampleBooks[3], id: 'smart-unread', progress: 0, lastOpened: now }
    const annotated = { ...bookmark, bookId: reading.id }
    renderLibrary({ books: [reading, finishing, stalled, unread], marks: [annotated] })

    await user.click(screen.getByRole('button', { name: '快读完 1 本' }))
    let shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开月亮与六便士' })).toBeInTheDocument()
    expect(within(shelf).queryByRole('button', { name: '打开人间草木' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '搁置较久 1 本' }))
    shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开长夜行' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '有标注 1 本' }))
    shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开人间草木' })).toBeInTheDocument()
  })

  it('turns the continue area into a resume memory card', () => {
    const recentBook = { ...sampleBooks[0], lastOpened: Date.now() }
    localStorage.setItem('mojian-reading-resume-snapshots', JSON.stringify({
      [recentBook.id]: {
        bookId: recentBook.id,
        chapterLabel: '第二章 一段安静的时间',
        excerpt: '好的阅读界面不应该抢走注意力。',
        progress: 64,
        lastReadAt: Date.now() - 3 * 24 * 60 * 60_000
      }
    }))

    renderLibrary({ books: [recentBook] })

    expect(screen.getByText('上次停在 · 第二章 一段安静的时间')).toBeInTheDocument()
    expect(screen.getByText('好的阅读界面不应该抢走注意力。')).toBeInTheDocument()
    expect(screen.getByText('3 天前')).toBeInTheDocument()
  })

  it('exposes complete library backup and restore actions', async () => {
    const user = userEvent.setup()
    const { container, props } = renderLibrary()

    await user.click(screen.getByRole('button', { name: '备份书架' }))
    expect(props.onExportBackup).toHaveBeenCalled()

    const input = container.querySelector('input[data-backup-input]') as HTMLInputElement
    const backup = new File(['zip'], '墨简备份.mojian.zip', { type: 'application/zip' })
    await user.upload(input, backup)
    expect(props.onImportBackup).toHaveBeenCalledWith(backup)
  })

  it('focuses search with Command/Ctrl K and gives recent reading a distinct result set', async () => {
    const user = userEvent.setup()
    renderLibrary()
    const search = screen.getByRole('searchbox', { name: '搜索书名、作者或备注' })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(search).toHaveFocus()
    await user.click(screen.getAllByRole('button', { name: '最近阅读' })[0])

    const shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开人间草木' })).toBeInTheDocument()
    expect(within(shelf).queryByRole('button', { name: '打开关于阅读的札记' })).not.toBeInTheDocument()
  })
})
