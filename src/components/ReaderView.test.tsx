import { useEffect } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleBooks } from '../data/sampleBooks'
import type { ReaderBook, ReadingMark } from '../types'
import { ReaderView } from './ReaderView'

const renditionMocks = vi.hoisted(() => ({
  prev: vi.fn().mockResolvedValue(undefined),
  next: vi.fn().mockResolvedValue(undefined),
  flow: vi.fn(),
  spread: vi.fn(),
  themeDefault: vi.fn(),
  generate: vi.fn().mockResolvedValue(['epubcfi(/6/2)']),
  cfiFromPercentage: vi.fn((percentage: number) => `epubcfi(${percentage})`),
  percentageFromCfi: vi.fn(() => 0.42)
}))

vi.mock('react-reader', () => ({
  ReactReader: (props: {
    tocChanged: (toc: { label: string; href: string }[]) => void
    locationChanged: (location: string) => void
    getRendition: (rendition: {
      themes: { fontSize: (size: string) => void; default: (style: unknown) => void }
      prev: () => Promise<void>
      next: () => Promise<void>
      flow: (flow: string) => void
      spread: (spread: string) => void
      book: { locations: {
        generate: (chars: number) => Promise<string[]>
        cfiFromPercentage: (percentage: number) => string
        percentageFromCfi: (cfi: string) => number
      } }
    }) => void
    searchQuery?: string
    onSearchResults?: (results: { cfi: string; excerpt: string }[]) => void
  }) => {
    const { getRendition, locationChanged, onSearchResults, searchQuery, tocChanged } = props
    useEffect(() => {
      tocChanged([{ label: '第一节', href: 'chapter-1' }])
      locationChanged('chapter-1')
      getRendition({
        themes: { fontSize: vi.fn(), default: renditionMocks.themeDefault },
        prev: renditionMocks.prev,
        next: renditionMocks.next,
        flow: renditionMocks.flow,
        spread: renditionMocks.spread,
        book: { locations: {
          generate: renditionMocks.generate,
          cfiFromPercentage: renditionMocks.cfiFromPercentage,
          percentageFromCfi: renditionMocks.percentageFromCfi
        } }
      })
      // The mock intentionally fires only once, matching an EPUB engine's initialisation.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    useEffect(() => {
      if (searchQuery) onSearchResults?.([{ cfi: 'epubcfi(/6/2)', excerpt: `命中：${searchQuery}` }])
    }, [onSearchResults, searchQuery])
    return <div data-testid="epub-reader">EPUB reader</div>
  }
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Object.values(renditionMocks).forEach((mock) => mock.mockClear())
})

const savedBookmark: ReadingMark = {
  id: 'bookmark-1',
  bookId: sampleBooks[0].id,
  kind: 'bookmark',
  location: { type: 'text', value: '3' },
  label: '第一章 清晨的书桌',
  excerpt: '窗帘留了一线，天光顺着桌角慢慢移过来。',
  progress: 35,
  createdAt: 100
}

function renderReader(overrides: Partial<React.ComponentProps<typeof ReaderView>> = {}) {
  const props: React.ComponentProps<typeof ReaderView> = {
    book: sampleBooks[0],
    marks: [],
    initialMark: null,
    onBack: vi.fn(),
    onProgressChange: vi.fn(),
    onAddMark: vi.fn(),
    onRemoveMark: vi.fn(),
    ...overrides
  }
  return { ...render(<ReaderView {...props} />), props }
}

describe('ReaderView interactions', () => {
  it('uses a persisted text index instead of rebuilding paragraphs and chapters during open', () => {
    const indexedBook: ReaderBook = {
      ...sampleBooks[0],
      id: 'indexed-long-book',
      content: '这段原始内容不应进入首屏。',
      textIndex: {
        version: 1,
        paragraphs: ['第一章 快速打开', '索引中的首屏正文。', '第二章 继续阅读', '索引中的下一章。'],
        chapters: [
          { title: '第一章 快速打开', paragraphIndex: 0 },
          { title: '第二章 继续阅读', paragraphIndex: 2 }
        ],
        totalReadingUnits: 22
      }
    }

    renderReader({ book: indexedBook })

    expect(document.querySelector('.reader-shell')).toHaveAttribute('data-text-index', 'persisted')
    expect(screen.getByText('索引中的首屏正文。')).toBeInTheDocument()
    expect(screen.queryByText('这段原始内容不应进入首屏。')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /第二章 继续阅读/ })).toBeInTheDocument()
  })

  it('applies the background saved for this book without changing global reader preferences', () => {
    const book: ReaderBook = {
      ...sampleBooks[0],
      readingBackground: {
        preset: 'sage',
        image: 'data:image/png;base64,iVBORw0KGgo='
      }
    }

    const { container } = renderReader({ book })
    const shell = container.querySelector('.reader-shell')
    expect(shell).toHaveAttribute('data-book-background', 'sage')
    expect(shell).toHaveClass('reader-shell--book-background-image')
    expect(shell).toHaveStyle({ '--book-reading-background-image': 'url("data:image/png;base64,iVBORw0KGgo=")' })
  })

  it('shows chapter and word counts in the reading book details', () => {
    renderReader({ book: { ...sampleBooks[0], chapterCount: 12, wordCount: 34567 } })

    expect(screen.getByText('12 章 · 3.5 万字')).toBeInTheDocument()
  })

  it('updates text appearance, theme, bookmark and progress', async () => {
    const user = userEvent.setup()
    const onProgressChange = vi.fn()
    const onBack = vi.fn()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    globalThis.CSS.escape = (value) => value

    const onAddMark = vi.fn()
    const { container } = renderReader({ onBack, onProgressChange, onAddMark })

    await user.click(screen.getByRole('button', { name: '增大字号' }))
    expect(screen.getByRole('article')).toHaveStyle({ fontSize: '22px' })
    await user.click(screen.getByRole('button', { name: '减小字号' }))
    expect(screen.getByRole('article')).toHaveStyle({ fontSize: '20px' })

    await user.click(screen.getByRole('button', { name: '添加书签' }))
    expect(onAddMark).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'bookmark',
      location: expect.objectContaining({ type: 'text' })
    }))
    await user.click(screen.getByRole('button', { name: '米纸' }))
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-theme', 'sepia')
    await user.click(screen.getByRole('button', { name: '夜间' }))
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-theme', 'night')

    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: '72' } })
    fireEvent.change(sliders[1], { target: { value: '2.1' } })
    fireEvent.change(sliders[2], { target: { value: '760' } })
    expect(onProgressChange).toHaveBeenCalledWith(72)
    expect(screen.getByRole('article')).toHaveStyle({ lineHeight: '2.1', maxWidth: '760px' })

    await user.click(screen.getByRole('button', { name: /第一章 清晨的书桌/ }))
    expect(scrollIntoView).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '返回书架' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('renders imported EPUB data and exposes its generated table of contents', async () => {
    const user = userEvent.setup()
    const epubBook: ReaderBook = {
      ...sampleBooks[1],
      id: 'epub-local',
      source: 'local',
      data: new Uint8Array([1, 2, 3]).buffer,
      content: undefined
    }

    renderReader({ book: epubBook })
    expect(await screen.findByTestId('epub-reader')).toBeInTheDocument()
    expect(renditionMocks.themeDefault).toHaveBeenCalledWith(expect.objectContaining({
      p: expect.objectContaining({ 'text-indent': '2em !important' }),
      '::highlight(mojian-reading-sentence)': expect.objectContaining({
        'background-color': expect.any(String)
      }),
      'li > p, blockquote > p, td > p, th > p, figcaption': expect.objectContaining({
        'text-indent': '0 !important'
      })
    }))
    const epubChapter = await screen.findByRole('button', { name: /第一节/ })
    await user.click(epubChapter)
    expect(epubChapter).toHaveAttribute('aria-current', 'location')
    expect(within(epubChapter).getByText('已读 31%')).toBeInTheDocument()
    expect(within(epubChapter).getByText('刚刚')).toBeInTheDocument()
    expect(screen.getByText('1 节')).toBeInTheDocument()
  })

  it('marks body paragraphs for indentation while keeping separators and lists flush', () => {
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'paragraph-layout',
      source: 'local',
      content: '第一章 排版\n\n这是一段需要缩进的正文。\n\n------------\n\n- 这是列表项'
    }

    renderReader({ book })

    expect(screen.getByText('这是一段需要缩进的正文。').closest('p')).toHaveClass('reader-paragraph')
    expect(screen.getByText('------------').closest('p')).toHaveClass('reader-separator')
    expect(screen.getByText('- 这是列表项').closest('p')).toHaveClass('reader-paragraph--flush')
  })

  it('keeps chapter history independent when jumping forward and then back', async () => {
    const user = userEvent.setup()
    const now = new Date(2026, 7, 23, 18, 0).getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderReader()
    const toc = screen.getByRole('navigation', { name: '书籍目录' })
    const firstChapter = within(toc).getByRole('button', { name: /第一章 清晨的书桌/ })
    const currentChapter = within(toc).getByRole('button', { name: /第二章 一段安静的时间/ })
    const nextChapter = within(toc).getByRole('button', { name: /第三章 把书带回本地/ })

    expect(currentChapter).toHaveAttribute('aria-current', 'location')
    const currentProgressLabel = within(currentChapter).getByText(/已读 \d+%/).textContent!
    expect(within(currentChapter).getByText('刚刚')).toBeInTheDocument()
    expect(within(firstChapter).getByText('未开始')).toBeInTheDocument()
    expect(within(firstChapter).getByText('尚未阅读')).toBeInTheDocument()
    expect(within(nextChapter).getByText('未开始')).toBeInTheDocument()

    toc.getBoundingClientRect = vi.fn(() => ({
      top: 0, bottom: 260, left: 0, right: 252, width: 252, height: 260, x: 0, y: 0, toJSON: vi.fn()
    }))
    nextChapter.getBoundingClientRect = vi.fn(() => ({
      top: 420, bottom: 482, left: 0, right: 252, width: 252, height: 62, x: 0, y: 420, toJSON: vi.fn()
    }))

    await user.click(nextChapter)
    await waitFor(() => expect(nextChapter).toHaveAttribute('aria-current', 'location'))
    expect(within(nextChapter).getByText('刚刚')).toBeInTheDocument()
    expect(within(firstChapter).getByText('未开始')).toBeInTheDocument()
    expect(within(firstChapter).getByText('尚未阅读')).toBeInTheDocument()
    expect(within(currentChapter).getByText(currentProgressLabel)).toBeInTheDocument()
    expect(within(currentChapter).getByText('刚刚')).toBeInTheDocument()

    await user.click(firstChapter)
    await waitFor(() => expect(firstChapter).toHaveAttribute('aria-current', 'location'))
    expect(within(currentChapter).getByText(currentProgressLabel)).toBeInTheDocument()
    expect(within(currentChapter).getByText('刚刚')).toBeInTheDocument()
    expect(within(nextChapter).getByText('已开始 · 0%')).toBeInTheDocument()
    expect(within(nextChapter).getByText('刚刚')).toBeInTheDocument()
    expect(localStorage.getItem('mojian-chapter-reading-progress')).toContain(sampleBooks[0].id)
    expect(scrollIntoView).toHaveBeenCalled()
    nowSpy.mockRestore()
  })

  it('returns to explicit reading locations and can move forward again', async () => {
    const user = userEvent.setup()
    Element.prototype.scrollIntoView = vi.fn()
    renderReader()
    const toc = screen.getByRole('navigation', { name: '书籍目录' })
    const firstChapter = within(toc).getByRole('button', { name: /第一章 清晨的书桌/ })
    const thirdChapter = within(toc).getByRole('button', { name: /第三章 把书带回本地/ })
    const back = screen.getByRole('button', { name: '返回上一阅读位置' })
    const forward = screen.getByRole('button', { name: '前往下一阅读位置' })

    expect(back).toBeDisabled()
    expect(forward).toBeDisabled()
    await user.click(thirdChapter)
    await user.click(firstChapter)
    expect(back).toBeEnabled()

    await user.click(back)
    expect(thirdChapter).toHaveAttribute('aria-current', 'location')
    expect(forward).toBeEnabled()
    await user.click(forward)
    expect(firstChapter).toHaveAttribute('aria-current', 'location')

    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true })
    expect(thirdChapter).toHaveAttribute('aria-current', 'location')
    fireEvent.keyDown(window, { key: 'Backspace', ctrlKey: true, shiftKey: true })
    expect(firstChapter).toHaveAttribute('aria-current', 'location')
  })

  it('resizes and remembers the table of contents width with pointer and keyboard controls', async () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
      }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    const { container } = renderReader()
    const shell = container.querySelector<HTMLElement>('.reader-shell')!
    const resizer = screen.getByRole('separator', { name: '调整目录宽度' })
    const setPointerCapture = vi.fn()
    Object.defineProperty(resizer, 'setPointerCapture', { configurable: true, value: setPointerCapture })

    expect(resizer).toHaveAttribute('aria-valuenow', '252')
    expect(shell.style.getPropertyValue('--reader-toc-width')).toBe('252px')

    fireEvent.pointerDown(resizer, { clientX: 252, pointerId: 7 })
    fireEvent.pointerMove(resizer, { clientX: 352, pointerId: 7 })
    fireEvent.pointerUp(resizer, { clientX: 352, pointerId: 7 })

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(resizer).toHaveAttribute('aria-valuenow', '352')
    expect(shell.style.getPropertyValue('--reader-toc-width')).toBe('352px')

    fireEvent.keyDown(resizer, { key: 'ArrowRight' })
    expect(resizer).toHaveAttribute('aria-valuenow', '368')
    await waitFor(() => expect(JSON.parse(localStorage.getItem('mojian-reader-preferences') ?? '{}')).toEqual(
      expect.objectContaining({ tocWidth: 368 })
    ))
  })

  it('shows the full chapter title on hover only when the visible title is truncated', () => {
    const title = '第一章 这是一个需要完整展示的特别长章节名称'
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'long-toc-title',
      progress: 0,
      content: `${title}\n\n这是正文。`
    }

    renderReader({ book })
    const chapterButton = screen.getByRole('button', { name: new RegExp(title) })
    const titleElement = within(chapterButton).getByText(title)
    Object.defineProperty(titleElement, 'clientWidth', { configurable: true, value: 120 })
    Object.defineProperty(titleElement, 'scrollWidth', { configurable: true, value: 360 })
    titleElement.getBoundingClientRect = vi.fn(() => ({
      top: 180, bottom: 198, left: 44, right: 164, width: 120, height: 18, x: 44, y: 180, toJSON: vi.fn()
    }))

    fireEvent.mouseEnter(chapterButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent(title)

    fireEvent.mouseLeave(chapterButton)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders Markdown headings, lists, quotes and code as semantic reading blocks', () => {
    const book: ReaderBook = {
      ...sampleBooks[3],
      id: 'markdown-reading',
      source: 'local',
      content: '# 第一章 Markdown\n\n普通 **正文**。\n\n> 引用内容\n\n- 列表项目\n\n```ts\nconst safe = true\n```'
    }

    const { container } = renderReader({ book })

    expect(screen.getByRole('heading', { name: '第一章 Markdown' })).toHaveClass('reader-markdown-heading')
    expect(screen.getByText('普通 正文。').closest('p')).toHaveClass('reader-paragraph')
    expect(screen.getByText('引用内容').closest('blockquote')).toHaveClass('reader-markdown-quote')
    expect(screen.getByText('列表项目').closest('p')).toHaveClass('reader-markdown-list-item')
    expect(container.querySelector('pre.reader-markdown-code')).toHaveTextContent('const safe = true')
  })

  it('highlights one sentence at a time without changing paragraph-level navigation', async () => {
    const user = userEvent.setup()
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'sentence-reading',
      source: 'local',
      content: '第一章 逐句阅读\n\n第一句话。第二句话！第三句话？'
    }

    const { container } = renderReader({ book })
    const paragraph = screen.getByText('第一句话。', { exact: true }).closest('p')
    expect(paragraph).not.toBeNull()
    expect(within(paragraph!).getAllByText(/第[一二三]句话/)).toHaveLength(3)
    expect(paragraph).toHaveAttribute('data-paragraph-index', '1')

    await user.click(screen.getByRole('button', { name: '开始自动滚动' }))
    const highlightedSentence = container.querySelector<HTMLElement>('.auto-reading-sentence')
    expect(highlightedSentence).toHaveAttribute('data-sentence-key', '1:0')
    expect(highlightedSentence?.closest('p')).not.toHaveClass('auto-reading-focus')
  })

  it('jumps from the in-reader marks list to a saved text location', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderReader({ marks: [savedBookmark], initialMark: savedBookmark })

    expect(scrollIntoView).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /阅读记录/ }))
    await user.click(screen.getByRole('button', { name: '跳转到第一章 清晨的书桌' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('creates an annotation at the current reading location', async () => {
    const user = userEvent.setup()
    const { props } = renderReader()

    await user.click(screen.getByRole('button', { name: '添加标注' }))
    await user.click(screen.getByRole('button', { name: '关闭标注' }))
    expect(screen.queryByRole('textbox', { name: '标注内容' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '添加标注' }))
    await user.type(screen.getByRole('textbox', { name: '标注内容' }), '这里写得很好')
    await user.click(screen.getByRole('button', { name: '保存标注' }))

    expect(props.onAddMark).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'annotation',
      note: '这里写得很好'
    }))
  })

  it('captures a text selection, persists its exact range and reopens the highlight for editing', async () => {
    const user = userEvent.setup()
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'selection-annotation',
      source: 'local',
      content: '第一章 选择标注\n\n山风吹过书页，灯影轻轻摇动。'
    }
    const onAddMark = vi.fn()
    const { rerender } = renderReader({ book, onAddMark })
    const sentence = screen.getByText('山风吹过书页，灯影轻轻摇动。', { exact: true })
    const textNode = sentence.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 6)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)

    await user.click(screen.getByRole('button', { name: '添加标注' }))
    await user.type(screen.getByRole('textbox', { name: '标注内容' }), '注意这一句')
    await user.click(screen.getByRole('button', { name: 'coral标注颜色' }))
    await user.click(screen.getByRole('button', { name: '保存标注' }))

    expect(onAddMark).toHaveBeenCalledWith(expect.objectContaining({
      excerpt: '山风吹过书页',
      color: 'coral',
      location: { type: 'text', value: '1' },
      selection: { paragraphIndex: 1, start: 0, end: 6, exact: '山风吹过书页' }
    }))

    const saved: ReadingMark = {
      ...onAddMark.mock.calls[0][0],
      id: 'selected-mark',
      bookId: book.id,
      createdAt: 100
    }
    const onUpdateMark = vi.fn()
    rerender(<ReaderView book={book} marks={[saved]} initialMark={null} onBack={vi.fn()} onProgressChange={vi.fn()} onAddMark={vi.fn()} onRemoveMark={vi.fn()} onUpdateMark={onUpdateMark} />)
    const highlight = screen.getByRole('button', { name: '编辑标注：山风吹过书页' })
    expect(highlight).toHaveClass('reader-annotation-highlight--coral')
    await user.click(highlight)
    await user.clear(screen.getByRole('textbox', { name: '标注内容' }))
    await user.type(screen.getByRole('textbox', { name: '标注内容' }), '修改后的想法')
    await user.click(screen.getByRole('button', { name: '保存修改' }))
    expect(onUpdateMark).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id, note: '修改后的想法' }))
  })

  it('searches text and jumps to a matching paragraph', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderReader()
    scrollIntoView.mockClear()

    await user.click(screen.getByRole('button', { name: '书内搜索' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索关键词' }), '阅读界面')
    const searchPanel = screen.getByRole('dialog', { name: '书内搜索面板' })
    expect(within(searchPanel).getByText(/好的阅读界面不应该抢走注意力/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /跳转到搜索结果/ }))
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('keeps every text occurrence in a persistent result rail and switches between them', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const repeatedMatches = [
      ...Array.from({ length: 73 }, (_, index) => `第 ${index + 1} 处星光落在书页上。`),
      '最后一段有星光，也有另一处星光。'
    ]
    const repeatedBook: ReaderBook = {
      ...sampleBooks[0],
      id: 'many-search-results',
      progress: 0,
      content: ['第一章 搜索边界', ...repeatedMatches].join('\n\n')
    }

    renderReader({ book: repeatedBook })
    await user.click(screen.getByRole('button', { name: '书内搜索' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索关键词' }), '星光')

    const resultRail = screen.getByRole('dialog', { name: '书内搜索面板' })
    const results = within(resultRail).getAllByRole('button', { name: /跳转到搜索结果/ })
    expect(results.length).toBeLessThanOrEqual(40)
    expect(within(resultRail).getByText('找到 75 处结果')).toBeInTheDocument()

    await user.click(within(resultRail).getByRole('button', { name: '跳转到搜索结果 10' }))
    expect(resultRail).toBeInTheDocument()
    expect(within(resultRail).getByRole('button', { name: '跳转到搜索结果 10' })).toHaveAttribute('aria-current', 'location')

    await user.click(within(resultRail).getByRole('button', { name: '下一个搜索结果' }))
    expect(within(resultRail).getByRole('button', { name: '跳转到搜索结果 11' })).toHaveAttribute('aria-current', 'location')
    await user.click(within(resultRail).getByRole('button', { name: '上一个搜索结果' }))
    expect(within(resultRail).getByRole('button', { name: '跳转到搜索结果 10' })).toHaveAttribute('aria-current', 'location')
  })

  it('virtualizes thousands of search hits while preserving the complete result count', async () => {
    const user = userEvent.setup()
    const repeatedText = Array.from({ length: 2_000 }, (_, index) => (
      `第${index + 1}章 测试\n这是第 ${index + 1} 个重复关键词。`
    )).join('\n')
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'virtual-search',
      source: 'local',
      progress: 0,
      content: repeatedText
    }

    renderReader({ book })
    await user.click(screen.getByRole('button', { name: '书内搜索' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索关键词' }), '重复关键词')

    expect(await screen.findByText('找到 2000 处结果')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /跳转到搜索结果/ }).length).toBeLessThanOrEqual(40)
  })

  it('renders a bounded paragraph window for very large novels and searches every chapter', async () => {
    const user = userEvent.setup()
    Element.prototype.scrollIntoView = vi.fn()
    const longContent = Array.from({ length: 1_800 }, (_, index) => (
      `第${index + 1}章 山水之间 ${index + 1}\n这是第 ${index + 1} 章的正文段落，用于验证长篇小说。`
    )).join('\n')
    const longBook: ReaderBook = {
      ...sampleBooks[0],
      id: 'very-large-local-novel',
      title: '长篇测试小说',
      source: 'local',
      progress: 60,
      fileSize: longContent.length * 2,
      sizeLabel: '8.4 MB',
      content: longContent
    }
    const { container } = renderReader({ book: longBook })

    expect(screen.getByText(/长篇优化/)).toBeInTheDocument()
    expect(container.querySelectorAll('[data-paragraph-index]').length).toBeLessThanOrEqual(180)
    const virtualToc = screen.getByRole('navigation', { name: '书籍目录' })
    expect(within(virtualToc).getAllByRole('button').length).toBeLessThanOrEqual(50)
    expect(virtualToc.scrollTop).toBeGreaterThan(0)
    expect(virtualToc.querySelector('[aria-current="location"]')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '继续下一段' }))
    expect(screen.getByRole('button', { name: '加载上一段' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '加载上一段' }))

    await user.type(screen.getByRole('searchbox', { name: '搜索目录' }), '第1799章')
    expect(screen.getByText('1 / 1800 节')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /第1章 山水之间/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /第1799章 山水之间/ }))

    expect(await screen.findByRole('heading', { name: '第1799章 山水之间 1799' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-paragraph-index]').length).toBeLessThanOrEqual(180)
  })

  it('paginates text, seeks by progress and switches complete reading settings', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { container } = renderReader()

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await user.click(screen.getByRole('button', { name: '上一页' }))
    expect(scrollIntoView).toHaveBeenCalled()

    fireEvent.change(screen.getByRole('slider', { name: '阅读进度' }), { target: { value: '25' } })
    expect(scrollIntoView).toHaveBeenCalled()

    await user.selectOptions(screen.getByRole('combobox', { name: '阅读字体' }), 'sans')
    expect(screen.getByRole('article')).toHaveAttribute('data-font', 'sans')
    await user.click(screen.getByRole('button', { name: '双页' }))
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-layout', 'double')
    await user.click(screen.getByRole('button', { name: '连续' }))
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-layout', 'continuous')

    await user.click(screen.getByRole('button', { name: '收起阅读设置' }))
    expect(screen.queryByText('护眼提示')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开阅读设置' }))
    expect(screen.getByText('护眼提示')).toBeInTheDocument()
  })

  it('opens a functional more menu and returns to the beginning', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderReader()

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '导出阅读记录' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '全屏阅读' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: '回到书首' }))
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('edits local book metadata from the reading details menu', async () => {
    const user = userEvent.setup()
    const onUpdateBook = vi.fn()
    const localBook: ReaderBook = {
      ...sampleBooks[0],
      id: 'local-reader-metadata',
      source: 'local',
      note: '初次阅读'
    }
    renderReader({ book: localBook, onUpdateBook })

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(screen.getByRole('menuitem', { name: '编辑书籍信息' }))

    const dialog = screen.getByRole('dialog', { name: '编辑书籍资料' })
    expect(dialog).toBeInTheDocument()
    await user.clear(within(dialog).getByRole('textbox', { name: '书名' }))
    await user.type(within(dialog).getByRole('textbox', { name: '书名' }), '阅读页修改后的书名')
    await user.clear(within(dialog).getByRole('textbox', { name: '书籍备注' }))
    await user.type(within(dialog).getByRole('textbox', { name: '书籍备注' }), '从阅读详情页维护')
    await user.click(within(dialog).getByRole('button', { name: '松林阅读背景' }))
    await user.click(within(dialog).getByRole('button', { name: '保存书籍信息' }))

    expect(onUpdateBook).toHaveBeenCalledWith(expect.objectContaining({
      id: localBook.id,
      title: '阅读页修改后的书名',
      note: '从阅读详情页维护',
      content: localBook.content,
      readingBackground: { preset: 'sage', image: undefined }
    }))
    expect(screen.queryByRole('dialog', { name: '编辑书籍资料' })).not.toBeInTheDocument()
  })

  it('toggles a pointer-following reading ruler from the menu and shortcut', async () => {
    class TestPointerEvent extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 0
      }
    }
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    const user = userEvent.setup()
    const { container } = renderReader()
    const canvas = container.querySelector('.reading-canvas') as HTMLDivElement
    canvas.getBoundingClientRect = vi.fn(() => ({
      top: 100, bottom: 700, left: 252, right: 1100, width: 848, height: 600, x: 252, y: 100, toJSON: vi.fn()
    }))

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    const rulerToggle = screen.getByRole('menuitem', { name: '开启阅读标尺' })
    expect(rulerToggle).toHaveAttribute('aria-pressed', 'false')
    await user.click(rulerToggle)
    expect(screen.getByTestId('reading-ruler')).toBeInTheDocument()

    fireEvent.pointerMove(canvas, { clientY: 460 })
    expect(screen.getByTestId('reading-ruler-band')).toHaveStyle({ top: '60%' })
    fireEvent.keyDown(window, { key: 'r' })
    expect(screen.queryByTestId('reading-ruler')).not.toBeInTheDocument()
  })

  it('runs fullscreen and reading-record export actions from the more menu', async () => {
    const user = userEvent.setup()
    const requestFullscreen = vi.fn().mockResolvedValue(undefined)
    const createObjectURL = vi.fn(() => 'blob:reading-records')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    renderReader({ marks: [savedBookmark] })

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(screen.getByRole('menuitem', { name: '全屏阅读' }))
    expect(requestFullscreen).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(screen.getByRole('menuitem', { name: '导出阅读记录' }))
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(anchorClick).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:reading-records')
  })

  it('applies built-in reading profiles and saves the current appearance as a local profile', async () => {
    const user = userEvent.setup()
    const { container } = renderReader()

    await user.selectOptions(screen.getByRole('combobox', { name: '阅读方案' }), 'longform')
    expect(screen.getByRole('article')).toHaveStyle({ fontSize: '22px', lineHeight: '2.05', maxWidth: '720px' })
    expect(container.querySelector('.reader-shell')).toHaveAttribute('data-theme', 'sepia')

    await user.click(screen.getByRole('button', { name: '增大字号' }))
    await user.type(screen.getByRole('textbox', { name: '新方案名称' }), '我的长篇')
    await user.click(screen.getByRole('button', { name: '保存当前方案' }))
    const customProfileOption = screen.getByRole('option', { name: '我的长篇' })
    expect(customProfileOption).toBeInTheDocument()
    expect(localStorage.getItem('mojian-reader-profiles')).toContain('我的长篇')
    await user.click(screen.getByRole('button', { name: '删除当前方案' }))
    expect(screen.queryByRole('option', { name: '我的长篇' })).not.toBeInTheDocument()
  })

  it('shows quick actions for selected text and keeps the exact range for annotation', async () => {
    const user = userEvent.setup()
    const book: ReaderBook = {
      ...sampleBooks[0],
      id: 'selection-tools',
      source: 'local',
      content: '第一章 选择工具\n\n山风吹过书页，灯影轻轻摇动。'
    }
    const writeText = vi.fn().mockResolvedValue(undefined)
    const open = vi.fn()
    let spokenUtterance: MockSelectionUtterance | null = null
    class MockSelectionUtterance {
      lang = ''
      rate = 1
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const speech = {
      speak: vi.fn((utterance: MockSelectionUtterance) => { spokenUtterance = utterance }),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn()
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('open', open)
    vi.stubGlobal('speechSynthesis', speech)
    vi.stubGlobal('SpeechSynthesisUtterance', MockSelectionUtterance)
    const { container, props } = renderReader({ book })
    const sentence = screen.getByText('山风吹过书页，灯影轻轻摇动。', { exact: true })
    const textNode = sentence.firstChild!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, 6)
    const rangeBounds = vi.fn(() => ({
      top: 200, bottom: 222, left: 400, right: 480, width: 80, height: 22, x: 400, y: 200, toJSON: vi.fn()
    }))
    Object.defineProperty(range, 'getBoundingClientRect', { configurable: true, value: rangeBounds })
    function selectAgain() {
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      fireEvent.mouseUp(sentence)
    }

    selectAgain()
    const tools = screen.getByRole('toolbar', { name: '选中文本工具' })
    expect(within(tools).getByText('山风吹过书页')).toBeInTheDocument()
    expect(tools).toHaveStyle({ left: '440px', top: '200px' })
    rangeBounds.mockReturnValue({
      top: 260, bottom: 282, left: 520, right: 600, width: 80, height: 22, x: 520, y: 260, toJSON: vi.fn()
    })
    fireEvent.scroll(container.querySelector('.reading-canvas')!)
    await waitFor(() => expect(tools).toHaveStyle({ left: '560px', top: '260px' }))
    await user.click(within(tools).getByRole('button', { name: '复制选中文本' }))
    expect(writeText).toHaveBeenCalledWith('山风吹过书页')

    selectAgain()
    await user.click(screen.getByRole('button', { name: '带出处复制' }))
    expect(writeText).toHaveBeenLastCalledWith('“山风吹过书页”\n——《人间草木》，排版演示 · 第一章 选择工具')
    expect(screen.getByRole('status')).toHaveTextContent('已复制正文与出处')

    selectAgain()
    await user.click(screen.getByRole('button', { name: '标注选中文本' }))
    await user.type(screen.getByRole('textbox', { name: '标注内容' }), '快捷标注')
    await user.click(screen.getByRole('button', { name: '保存标注' }))
    expect(props.onAddMark).toHaveBeenCalledWith(expect.objectContaining({
      excerpt: '山风吹过书页',
      selection: { paragraphIndex: 1, start: 0, end: 6, exact: '山风吹过书页' }
    }))

    selectAgain()
    await user.click(screen.getByRole('button', { name: '查询选中文本' }))
    expect(open).toHaveBeenCalledWith(expect.stringContaining('wiktionary.org'), '_blank', 'noopener,noreferrer')

    selectAgain()
    await user.click(screen.getByRole('button', { name: '翻译选中文本' }))
    expect(open).toHaveBeenCalledWith(expect.stringContaining('translate.google.com'), '_blank', 'noopener,noreferrer')

    selectAgain()
    await user.click(screen.getByRole('button', { name: '关闭选中文本工具' }))
    expect(screen.queryByRole('toolbar', { name: '选中文本工具' })).not.toBeInTheDocument()

    selectAgain()
    await user.click(screen.getByRole('button', { name: '朗读选中文本' }))
    expect(speech.speak).toHaveBeenCalled()
    act(() => spokenUtterance?.onend?.())

    selectAgain()
    await user.click(screen.getByRole('button', { name: '朗读选中文本' }))
    act(() => spokenUtterance?.onerror?.())
  })

  it('presents local reading statistics and a remaining-time estimate', async () => {
    const user = userEvent.setup()
    localStorage.setItem('mojian-reading-statistics', JSON.stringify({
      [sampleBooks[0].id]: {
        bookId: sampleBooks[0].id,
        totalReadingMs: 15 * 60_000,
        sessionCount: 2,
        lastReadAt: Date.now(),
        trackingStartedProgress: 0,
        lastProgress: 25,
        dailyReadingMs: { '2026-08-23': 15 * 60_000 }
      }
    }))
    renderReader({ book: { ...sampleBooks[0], progress: 25 } })

    await user.click(screen.getByRole('button', { name: '更多操作' }))
    await user.click(screen.getByRole('menuitem', { name: '阅读统计' }))
    const dialog = screen.getByRole('dialog', { name: '阅读统计' })
    expect(within(dialog).getByText('15 分钟')).toBeInTheDocument()
    expect(within(dialog).getByText('约 45 分钟')).toBeInTheDocument()
    expect(within(dialog).getByText('数据仅保存在当前浏览器')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '关闭阅读统计' }))
    expect(screen.queryByRole('dialog', { name: '阅读统计' })).not.toBeInTheDocument()
  })

  it('supports browser speech narration with sentence focus, pause, resume and adjustable rate', async () => {
    const user = userEvent.setup()
    const voices = [
      { default: true, lang: 'zh-CN', localService: true, name: '晓晓', voiceURI: 'voice-xiaoxiao' },
      { default: false, lang: 'zh-CN', localService: false, name: '云希', voiceURI: 'voice-yunxi' }
    ] as SpeechSynthesisVoice[]
    const speech = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => voices),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
    class MockUtterance {
      text: string
      lang = ''
      rate = 1
      voice: SpeechSynthesisVoice | null = null
      onboundary: ((event: { charIndex: number }) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) { this.text = text }
    }
    vi.stubGlobal('speechSynthesis', speech)
    vi.stubGlobal('SpeechSynthesisUtterance', MockUtterance)
    const { container } = renderReader()

    await waitFor(() => expect(screen.getByRole('combobox', { name: '本书朗读声音' })).toHaveValue(''))
    await user.selectOptions(screen.getByRole('combobox', { name: '本书朗读声音' }), 'voice-yunxi')
    expect(localStorage.getItem('mojian-book-speech-voices')).toContain(sampleBooks[0].id)
    expect(localStorage.getItem('mojian-book-speech-voices')).toContain('voice-yunxi')
    await user.click(screen.getByRole('button', { name: '试听当前声音' }))
    expect(speech.speak).toHaveBeenLastCalledWith(expect.objectContaining({ voice: voices[1], lang: 'zh-CN' }))

    await user.click(screen.getByRole('button', { name: '开始语音朗读' }))
    expect(speech.speak).toHaveBeenLastCalledWith(expect.objectContaining({ voice: voices[1], lang: 'zh-CN' }))
    const controller = screen.getByRole('region', { name: '语音朗读控制' })
    expect(within(controller).getByText('正在朗读')).toBeInTheDocument()
    expect(within(controller).getByText('云希')).toBeInTheDocument()
    expect(container.querySelector('.auto-reading-sentence')).toBeInTheDocument()

    await user.click(within(controller).getByRole('button', { name: '暂停语音朗读' }))
    expect(speech.pause).toHaveBeenCalled()
    expect(within(controller).getByText('已暂停')).toBeInTheDocument()
    await user.click(within(controller).getByRole('button', { name: '继续语音朗读' }))
    expect(speech.resume).toHaveBeenCalled()

    fireEvent.change(within(controller).getByRole('slider', { name: '语音朗读速度' }), { target: { value: '1.8' } })
    expect(speech.cancel).toHaveBeenCalled()
    await user.click(within(controller).getByRole('button', { name: '关闭语音朗读' }))
    expect(screen.queryByRole('region', { name: '语音朗读控制' })).not.toBeInTheDocument()
  })

  it('turns pages from the keyboard without hijacking form fields', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderReader()
    scrollIntoView.mockClear()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    const search = screen.getByRole('searchbox', { name: '搜索目录' })
    fireEvent.keyDown(search, { key: 'ArrowRight' })
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('auto-scrolls text, highlights the reading focus and supports speed and playback controls', async () => {
    const user = userEvent.setup()
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { container, props } = renderReader()
    const canvas = container.querySelector<HTMLDivElement>('.reading-canvas')!
    Object.defineProperties(canvas, {
      scrollTop: { value: 0, configurable: true, writable: true },
      scrollHeight: { value: 2200, configurable: true },
      clientHeight: { value: 600, configurable: true }
    })
    canvas.getBoundingClientRect = vi.fn(() => ({
      top: 0, bottom: 600, left: 0, right: 900, width: 900, height: 600, x: 0, y: 0, toJSON: vi.fn()
    }))
    canvas.querySelectorAll<HTMLElement>('[data-paragraph-index]').forEach((paragraph, index) => {
      paragraph.getBoundingClientRect = vi.fn(() => ({
        top: index * 120 - canvas.scrollTop,
        bottom: index * 120 + 90 - canvas.scrollTop,
        left: 80,
        right: 760,
        width: 680,
        height: 90,
        x: 80,
        y: index * 120 - canvas.scrollTop,
        toJSON: vi.fn()
      }))
    })

    await user.click(screen.getByRole('button', { name: '开始自动滚动' }))
    const controls = screen.getByRole('region', { name: '自动滚动控制' })
    expect(within(controls).getByText('正在阅读')).toBeInTheDocument()
    expect(screen.getByRole('article').querySelector('[aria-current="true"]')).toBeInTheDocument()

    act(() => animationFrames.shift()?.(16))
    expect(canvas.scrollTop).toBeGreaterThan(0)

    const paragraphBoundsMocks = Array.from(canvas.querySelectorAll<HTMLElement>('[data-paragraph-index]'))
      .map((paragraph) => vi.mocked(paragraph.getBoundingClientRect))
    expect(paragraphBoundsMocks.reduce((total, mock) => total + mock.mock.calls.length, 0)).toBeLessThanOrEqual(5)
    paragraphBoundsMocks.forEach((mock) => mock.mockClear())
    const settledTime = Date.now() + 2_000
    vi.spyOn(Date, 'now').mockReturnValue(settledTime)
    fireEvent.scroll(canvas)
    expect(paragraphBoundsMocks.reduce((total, mock) => total + mock.mock.calls.length, 0)).toBe(0)

    vi.mocked(props.onProgressChange).mockClear()
    canvas.scrollTop = 360
    act(() => animationFrames.shift()?.(160))
    expect(props.onProgressChange).toHaveBeenCalled()

    const speedSlider = within(controls).getByRole('slider', { name: '自动滚动速度' })
    expect(speedSlider).toHaveAttribute('max', '8')
    expect(within(controls).getByText('最高 8×')).toBeInTheDocument()
    fireEvent.change(speedSlider, { target: { value: '8' } })
    expect(within(controls).getByText('8×')).toBeInTheDocument()
    expect(within(controls).getByRole('button', { name: '提高自动滚动速度' })).toBeDisabled()
    await user.click(within(controls).getByRole('button', { name: '降低自动滚动速度' }))
    expect(within(controls).getByText('7.5×')).toBeInTheDocument()
    fireEvent.change(speedSlider, { target: { value: '2.5' } })
    expect(within(controls).getByText('2.5×')).toBeInTheDocument()

    const highlightedBeforePause = screen.getByRole('article').querySelector<HTMLElement>('[aria-current="true"]')
      ?.dataset.sentenceKey
    await user.click(within(controls).getByRole('button', { name: '暂停自动滚动' }))
    expect(within(controls).getByText('已暂停')).toBeInTheDocument()
    fireEvent.scroll(canvas)
    expect(screen.getByRole('article').querySelector<HTMLElement>('[aria-current="true"]')?.dataset.sentenceKey)
      .toBe(highlightedBeforePause)
    expect(within(controls).getByRole('button', { name: '恢复自动滚动' })).toBeInTheDocument()
    await user.click(within(controls).getByRole('button', { name: '恢复自动滚动' }))
    expect(within(controls).getByText('正在阅读')).toBeInTheDocument()

    fireEvent.wheel(canvas)
    expect(within(controls).getByText('已暂停')).toBeInTheDocument()
    await user.click(within(controls).getByRole('button', { name: '关闭自动滚动' }))
    expect(screen.queryByRole('region', { name: '自动滚动控制' })).not.toBeInTheDocument()
    expect(screen.getByRole('article').querySelector('[aria-current="true"]')).not.toBeInTheDocument()
  })

  it('switches EPUB books to continuous layout before auto-scrolling', async () => {
    const user = userEvent.setup()
    const epubBook: ReaderBook = {
      ...sampleBooks[1],
      id: 'epub-auto-scroll',
      source: 'local',
      data: new Uint8Array([1, 2, 3]).buffer,
      content: undefined
    }
    const { container } = renderReader({ book: epubBook })

    await user.click(screen.getByRole('button', { name: '双页' }))
    renditionMocks.flow.mockClear()
    renditionMocks.spread.mockClear()
    await user.click(screen.getByRole('button', { name: '开始自动滚动' }))

    await waitFor(() => expect(container.querySelector('.reader-shell')).toHaveAttribute('data-layout', 'continuous'))
    expect(renditionMocks.flow).toHaveBeenCalledWith('scrolled-doc')
    expect(renditionMocks.spread).toHaveBeenCalledWith('none')
    expect(screen.getByRole('region', { name: '自动滚动控制' })).toBeInTheDocument()
  })

  it('uses the EPUB engine for search, page turns, layout and progress seeking', async () => {
    const user = userEvent.setup()
    const epubBook: ReaderBook = {
      ...sampleBooks[1],
      id: 'epub-interactions',
      source: 'local',
      data: new Uint8Array([1, 2, 3]).buffer,
      content: undefined
    }
    renderReader({ book: epubBook })

    await user.click(screen.getByRole('button', { name: '下一页' }))
    await user.click(screen.getByRole('button', { name: '上一页' }))
    expect(renditionMocks.next).toHaveBeenCalled()
    expect(renditionMocks.prev).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '双页' }))
    expect(renditionMocks.spread).toHaveBeenCalledWith('always')

    fireEvent.change(screen.getByRole('slider', { name: '阅读进度' }), { target: { value: '50' } })
    expect(renditionMocks.cfiFromPercentage).toHaveBeenCalledWith(0.5)

    await user.click(screen.getByRole('button', { name: '书内搜索' }))
    await user.type(screen.getByRole('searchbox', { name: '搜索关键词' }), '月亮')
    expect(await screen.findByText('命中：月亮')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /跳转到搜索结果/ }))
    expect(screen.getByTestId('epub-reader')).toBeInTheDocument()
  })
})
