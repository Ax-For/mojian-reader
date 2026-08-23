import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  Copy,
  Download,
  Expand,
  ExternalLink,
  Gauge,
  Headphones,
  List,
  Languages,
  Maximize2,
  MessageSquarePlus,
  MessageSquareText,
  Minus,
  Moon,
  MoreHorizontal,
  Pause,
  Palette,
  PencilLine,
  Play,
  Plus,
  Quote,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Search,
  Settings2,
  Sun,
  Trash2,
  Type,
  Undo2,
  Volume2,
  X
} from 'lucide-react'
import type { Rendition } from 'epubjs'
import { ReactReader } from 'react-reader'
import type {
  BookGroup,
  ReaderBook,
  ReaderFont,
  ReaderLayout,
  ReaderTheme,
  ReadingMark,
  ReadingMarkDraft,
  ReadingMarkKind,
  TextAnnotationSelection,
  AnnotationColor
} from '../types'
import { splitIntoChapters } from '../utils/books'
import {
  DEFAULT_READER_TOC_WIDTH,
  MAX_READER_TOC_WIDTH,
  MIN_READER_TOC_WIDTH,
  loadReaderPreferences,
  saveReaderPreferences
} from '../services/readerPreferences'
import {
  clearBookSpeechVoice,
  loadBookSpeechVoice,
  resolveBookSpeechVoice,
  saveBookSpeechVoice,
  type BookSpeechVoicePreference
} from '../services/bookSpeechPreferences'
import {
  BUILT_IN_READER_PROFILES,
  deleteCustomReaderProfile,
  loadCustomReaderProfiles,
  saveCustomReaderProfile,
  type ReaderProfile
} from '../services/readerProfiles'
import {
  countReadingUnits,
  estimateRemainingMinutes,
  formatReadingDuration,
  formatReadingEstimate,
  loadBookReadingStats,
  recordReadingActivity
} from '../services/readingStats'
import {
  formatChapterReadingTime,
  loadBookChapterProgress,
  recordChapterReadingProgress,
  type BookChapterProgress
} from '../services/chapterReadingProgress'
import { buildParagraphChapterLabels, searchTextOccurrences } from '../utils/textSearch'
import { parseMarkdownBlocks } from '../utils/markdown'
import { normalizeReadingBackground } from '../utils/bookMetadata'
import { hasCurrentTextBookIndex } from '../utils/textBookIndex'
import { formatBookContentStats } from '../utils/bookMetrics'
import { BookMetadataDialog } from './BookMetadataDialog'

interface ReaderViewProps {
  book: ReaderBook
  marks: ReadingMark[]
  initialMark: ReadingMark | null
  onBack: () => void
  onProgressChange: (progress: number) => void
  onAddMark: (mark: ReadingMarkDraft) => void
  onRemoveMark: (id: string) => void
  onUpdateMark?: (mark: ReadingMark) => void
  onUpdateBook?: (book: ReaderBook) => void
  groups?: BookGroup[]
}

interface EpubChapter {
  label: string
  href: string
}

interface EpubSearchResult {
  cfi: string
  excerpt: string
}

interface TextSearchResult {
  index: number
  offset: number
  label: string
  excerpt: string
}

interface TextChapterEntry {
  title: string
  paragraphIndex: number
  chapterIndex: number
}

interface SentenceSegment {
  text: string
  start: number
  end: number
}

interface TextReadingTarget {
  paragraphIndex: number
  sentenceKey: string
}

interface SelectionToolsState {
  text: string
  selection?: TextAnnotationSelection
  epubCfi?: string
  anchorX: number
  anchorY: number
  placement: 'above' | 'below'
}

interface TextViewportAnchor {
  sentenceKey: string
  viewportTop: number
}

interface TocTitleTooltipState {
  title: string
  top: number
  left: number
  maxWidth: number
}

interface TocResizeStart {
  pointerId: number
  startX: number
  startWidth: number
}

interface ReaderNavigationLocation {
  type: 'text' | 'epub'
  value: string
  progress: number
  label: string
}

type AutoScrollState = 'idle' | 'playing' | 'paused' | 'ended'
type NarrationState = 'idle' | 'playing' | 'paused' | 'ended'

interface EpubAutoScrollManager {
  container?: HTMLElement
  getContents?: () => Array<{
    document: Document
    window: Window
    cfiFromRange?: (range: Range) => string
  }>
}

interface EpubAnnotations {
  highlight?: (cfi: string, data?: Record<string, unknown>, callback?: () => void, className?: string) => void
  remove?: (cfi: string, type?: string) => void
}

interface CssHighlightRegistry {
  set: (name: string, highlight: unknown) => void
  delete: (name: string) => boolean
}

interface EpubSentenceHighlight {
  registry: CssHighlightRegistry
  range: Range
}

interface EpubDocumentListeners {
  selection: EventListener
  rulerPointerMove: EventListener
}

type AutoScrollRendition = Rendition & { manager?: EpubAutoScrollManager; annotations?: EpubAnnotations }

const AUTO_SCROLL_BASE_SPEED = 26
const AUTO_SCROLL_MIN_SPEED = 0.5
const AUTO_SCROLL_MAX_SPEED = 8
const AUTO_SCROLL_SPEED_STEP = 0.25
const AUTO_SCROLL_FAST_THRESHOLD = 3
const AUTO_SCROLL_FAST_STEP = 0.5
const AUTO_SCROLL_PAUSE_SETTLE_MS = 350
const EPUB_SENTENCE_HIGHLIGHT_NAME = 'mojian-reading-sentence'
const LONG_TEXT_PARAGRAPH_THRESHOLD = 1_200
const TEXT_WINDOW_SIZE = 180
const TEXT_WINDOW_STEP = 156
const SEARCH_RESULT_ROW_HEIGHT = 92
const SEARCH_RESULT_VIEWPORT_HEIGHT = 470
const SEARCH_RESULT_OVERSCAN = 5
const TOC_VIRTUAL_THRESHOLD = 250
const TOC_ROW_HEIGHT = 66
const TOC_VIEWPORT_ESTIMATE = 560
const TOC_OVERSCAN = 6
const MAX_NAVIGATION_HISTORY = 50
const TEXT_SEPARATOR_PATTERN = /^(?:[-—–=_*·•]\s*){3,}$/
const FLUSH_TEXT_BLOCK_PATTERN = /^(?:[-*+]\s|\d+[.)、]\s|>\s|#{1,6}\s)/
const SENTENCE_END_PATTERN = /[。！？!?；;]/
const SENTENCE_CLOSER_PATTERN = /[”’」』》）)】\]"']/
const APPLE_VOICE_HELP_URL = 'https://support.apple.com/zh-cn/guide/mac-help/mchlp2290/mac'
const WINDOWS_VOICE_HELP_URL = 'https://support.microsoft.com/windows/change-your-keyboard-layout-245c49b8-f856-7fd7-2cf5-41e54c66f5b3'

const FONT_STACKS: Record<ReaderFont, string> = {
  serif: '"Noto Serif SC Variable", "Songti SC", "STSong", serif',
  song: '"Songti SC", "STSong", "SimSun", serif',
  sans: '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif'
}

function scrollTextTarget(canvas: HTMLDivElement | null, target?: HTMLElement | null) {
  if (!target) return
  if (canvas && typeof canvas.scrollTo === 'function') {
    const canvasTop = canvas.getBoundingClientRect().top
    const targetTop = target.getBoundingClientRect().top
    canvas.scrollTo({
      top: Math.max(0, canvas.scrollTop + targetTop - canvasTop - 56),
      behavior: 'smooth'
    })
    return
  }
  target.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

function stripSearchMarkup(value: string) {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '阅读记录'
}

function normalizeEpubHref(value: string) {
  const withoutFragment = value.split('#')[0]
  try {
    return decodeURIComponent(withoutFragment).replace(/^\.\//, '')
  } catch {
    return withoutFragment.replace(/^\.\//, '')
  }
}

function sortSpeechVoices(voices: SpeechSynthesisVoice[]) {
  return [...voices].sort((first, second) => {
    const languagePriority = Number(/^zh(?:-|$)/i.test(second.lang)) - Number(/^zh(?:-|$)/i.test(first.lang))
    if (languagePriority !== 0) return languagePriority
    const localPriority = Number(second.localService) - Number(first.localService)
    return localPriority || first.lang.localeCompare(second.lang) || first.name.localeCompare(second.name, 'zh-CN')
  })
}

function systemVoiceHelpUrl() {
  if (typeof navigator === 'undefined') return APPLE_VOICE_HELP_URL
  return /Windows/i.test(navigator.userAgent) ? WINDOWS_VOICE_HELP_URL : APPLE_VOICE_HELP_URL
}

function textWindowStartForIndex(index: number, paragraphCount: number) {
  const maxStart = Math.max(0, paragraphCount - TEXT_WINDOW_SIZE)
  return Math.min(Math.max(0, index - 24), maxStart)
}

function splitIntoSentenceSegments(text: string): SentenceSegment[] {
  if (!text) return []
  const segments: SentenceSegment[] = []
  let start = 0
  let cursor = 0

  function pushSegment(end: number) {
    if (end <= start) return
    segments.push({ text: text.slice(start, end), start, end })
    start = end
  }

  while (cursor < text.length) {
    const character = text[cursor]
    let isBoundary = SENTENCE_END_PATTERN.test(character)

    if (character === '.') {
      let next = cursor + 1
      while (next < text.length && SENTENCE_CLOSER_PATTERN.test(text[next])) next += 1
      isBoundary = next >= text.length || /\s/.test(text[next])
    } else if (character === '…' && text[cursor + 1] === '…') {
      while (text[cursor + 1] === '…') cursor += 1
      isBoundary = true
    }

    if (!isBoundary) {
      cursor += 1
      continue
    }

    let end = cursor + 1
    while (end < text.length && SENTENCE_CLOSER_PATTERN.test(text[end])) end += 1
    while (end < text.length && /\s/.test(text[end])) end += 1
    pushSegment(end)
    cursor = end
  }

  pushSegment(text.length)
  return segments.length > 0 ? segments : [{ text, start: 0, end: text.length }]
}

function selectedTextRange(selection: Selection | null): TextAnnotationSelection | undefined {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined
  const range = selection.getRangeAt(0)
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
  const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
    ? range.endContainer as Element
    : range.endContainer.parentElement
  const startBlock = startElement?.closest<HTMLElement>('[data-paragraph-index]')
  const endBlock = endElement?.closest<HTMLElement>('[data-paragraph-index]')
  if (!startBlock || startBlock !== endBlock) return undefined

  const rawExact = range.toString()
  const exact = rawExact.trim()
  if (!exact) return undefined
  const prefix = document.createRange()
  prefix.selectNodeContents(startBlock)
  prefix.setEnd(range.startContainer, range.startOffset)
  const leadingWhitespace = rawExact.length - rawExact.trimStart().length
  const start = prefix.toString().length + leadingWhitespace
  const paragraphIndex = Number(startBlock.dataset.paragraphIndex)
  if (!Number.isFinite(paragraphIndex)) return undefined
  return { paragraphIndex, start, end: start + exact.length, exact }
}

function selectionToolsAnchor(range: Range, offsetX = 0, offsetY = 0) {
  const fallback = {
    anchorX: typeof window === 'undefined' ? 0 : window.innerWidth / 2,
    anchorY: 84,
    placement: 'below' as const
  }
  if (typeof range.getBoundingClientRect !== 'function') return fallback
  const bounds = range.getBoundingClientRect()
  if (![bounds.left, bounds.top, bounds.right, bounds.bottom].every(Number.isFinite)) return fallback
  const absoluteTop = bounds.top + offsetY
  const absoluteBottom = bounds.bottom + offsetY
  const placement: 'above' | 'below' = absoluteTop >= 72 ? 'above' : 'below'
  const toolbarHalfWidth = Math.min(310, Math.max(0, window.innerWidth - 24) / 2)
  const unclampedX = bounds.left + bounds.width / 2 + offsetX
  return {
    anchorX: Math.min(window.innerWidth - toolbarHalfWidth - 12, Math.max(toolbarHalfWidth + 12, unclampedX)),
    anchorY: placement === 'above' ? absoluteTop : absoluteBottom,
    placement
  }
}

function sentenceElementByKey(canvas: HTMLDivElement, sentenceKey: string) {
  return Array.from(canvas.querySelectorAll<HTMLElement>('[data-sentence-key]'))
    .find((element) => element.dataset.sentenceKey === sentenceKey) ?? null
}

function captureTextViewportAnchor(canvas: HTMLDivElement): TextViewportAnchor | null {
  const canvasBounds = canvas.getBoundingClientRect()
  const focusY = canvasBounds.top + canvas.clientHeight * 0.36
  const sentences = Array.from(canvas.querySelectorAll<HTMLElement>('[data-sentence-key]'))
  if (sentences.length === 0) return null
  const sentence = sentences.reduce((nearest, candidate) => (
    Math.abs(candidate.getBoundingClientRect().top - focusY) < Math.abs(nearest.getBoundingClientRect().top - focusY)
      ? candidate
      : nearest
  ))
  const sentenceKey = sentence.dataset.sentenceKey
  if (!sentenceKey) return null
  return {
    sentenceKey,
    viewportTop: sentence.getBoundingClientRect().top
  }
}

function sentenceKeyNearestPoint(paragraph: HTMLElement, focusX: number, focusY: number) {
  const sentences = Array.from(paragraph.querySelectorAll<HTMLElement>('[data-sentence-key]'))
  if (sentences.length === 0) return `${paragraph.dataset.paragraphIndex ?? 0}:0`

  const documentAtPoint = paragraph.ownerDocument
  const hitSentence = documentAtPoint.elementsFromPoint?.(focusX, focusY)
    .map((element) => element.closest<HTMLElement>('[data-sentence-key]'))
    .find((element) => element && paragraph.contains(element))
  if (hitSentence?.dataset.sentenceKey) return hitSentence.dataset.sentenceKey

  let nearestSentence = sentences[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const sentence of sentences) {
    const rects = Array.from(sentence.getClientRects())
    const bounds = rects.length > 0 ? rects : [sentence.getBoundingClientRect()]
    for (const rect of bounds) {
      const verticalDistance = focusY < rect.top
        ? rect.top - focusY
        : focusY > rect.bottom
          ? focusY - rect.bottom
          : 0
      const horizontalDistance = focusX < rect.left
        ? rect.left - focusX
        : focusX > rect.right
          ? focusX - rect.right
          : 0
      const distance = verticalDistance * 10 + horizontalDistance
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestSentence = sentence
      }
    }
  }
  return nearestSentence.dataset.sentenceKey ?? `${paragraph.dataset.paragraphIndex ?? 0}:0`
}

function nearestTextReadingTarget(canvas: HTMLDivElement): TextReadingTarget | null {
  const elements = Array.from(canvas.querySelectorAll<HTMLElement>('[data-paragraph-index]'))
  if (elements.length === 0) return null

  const canvasBounds = canvas.getBoundingClientRect()
  const focusLine = canvasBounds.top + canvas.clientHeight * 0.36
  const focusX = canvasBounds.left + canvas.clientWidth * 0.5
  const hitSentence = canvas.ownerDocument.elementsFromPoint?.(focusX, focusLine)
    .map((element) => element.closest<HTMLElement>('[data-sentence-key]'))
    .find((element) => element && canvas.contains(element))
  const hitParagraph = hitSentence?.closest<HTMLElement>('[data-paragraph-index]')
  if (hitSentence?.dataset.sentenceKey && hitParagraph?.dataset.paragraphIndex) {
    return {
      paragraphIndex: Number(hitParagraph.dataset.paragraphIndex),
      sentenceKey: hitSentence.dataset.sentenceKey
    }
  }

  let low = 0
  let high = elements.length - 1
  let nearestElement = elements[0]
  let nearestDistance = Number.POSITIVE_INFINITY

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const element = elements[middle]
    const bounds = element.getBoundingClientRect()
    const readingPoint = bounds.top + Math.min(bounds.height * 0.32, 32)
    const distance = Math.abs(readingPoint - focusLine)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestElement = element
    }
    if (readingPoint < focusLine) low = middle + 1
    else high = middle - 1
  }

  const paragraphIndex = Number(nearestElement.dataset.paragraphIndex ?? 0)
  return {
    paragraphIndex,
    sentenceKey: sentenceKeyNearestPoint(nearestElement, focusX, focusLine)
  }
}

function sentenceRangeAtPoint(element: HTMLElement, document: Document, x: number, y: number) {
  const textNodes: Text[] = []
  const walker = document.createTreeWalker(element, document.defaultView?.NodeFilter.SHOW_TEXT ?? 4)
  let currentNode = walker.nextNode()
  while (currentNode) {
    textNodes.push(currentNode as Text)
    currentNode = walker.nextNode()
  }
  if (textNodes.length === 0) return null

  const fullText = textNodes.map((node) => node.data).join('')
  if (!fullText.trim()) return null

  const caretDocument = document as Document & {
    caretPositionFromPoint?: (pointX: number, pointY: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (pointX: number, pointY: number) => Range | null
  }
  const caretPosition = caretDocument.caretPositionFromPoint?.(x, y)
  const caretRange = caretPosition ? null : caretDocument.caretRangeFromPoint?.(x, y)
  const caretNode = caretPosition?.offsetNode ?? caretRange?.startContainer ?? null
  const caretOffset = caretPosition?.offset ?? caretRange?.startOffset ?? 0
  let textOffset = -1

  if (caretNode?.nodeType === 3 && element.contains(caretNode)) {
    let traversed = 0
    for (const node of textNodes) {
      if (node === caretNode) {
        textOffset = traversed + Math.min(Math.max(0, caretOffset), node.data.length)
        break
      }
      traversed += node.data.length
    }
  }

  if (textOffset < 0) {
    const bounds = element.getBoundingClientRect()
    const verticalRatio = bounds.height > 0 ? Math.min(1, Math.max(0, (y - bounds.top) / bounds.height)) : 0
    textOffset = Math.min(fullText.length - 1, Math.floor(fullText.length * verticalRatio))
  }

  const segments = splitIntoSentenceSegments(fullText)
  const segment = segments.find(({ start, end }) => textOffset >= start && textOffset < end) ?? segments.at(-1)
  if (!segment) return null

  function positionAt(offset: number) {
    let traversed = 0
    for (const node of textNodes) {
      const nodeEnd = traversed + node.data.length
      if (offset <= nodeEnd) return { node, offset: Math.max(0, offset - traversed) }
      traversed = nodeEnd
    }
    const lastNode = textNodes[textNodes.length - 1]
    return { node: lastNode, offset: lastNode.data.length }
  }

  const start = positionAt(segment.start)
  const end = positionAt(segment.end)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return range
}

function clearEpubSentenceHighlight(highlight: EpubSentenceHighlight | null) {
  highlight?.registry.delete(EPUB_SENTENCE_HIGHLIGHT_NAME)
}

function epubAppearance(fontFamily: ReaderFont, fontSize: number, lineHeight: number, theme: ReaderTheme) {
  const isNight = theme === 'night'
  return {
    body: {
      'font-family': `${FONT_STACKS[fontFamily]} !important`,
      'line-height': `${lineHeight} !important`,
      color: isNight ? '#d9d5cc' : '#2f2a24'
    },
    p: {
      'text-indent': '2em !important',
      'text-align': 'justify'
    },
    'li > p, blockquote > p, td > p, th > p, figcaption': {
      'text-indent': '0 !important'
    },
    '[data-mojian-reading="true"]': {
      'border-radius': '3px',
      'background-color': isNight ? 'rgba(201, 152, 119, 0.16)' : 'rgba(168, 75, 45, 0.1)',
      'box-shadow': `inset 3px 0 ${isNight ? '#c99877' : '#a84b2d'}`,
      transition: 'background-color 280ms ease, box-shadow 280ms ease'
    },
    [`::highlight(${EPUB_SENTENCE_HIGHLIGHT_NAME})`]: {
      color: isNight ? '#eee8df' : '#2f2a24',
      'background-color': isNight ? 'rgba(201, 152, 119, 0.22)' : 'rgba(168, 75, 45, 0.14)'
    },
    '.mojian-epub-annotation': {
      fill: isNight ? 'rgba(226, 184, 86, 0.36)' : 'rgba(226, 184, 86, 0.32)',
      'fill-opacity': '1'
    },
    '.mojian-epub-annotation--coral': {
      fill: 'rgba(205, 108, 79, 0.3)'
    },
    '.mojian-epub-annotation--sage': {
      fill: 'rgba(104, 150, 122, 0.3)'
    }
  }
}

export function ReaderView({
  book,
  marks,
  initialMark,
  onBack,
  onProgressChange,
  onAddMark,
  onRemoveMark,
  onUpdateMark,
  onUpdateBook,
  groups = []
}: ReaderViewProps) {
  const initialPreferences = useRef(loadReaderPreferences()).current
  const bookReadingBackground = normalizeReadingBackground(book.readingBackground)
  const [fontSize, setFontSize] = useState(initialPreferences.fontSize)
  const [fontFamily, setFontFamily] = useState<ReaderFont>(initialPreferences.fontFamily)
  const [lineHeight, setLineHeight] = useState(initialPreferences.lineHeight)
  const [columnWidth, setColumnWidth] = useState(initialPreferences.columnWidth)
  const [layoutMode, setLayoutMode] = useState<ReaderLayout>(initialPreferences.layoutMode)
  const [theme, setTheme] = useState<ReaderTheme>(initialPreferences.theme)
  const [progress, setProgress] = useState(book.progress)
  const [epubLocation, setEpubLocation] = useState<string | number>(
    initialMark?.location.type === 'epub' ? initialMark.location.value : 0
  )
  const [epubToc, setEpubToc] = useState<EpubChapter[]>([])
  const [activeEpubChapterIndex, setActiveEpubChapterIndex] = useState(0)
  const [tocQuery, setTocQuery] = useState('')
  const [tocScrollTop, setTocScrollTop] = useState(0)
  const [tocWidth, setTocWidth] = useState(initialPreferences.tocWidth)
  const [isTocResizing, setIsTocResizing] = useState(false)
  const [tocTitleTooltip, setTocTitleTooltip] = useState<TocTitleTooltipState | null>(null)
  const [panelMode, setPanelMode] = useState<'toc' | 'marks'>(initialMark ? 'marks' : 'toc')
  const [isSettingsOpen, setIsSettingsOpen] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [textSearchResults, setTextSearchResults] = useState<TextSearchResult[]>([])
  const [isTextSearching, setIsTextSearching] = useState(false)
  const [epubSearchQuery, setEpubSearchQuery] = useState('')
  const [epubSearchResults, setEpubSearchResults] = useState<EpubSearchResult[]>([])
  const [activeSearchResultIndex, setActiveSearchResultIndex] = useState(-1)
  const [searchResultsScrollTop, setSearchResultsScrollTop] = useState(0)
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isBookMetadataOpen, setIsBookMetadataOpen] = useState(false)
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [isReadingRulerOpen, setIsReadingRulerOpen] = useState(false)
  const [readingRulerPosition, setReadingRulerPosition] = useState(42)
  const [navigationBackStack, setNavigationBackStack] = useState<ReaderNavigationLocation[]>([])
  const [navigationForwardStack, setNavigationForwardStack] = useState<ReaderNavigationLocation[]>([])
  const [selectionTools, setSelectionTools] = useState<SelectionToolsState | null>(null)
  const [copyNotice, setCopyNotice] = useState('')
  const [isAnnotationOpen, setIsAnnotationOpen] = useState(false)
  const [annotationNote, setAnnotationNote] = useState('')
  const [annotationExcerpt, setAnnotationExcerpt] = useState('')
  const [annotationSelection, setAnnotationSelection] = useState<TextAnnotationSelection | undefined>()
  const [annotationEpubCfi, setAnnotationEpubCfi] = useState<string | null>(null)
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>('amber')
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [autoScrollState, setAutoScrollState] = useState<AutoScrollState>('idle')
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(initialPreferences.autoScrollSpeed)
  const [activeAutoParagraphIndex, setActiveAutoParagraphIndex] = useState<number | null>(null)
  const [activeAutoSentenceKey, setActiveAutoSentenceKey] = useState<string | null>(null)
  const [narrationState, setNarrationState] = useState<NarrationState>('idle')
  const [speechRate, setSpeechRate] = useState(initialPreferences.speechRate)
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([])
  const [bookSpeechVoice, setBookSpeechVoice] = useState<BookSpeechVoicePreference | null>(() => loadBookSpeechVoice(book.id))
  const [isVoicePreviewing, setIsVoicePreviewing] = useState(false)
  const [customReaderProfiles, setCustomReaderProfiles] = useState(loadCustomReaderProfiles)
  const [newProfileName, setNewProfileName] = useState('')
  const [readingStats, setReadingStats] = useState(() => loadBookReadingStats(book.id))
  const [chapterReadingProgress, setChapterReadingProgress] = useState<BookChapterProgress>(() => loadBookChapterProgress(book.id))
  const [pendingReadingMs, setPendingReadingMs] = useState(0)
  const [sessionReadingMs, setSessionReadingMs] = useState(0)
  const [activeNarrationSentenceKey, setActiveNarrationSentenceKey] = useState<string | null>(null)
  const [renditionVersion, setRenditionVersion] = useState(0)
  const readingCanvasRef = useRef<HTMLDivElement>(null)
  const searchResultsRef = useRef<HTMLDivElement>(null)
  const tocListRef = useRef<HTMLElement>(null)
  const tocResizeStartRef = useRef<TocResizeStart | null>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const epubAutoHighlightRef = useRef<HTMLElement | null>(null)
  const epubSentenceHighlightRef = useRef<EpubSentenceHighlight | null>(null)
  const epubAdvancePendingRef = useRef(false)
  const textSearchWorkerRef = useRef<Worker | null>(null)
  const textSearchRequestRef = useRef(0)
  const ignoreTextScrollUntilRef = useRef(0)
  const pendingTextSelectionRef = useRef<TextAnnotationSelection | undefined>(undefined)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const voicePreviewUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const narrationRestartTimerRef = useRef<number | null>(null)
  const appearanceRestoreFrameRef = useRef<number | null>(null)
  const selectionPositionFrameRef = useRef<number | null>(null)
  const copyNoticeTimerRef = useRef<number | null>(null)
  const pendingAppearanceAnchorRef = useRef<TextViewportAnchor | null>(null)
  const epubSelectionDocumentsRef = useRef(new Map<Document, EpubDocumentListeners>())
  const activeReadingUntilRef = useRef(Date.now() + 120_000)
  const pendingReadingMsRef = useRef(0)
  const sessionWasRecordedRef = useRef(false)
  const autoScrollStateRef = useRef<AutoScrollState>('idle')
  const narrationStateRef = useRef<NarrationState>('idle')
  const readingRulerOpenRef = useRef(false)
  const openingProgress = useRef(book.progress).current
  const persistedTextIndex = hasCurrentTextBookIndex(book.textIndex) ? book.textIndex : null

  readingRulerOpenRef.current = isReadingRulerOpen

  const text = book.content ?? ''
  const allReaderProfiles = useMemo(
    () => [...BUILT_IN_READER_PROFILES, ...customReaderProfiles],
    [customReaderProfiles]
  )
  const selectedSpeechVoice = useMemo(
    () => resolveBookSpeechVoice(speechVoices, bookSpeechVoice),
    [bookSpeechVoice, speechVoices]
  )
  const chineseSpeechVoices = useMemo(
    () => speechVoices.filter((voice) => /^zh(?:-|$)/i.test(voice.lang)),
    [speechVoices]
  )
  const otherSpeechVoices = useMemo(
    () => speechVoices.filter((voice) => !/^zh(?:-|$)/i.test(voice.lang)),
    [speechVoices]
  )
  const totalReadingUnits = useMemo(
    () => book.format === 'epub' ? 0 : persistedTextIndex?.totalReadingUnits ?? countReadingUnits(text),
    [book.format, persistedTextIndex, text]
  )
  const markdownBlocks = useMemo(
    () => book.format === 'md' ? parseMarkdownBlocks(text) : null,
    [book.format, text]
  )
  const chapters = useMemo(
    () => persistedTextIndex
      ? persistedTextIndex.chapters.map((chapter) => ({ title: chapter.title, start: chapter.paragraphIndex }))
      : markdownBlocks
      ? markdownBlocks.flatMap((block, index) => block.kind === 'heading'
        ? [{ title: block.text, start: index }]
        : [])
      : splitIntoChapters(text),
    [markdownBlocks, persistedTextIndex, text]
  )
  const paragraphs = useMemo(
    () => persistedTextIndex
      ? persistedTextIndex.paragraphs
      : markdownBlocks
      ? markdownBlocks.map((block) => block.text)
      : text.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean),
    [markdownBlocks, persistedTextIndex, text]
  )
  const chapterTitles = useMemo(() => new Set(chapters.map((chapter) => chapter.title)), [chapters])
  const isRenderableEpub = book.format === 'epub' && Boolean(book.data)
  const isLargeText = !isRenderableEpub && paragraphs.length > LONG_TEXT_PARAGRAPH_THRESHOLD
  const initialTextIndex = initialMark?.location.type === 'text'
    ? Number(initialMark.location.value)
    : Math.round((book.progress / 100) * Math.max(0, paragraphs.length - 1))
  const safeInitialTextIndex = Number.isFinite(initialTextIndex)
    ? Math.min(Math.max(initialTextIndex, 0), Math.max(0, paragraphs.length - 1))
    : 0
  const narrationIndexRef = useRef(safeInitialTextIndex)
  const [currentTextIndex, setCurrentTextIndex] = useState(safeInitialTextIndex)
  const currentTextIndexRef = useRef(safeInitialTextIndex)
  const activeAutoParagraphIndexRef = useRef<number | null>(null)
  const activeAutoSentenceKeyRef = useRef<string | null>(null)
  const progressRef = useRef(book.progress)
  const onProgressChangeRef = useRef(onProgressChange)
  const [textWindowStart, setTextWindowStart] = useState(
    isLargeText ? textWindowStartForIndex(safeInitialTextIndex, paragraphs.length) : 0
  )
  const textWindowEnd = isLargeText
    ? Math.min(paragraphs.length, textWindowStart + TEXT_WINDOW_SIZE)
    : paragraphs.length
  const visibleParagraphs = useMemo(
    () => isLargeText ? paragraphs.slice(textWindowStart, textWindowEnd) : paragraphs,
    [isLargeText, paragraphs, textWindowEnd, textWindowStart]
  )
  const sentenceSegmentsCacheRef = useRef({ text, segments: new Map<number, SentenceSegment[]>() })
  if (sentenceSegmentsCacheRef.current.text !== text) {
    sentenceSegmentsCacheRef.current = { text, segments: new Map<number, SentenceSegment[]>() }
  }
  const sentenceSegmentsCache = sentenceSegmentsCacheRef.current.segments
  const chapterParagraphEntries = useMemo(() => {
    if (persistedTextIndex) {
      return persistedTextIndex.chapters.map((chapter, chapterIndex) => ({ ...chapter, chapterIndex }))
    }
    const entries: TextChapterEntry[] = []
    let paragraphCursor = 0
    chapters.forEach((chapter, chapterIndex) => {
      let matchIndex = -1
      for (let index = paragraphCursor; index < paragraphs.length; index += 1) {
        if (paragraphs[index] === chapter.title) {
          matchIndex = index
          break
        }
      }
      if (matchIndex === -1 && chapter.start === 0) matchIndex = 0
      if (matchIndex === -1) return
      entries.push({ title: chapter.title, paragraphIndex: matchIndex, chapterIndex })
      if (paragraphs[matchIndex] === chapter.title) paragraphCursor = matchIndex + 1
    })
    return entries
  }, [chapters, paragraphs, persistedTextIndex])
  const normalizedTocQuery = tocQuery.trim().toLocaleLowerCase()
  const filteredTextChapters = useMemo(
    () => normalizedTocQuery
      ? chapterParagraphEntries.filter((chapter) => chapter.title.toLocaleLowerCase().includes(normalizedTocQuery))
      : chapterParagraphEntries,
    [chapterParagraphEntries, normalizedTocQuery]
  )
  const indexedEpubChapters = useMemo(
    () => epubToc.map((chapter, chapterIndex) => ({ chapter, chapterIndex })),
    [epubToc]
  )
  const filteredEpubChapters = useMemo(
    () => normalizedTocQuery
      ? indexedEpubChapters.filter(({ chapter }) => chapter.label.toLocaleLowerCase().includes(normalizedTocQuery))
      : indexedEpubChapters,
    [indexedEpubChapters, normalizedTocQuery]
  )
  const tocTotal = isRenderableEpub ? epubToc.length : chapterParagraphEntries.length
  const filteredTocCount = isRenderableEpub ? filteredEpubChapters.length : filteredTextChapters.length
  const tocWindowStart = Math.max(0, Math.floor(tocScrollTop / TOC_ROW_HEIGHT) - TOC_OVERSCAN)
  const tocWindowCount = Math.ceil(TOC_VIEWPORT_ESTIMATE / TOC_ROW_HEIGHT) + TOC_OVERSCAN * 2
  const shouldVirtualizeToc = filteredTocCount > TOC_VIRTUAL_THRESHOLD
  const visibleTextTocChapters = shouldVirtualizeToc
    ? filteredTextChapters.slice(tocWindowStart, tocWindowStart + tocWindowCount)
    : filteredTextChapters
  const visibleEpubTocChapters = shouldVirtualizeToc
    ? filteredEpubChapters.slice(tocWindowStart, tocWindowStart + tocWindowCount)
    : filteredEpubChapters

  function chapterTitleAt(index: number) {
    let activeTitle = chapterParagraphEntries[0]?.title ?? chapters[0]?.title ?? '正文'
    for (const chapter of chapterParagraphEntries) {
      if (chapter.paragraphIndex > index) break
      activeTitle = chapter.title
    }
    return activeTitle
  }

  const activeTextChapterPosition = useMemo(() => {
    let activePosition = 0
    for (let position = 0; position < chapterParagraphEntries.length; position += 1) {
      if (chapterParagraphEntries[position].paragraphIndex > currentTextIndex) break
      activePosition = position
    }
    return activePosition
  }, [chapterParagraphEntries, currentTextIndex])
  const activeTextChapter = chapterParagraphEntries[activeTextChapterPosition]
  const currentChapter = activeTextChapter?.title ?? chapters[0]?.title ?? '正文'
  const activeTocChapterPosition = isRenderableEpub ? activeEpubChapterIndex : activeTextChapterPosition
  const activeTocChapterDataIndex = isRenderableEpub
    ? activeEpubChapterIndex
    : activeTextChapter?.chapterIndex ?? 0
  const activeTextChapterProgress = useMemo(() => {
    if (!activeTextChapter) return 0
    const nextStart = chapterParagraphEntries[activeTextChapterPosition + 1]?.paragraphIndex ?? paragraphs.length
    const chapterEnd = Math.max(activeTextChapter.paragraphIndex, nextStart - 1)
    if (currentTextIndex >= chapterEnd || chapterEnd === activeTextChapter.paragraphIndex) return 100
    return Math.round(((currentTextIndex - activeTextChapter.paragraphIndex) / (chapterEnd - activeTextChapter.paragraphIndex)) * 100)
  }, [activeTextChapter, activeTextChapterPosition, chapterParagraphEntries, currentTextIndex, paragraphs.length])
  const activeEpubChapterProgress = useMemo(() => {
    if (epubToc.length <= 1) return Math.round(progress)
    const chapterSpan = 100 / epubToc.length
    const chapterStart = activeEpubChapterIndex * chapterSpan
    return Math.round(Math.min(100, Math.max(0, ((progress - chapterStart) / chapterSpan) * 100)))
  }, [activeEpubChapterIndex, epubToc.length, progress])
  const activeChapterStorageKey = isRenderableEpub
    ? (epubToc[activeEpubChapterIndex]
        ? `epub:${activeEpubChapterIndex}:${epubToc[activeEpubChapterIndex].href}`
        : null)
    : (activeTextChapter
        ? `text:${activeTextChapter.chapterIndex}:${activeTextChapter.paragraphIndex}`
        : null)
  const activeChapterProgress = isRenderableEpub ? activeEpubChapterProgress : activeTextChapterProgress
  const currentTextProgress = paragraphs.length <= 1
    ? 0
    : Math.round((currentTextIndex / (paragraphs.length - 1)) * 100)
  const displayedReadingMs = readingStats.totalReadingMs + pendingReadingMs
  const observedProgress = readingStats.trackingStartedProgress === undefined
    ? 0
    : Math.max(0, progress - readingStats.trackingStartedProgress)
  const remainingReadingMinutes = estimateRemainingMinutes({
    progress,
    totalReadingMs: displayedReadingMs,
    totalUnits: totalReadingUnits,
    observedProgress
  })
  const activeReadingDays = Object.keys(readingStats.dailyReadingMs).length
  const averageSessionMs = readingStats.sessionCount > 0
    ? readingStats.totalReadingMs / readingStats.sessionCount
    : sessionReadingMs
  const activeReaderProfileId = allReaderProfiles.find((profile) =>
    profile.fontSize === fontSize &&
    profile.fontFamily === fontFamily &&
    profile.lineHeight === lineHeight &&
    profile.columnWidth === columnWidth &&
    profile.layoutMode === layoutMode &&
    profile.theme === theme
  )?.id ?? ''
  const currentLocation = isRenderableEpub
    ? { type: 'epub' as const, value: String(epubLocation) }
    : { type: 'text' as const, value: String(currentTextIndex) }
  const currentLabel = isRenderableEpub
    ? epubToc[activeEpubChapterIndex]?.label ?? `EPUB 阅读位置 · ${progress}%`
    : currentChapter
  const currentExcerpt = isRenderableEpub
    ? `《${book.title}》已读 ${progress}% 处`
    : paragraphs[currentTextIndex] ?? ''
  const currentBookmark = marks.find((mark) =>
    mark.kind === 'bookmark' &&
    mark.location.type === currentLocation.type &&
    mark.location.value === currentLocation.value
  )

  function textChapterStorageKey(chapter: TextChapterEntry) {
    return `text:${chapter.chapterIndex}:${chapter.paragraphIndex}`
  }

  function epubChapterStorageKey(chapter: EpubChapter, chapterIndex: number) {
    return `epub:${chapterIndex}:${chapter.href}`
  }

  function chapterProgressPresentation(chapterPosition: number, storageKey: string, activeProgress: number) {
    const stored = chapterReadingProgress[storageKey]
    const isActive = chapterPosition === activeTocChapterPosition
    const chapterProgress = isActive
      ? Math.max(stored?.progress ?? 0, activeProgress)
      : stored?.progress ?? 0
    const hasStarted = Boolean(stored) || isActive
    const progressLabel = chapterProgress >= 100
      ? '已读 100%'
      : chapterProgress > 0
        ? `已读 ${chapterProgress}%`
        : hasStarted
          ? isActive ? '阅读中 · 0%' : '已开始 · 0%'
          : '未开始'
    return {
      progress: chapterProgress,
      progressLabel,
      timeLabel: stored
        ? formatChapterReadingTime(stored.lastReadAt)
        : isActive
          ? '刚刚'
          : '尚未阅读',
      lastReadAt: stored?.lastReadAt
    }
  }
  const textAnnotationsByParagraph = useMemo(() => {
    const byParagraph = new Map<number, ReadingMark[]>()
    for (const mark of marks) {
      if (mark.kind !== 'annotation' || !mark.selection) continue
      const group = byParagraph.get(mark.selection.paragraphIndex) ?? []
      group.push(mark)
      byParagraph.set(mark.selection.paragraphIndex, group)
    }
    for (const group of byParagraph.values()) {
      group.sort((a, b) => (a.selection?.start ?? 0) - (b.selection?.start ?? 0))
    }
    return byParagraph
  }, [marks])
  const visibleSearchResults = isRenderableEpub ? epubSearchResults : textSearchResults
  const searchResultWindow = useMemo(() => {
    const first = Math.max(0, Math.floor(searchResultsScrollTop / SEARCH_RESULT_ROW_HEIGHT) - SEARCH_RESULT_OVERSCAN)
    const visibleCount = Math.ceil(SEARCH_RESULT_VIEWPORT_HEIGHT / SEARCH_RESULT_ROW_HEIGHT) + SEARCH_RESULT_OVERSCAN * 2
    return visibleSearchResults.slice(first, first + visibleCount).map((result, offset) => ({
      result,
      index: first + offset
    }))
  }, [searchResultsScrollTop, visibleSearchResults])
  const handleEpubSearchResults = useCallback((results: EpubSearchResult[]) => {
    setEpubSearchResults(results)
  }, [])
  const refreshSpeechVoices = useCallback(() => {
    if (!('speechSynthesis' in window) || typeof window.speechSynthesis.getVoices !== 'function') {
      setSpeechVoices([])
      return
    }
    setSpeechVoices(sortSpeechVoices(window.speechSynthesis.getVoices()))
  }, [])

  useEffect(() => { currentTextIndexRef.current = currentTextIndex }, [currentTextIndex])
  useEffect(() => { activeAutoParagraphIndexRef.current = activeAutoParagraphIndex }, [activeAutoParagraphIndex])
  useEffect(() => { activeAutoSentenceKeyRef.current = activeAutoSentenceKey }, [activeAutoSentenceKey])
  useEffect(() => { autoScrollStateRef.current = autoScrollState }, [autoScrollState])
  useEffect(() => { narrationStateRef.current = narrationState }, [narrationState])
  useEffect(() => { progressRef.current = progress }, [progress])
  useEffect(() => { onProgressChangeRef.current = onProgressChange }, [onProgressChange])

  useEffect(() => {
    setChapterReadingProgress(loadBookChapterProgress(book.id))
    setActiveEpubChapterIndex(0)
  }, [book.id])

  useEffect(() => {
    if (!activeChapterStorageKey) return
    setChapterReadingProgress(recordChapterReadingProgress(
      book.id,
      activeChapterStorageKey,
      activeChapterProgress,
      Date.now()
    ))
  }, [activeChapterProgress, activeChapterStorageKey, book.id])

  useEffect(() => {
    setBookSpeechVoice(loadBookSpeechVoice(book.id))
    setIsVoicePreviewing(false)
    voicePreviewUtteranceRef.current = null
  }, [book.id])

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const synthesis = window.speechSynthesis
    refreshSpeechVoices()
    synthesis.addEventListener?.('voiceschanged', refreshSpeechVoices)
    return () => synthesis.removeEventListener?.('voiceschanged', refreshSpeechVoices)
  }, [refreshSpeechVoices])

  useEffect(() => {
    saveReaderPreferences({ fontSize, fontFamily, lineHeight, columnWidth, layoutMode, theme, autoScrollSpeed, speechRate, tocWidth })
  }, [autoScrollSpeed, columnWidth, fontFamily, fontSize, layoutMode, lineHeight, speechRate, theme, tocWidth])

  useEffect(() => {
    setReadingStats(loadBookReadingStats(book.id))
    setPendingReadingMs(0)
    setSessionReadingMs(0)
    pendingReadingMsRef.current = 0
    sessionWasRecordedRef.current = false
    activeReadingUntilRef.current = Date.now() + 120_000
    let lastTickAt = Date.now()

    function markActive() {
      activeReadingUntilRef.current = Date.now() + 120_000
    }

    function flushReadingTime(updateState = true) {
      const duration = pendingReadingMsRef.current
      if (duration < 1_000) return
      const next = recordReadingActivity(book.id, duration, Date.now(), !sessionWasRecordedRef.current, progressRef.current)
      sessionWasRecordedRef.current = true
      pendingReadingMsRef.current = 0
      if (updateState) {
        setPendingReadingMs(0)
        setReadingStats(next)
      }
    }

    function tickReadingTime(updateState = true) {
      const now = Date.now()
      const elapsed = Math.min(10_000, Math.max(0, now - lastTickAt))
      lastTickAt = now
      const isActivelyReading = now <= activeReadingUntilRef.current ||
        autoScrollStateRef.current === 'playing' || narrationStateRef.current === 'playing'
      if (document.visibilityState === 'hidden' || !isActivelyReading || elapsed === 0) return
      pendingReadingMsRef.current += elapsed
      if (updateState) {
        setPendingReadingMs(pendingReadingMsRef.current)
        setSessionReadingMs((duration) => duration + elapsed)
      }
      if (pendingReadingMsRef.current >= 15_000) flushReadingTime(updateState)
    }

    function handleVisibilityChange() {
      tickReadingTime()
      if (document.visibilityState === 'hidden') flushReadingTime()
      else markActive()
    }

    const interval = window.setInterval(tickReadingTime, 5_000)
    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }))
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      tickReadingTime(false)
      flushReadingTime(false)
      window.clearInterval(interval)
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActive))
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [book.id])

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    voicePreviewUtteranceRef.current = null
    if (narrationRestartTimerRef.current !== null) window.clearTimeout(narrationRestartTimerRef.current)
    if (appearanceRestoreFrameRef.current !== null) window.cancelAnimationFrame(appearanceRestoreFrameRef.current)
    if (selectionPositionFrameRef.current !== null) window.cancelAnimationFrame(selectionPositionFrameRef.current)
  }, [book.id])

  useEffect(() => () => {
    epubSelectionDocumentsRef.current.forEach((listeners, document) => {
      document.removeEventListener('mouseup', listeners.selection)
      document.removeEventListener('keyup', listeners.selection)
      document.removeEventListener('scroll', listeners.selection, true)
      document.removeEventListener('pointermove', listeners.rulerPointerMove)
    })
    epubSelectionDocumentsRef.current.clear()
  }, [book.id])

  useEffect(() => {
    const annotations = (renditionRef.current as AutoScrollRendition | null)?.annotations
    if (!annotations?.highlight) return
    const highlightedCfis: string[] = []
    for (const mark of marks) {
      if (mark.kind !== 'annotation' || mark.location.type !== 'epub' || !String(mark.location.value).startsWith('epubcfi(')) continue
      try {
        annotations.highlight(mark.location.value, { markId: mark.id }, () => editAnnotation(mark), `mojian-epub-annotation mojian-epub-annotation--${mark.color ?? 'amber'}`)
        highlightedCfis.push(mark.location.value)
      } catch {
        // Invalid locations from an older EPUB version should not block the reader.
      }
    }
    return () => highlightedCfis.forEach((cfi) => {
      try { annotations.remove?.(cfi, 'highlight') } catch { /* rendition already disposed */ }
    })
  }, [marks, renditionVersion])

  useEffect(() => {
    setActiveSearchResultIndex(-1)
    setSearchResultsScrollTop(0)
    if (searchResultsRef.current) searchResultsRef.current.scrollTop = 0
  }, [book.id, searchQuery])

  useEffect(() => {
    setTocQuery('')
    setTocScrollTop(0)
  }, [book.id])

  useEffect(() => {
    setTocScrollTop(0)
    if (tocListRef.current) tocListRef.current.scrollTop = 0
  }, [tocQuery])

  useEffect(() => {
    if (panelMode !== 'toc' || normalizedTocQuery || activeTocChapterPosition < 0) return
    const rail = tocListRef.current
    if (!rail) return
    const locateActiveItem = () => {
      const activeItem = rail.querySelector<HTMLElement>(`[data-toc-index="${activeTocChapterDataIndex}"]`)
      if (!activeItem) return
      const railBounds = rail.getBoundingClientRect()
      const itemBounds = activeItem.getBoundingClientRect()
      if (itemBounds.top < railBounds.top || itemBounds.bottom > railBounds.bottom) {
        activeItem.scrollIntoView({ block: 'nearest' })
      }
    }
    if (shouldVirtualizeToc) {
      const nextScrollTop = Math.max(0, activeTocChapterPosition * TOC_ROW_HEIGHT - rail.clientHeight * 0.4)
      rail.scrollTop = nextScrollTop
      setTocScrollTop(nextScrollTop)
      window.requestAnimationFrame(locateActiveItem)
      return
    }
    locateActiveItem()
  }, [activeTocChapterDataIndex, activeTocChapterPosition, normalizedTocQuery, panelMode, shouldVirtualizeToc])

  useEffect(() => {
    if (activeSearchResultIndex >= visibleSearchResults.length) setActiveSearchResultIndex(-1)
  }, [activeSearchResultIndex, visibleSearchResults.length])

  useEffect(() => {
    if (activeSearchResultIndex < 0) return
    const rail = searchResultsRef.current
    if (!rail) return
    const resultTop = activeSearchResultIndex * SEARCH_RESULT_ROW_HEIGHT
    const resultBottom = resultTop + SEARCH_RESULT_ROW_HEIGHT
    if (resultTop < rail.scrollTop || resultBottom > rail.scrollTop + rail.clientHeight) {
      const nextScrollTop = Math.max(0, resultTop - rail.clientHeight / 2 + SEARCH_RESULT_ROW_HEIGHT / 2)
      if (typeof rail.scrollTo === 'function') rail.scrollTo({ top: nextScrollTop, behavior: 'smooth' })
      else rail.scrollTop = nextScrollTop
      setSearchResultsScrollTop(nextScrollTop)
    }
  }, [activeSearchResultIndex])

  useEffect(() => {
    if (initialMark?.location.type === 'epub') {
      setEpubLocation(initialMark.location.value)
      return
    }
    const index = initialMark?.location.type === 'text'
      ? Number(initialMark.location.value)
      : Math.round((openingProgress / 100) * Math.max(0, paragraphs.length - 1))
    if (!Number.isFinite(index)) return
    const safeIndex = Math.min(Math.max(index, 0), Math.max(0, paragraphs.length - 1))
    setCurrentTextIndex(safeIndex)
    ignoreTextScrollUntilRef.current = Date.now() + 700
    if (isLargeText) {
      setTextWindowStart(textWindowStartForIndex(safeIndex, paragraphs.length))
      window.setTimeout(() => {
        const target = readingCanvasRef.current?.querySelector<HTMLElement>(`[data-paragraph-index="${safeIndex}"]`)
        scrollTextTarget(readingCanvasRef.current, target)
      }, 0)
      return
    }
    const target = readingCanvasRef.current?.querySelector<HTMLElement>(`[data-paragraph-index="${safeIndex}"]`)
    scrollTextTarget(readingCanvasRef.current, target)
  }, [book.id, initialMark, isLargeText, openingProgress, paragraphs.length])

  useEffect(() => {
    if (!isRenderableEpub) return
    setEpubSearchResults([])
    const query = searchQuery.trim()
    if (!query) {
      setEpubSearchQuery('')
      return
    }
    const timer = window.setTimeout(() => setEpubSearchQuery(query), 220)
    return () => window.clearTimeout(timer)
  }, [isRenderableEpub, searchQuery])

  useEffect(() => () => {
    textSearchWorkerRef.current?.terminate()
    textSearchWorkerRef.current = null
  }, [book.id])

  useEffect(() => {
    if (isRenderableEpub) return
    const query = searchQuery.trim()
    const requestId = textSearchRequestRef.current + 1
    textSearchRequestRef.current = requestId
    if (!query) {
      setTextSearchResults([])
      setIsTextSearching(false)
      return
    }
    let worker = textSearchWorkerRef.current
    if (!worker && typeof Worker !== 'undefined' && paragraphs.length >= LONG_TEXT_PARAGRAPH_THRESHOLD) {
      const labels = buildParagraphChapterLabels(paragraphs.length, chapterParagraphEntries)
      worker = new Worker(new URL('../workers/textSearch.worker.ts', import.meta.url), { type: 'module' })
      worker.postMessage({ type: 'initialize', paragraphs, labels })
      worker.onmessage = (event: MessageEvent<{ type: 'results'; requestId: number; results: TextSearchResult[] }>) => {
        if (event.data.type !== 'results' || event.data.requestId !== textSearchRequestRef.current) return
        setTextSearchResults(event.data.results)
        setIsTextSearching(false)
      }
      textSearchWorkerRef.current = worker
    }
    if (worker) {
      setIsTextSearching(true)
      worker.postMessage({ type: 'search', requestId, query })
      return
    }
    const labels = buildParagraphChapterLabels(paragraphs.length, chapterParagraphEntries)
    setTextSearchResults(searchTextOccurrences(paragraphs, labels, query))
    setIsTextSearching(false)
  }, [chapterParagraphEntries, isRenderableEpub, paragraphs, searchQuery])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.themes.fontSize(`${fontSize}px`)
    rendition.themes.default(epubAppearance(fontFamily, fontSize, lineHeight, theme))
  }, [fontFamily, fontSize, lineHeight, theme])

  useEffect(() => {
    const rendition = renditionRef.current
    if (!rendition) return
    rendition.flow(layoutMode === 'double' ? 'paginated' : 'scrolled-doc')
    rendition.spread(layoutMode === 'double' ? 'always' : 'none')
  }, [layoutMode])

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) setIsFocusMode(false)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    function closeFloatingPanels(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setIsSearchOpen(false)
      setIsMoreOpen(false)
    }
    document.addEventListener('keydown', closeFloatingPanels)
    return () => document.removeEventListener('keydown', closeFloatingPanels)
  }, [])

  useEffect(() => {
    if (autoScrollState !== 'playing') return
    let animationFrame = 0
    let previousTime = 0
    let previousFocusUpdate = 0

    function updateTextReadingFocus(canvas: HTMLDivElement) {
      const target = nearestTextReadingTarget(canvas)
      if (!target) return
      const { paragraphIndex: nearestIndex, sentenceKey } = target
      if (sentenceKey !== activeAutoSentenceKeyRef.current) {
        activeAutoSentenceKeyRef.current = sentenceKey
        setActiveAutoSentenceKey(sentenceKey)
      }
      if (nearestIndex !== activeAutoParagraphIndexRef.current) {
        activeAutoParagraphIndexRef.current = nearestIndex
        setActiveAutoParagraphIndex(nearestIndex)
      }
      if (nearestIndex !== currentTextIndexRef.current) {
        currentTextIndexRef.current = nearestIndex
        setCurrentTextIndex(nearestIndex)
      }
      const nextProgress = paragraphs.length <= 1 ? 0 : Math.round((nearestIndex / (paragraphs.length - 1)) * 100)
      if (nextProgress !== progressRef.current) {
        progressRef.current = nextProgress
        setProgress(nextProgress)
        onProgressChangeRef.current(nextProgress)
      }
    }

    function updateEpubReadingFocus(rendition: AutoScrollRendition, container: HTMLElement) {
      const contents = rendition.manager?.getContents?.() ?? []
      const containerBounds = container.getBoundingClientRect()
      const focusLine = containerBounds.top + container.clientHeight * 0.36
      let nearestElement: HTMLElement | null = null
      let nearestRange: Range | null = null
      let nearestRegistry: CssHighlightRegistry | null = null
      let nearestHighlightConstructor: (new (...ranges: Range[]) => unknown) | null = null
      let nearestDistance = Number.POSITIVE_INFINITY

      for (const content of contents) {
        const frameElement = content.window?.frameElement as HTMLElement | null
        const frameBounds = frameElement?.getBoundingClientRect()
        const document = content.document
        if (!document?.elementFromPoint) continue
        const frameTop = frameBounds?.top ?? containerBounds.top
        const localY = focusLine - frameTop
        const localX = Math.max(0, (frameBounds?.width ?? content.window.innerWidth) * 0.5)
        const hit = document.elementFromPoint(localX, localY) as HTMLElement | null
        const candidate = hit?.closest<HTMLElement>('h1, h2, h3, h4, p, li, blockquote') ?? null
        if (candidate) {
          const bounds = candidate.getBoundingClientRect()
          const readingPoint = frameTop + bounds.top + Math.min(bounds.height * 0.32, 32)
          const distance = Math.abs(readingPoint - focusLine)
          if (distance < nearestDistance) {
            nearestDistance = distance
            nearestElement = candidate
            const highlightWindow = content.window as unknown as {
              CSS?: { highlights?: CssHighlightRegistry }
              Highlight?: new (...ranges: Range[]) => unknown
            }
            nearestRegistry = highlightWindow.CSS?.highlights ?? null
            nearestHighlightConstructor = highlightWindow.Highlight ?? null
            nearestRange = nearestRegistry && nearestHighlightConstructor
              ? sentenceRangeAtPoint(candidate, document, localX, localY)
              : null
          }
        }
      }

      if (nearestRange && nearestRegistry && nearestHighlightConstructor) {
        const current = epubSentenceHighlightRef.current
        const isSameRange = current?.registry === nearestRegistry &&
          current.range.startContainer === nearestRange.startContainer &&
          current.range.startOffset === nearestRange.startOffset &&
          current.range.endContainer === nearestRange.endContainer &&
          current.range.endOffset === nearestRange.endOffset
        if (isSameRange) return
        clearEpubSentenceHighlight(current)
        nearestRegistry.set(EPUB_SENTENCE_HIGHLIGHT_NAME, new nearestHighlightConstructor(nearestRange))
        epubSentenceHighlightRef.current = { registry: nearestRegistry, range: nearestRange }
        epubAutoHighlightRef.current?.removeAttribute('data-mojian-reading')
        epubAutoHighlightRef.current = null
        return
      }

      clearEpubSentenceHighlight(epubSentenceHighlightRef.current)
      epubSentenceHighlightRef.current = null
      if (nearestElement === epubAutoHighlightRef.current) return
      epubAutoHighlightRef.current?.removeAttribute('data-mojian-reading')
      nearestElement?.setAttribute('data-mojian-reading', 'true')
      epubAutoHighlightRef.current = nearestElement
    }

    function runFrame(time: number) {
      const elapsed = previousTime === 0 ? 16 : Math.min(80, Math.max(0, time - previousTime))
      previousTime = time
      const distance = AUTO_SCROLL_BASE_SPEED * autoScrollSpeed * (elapsed / 1000)
      let shouldContinue = true

      if (isRenderableEpub) {
        const rendition = renditionRef.current as AutoScrollRendition | null
        const container = rendition?.manager?.container
        if (rendition && container) {
          const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
          container.scrollTop = Math.min(maxScrollTop, container.scrollTop + distance)
          if (time - previousFocusUpdate >= 120 || previousFocusUpdate === 0) {
            updateEpubReadingFocus(rendition, container)
            previousFocusUpdate = time
          }
          if (container.scrollTop >= maxScrollTop - 1) {
            if (rendition.location?.atEnd) {
              shouldContinue = false
            } else if (!epubAdvancePendingRef.current) {
              epubAdvancePendingRef.current = true
              void rendition.next()
                .catch(() => undefined)
                .finally(() => { epubAdvancePendingRef.current = false })
            }
          }
        }
      } else {
        const canvas = readingCanvasRef.current
        if (canvas) {
          const maxScrollTop = Math.max(0, canvas.scrollHeight - canvas.clientHeight)
          canvas.scrollTop = Math.min(maxScrollTop, canvas.scrollTop + distance)
          if (time - previousFocusUpdate >= 120 || previousFocusUpdate === 0) {
            updateTextReadingFocus(canvas)
            previousFocusUpdate = time
          }
          if (canvas.scrollTop >= maxScrollTop - 1) {
            if (isLargeText && textWindowEnd < paragraphs.length) {
              const nextStart = Math.min(
                textWindowStart + TEXT_WINDOW_STEP,
                Math.max(0, paragraphs.length - TEXT_WINDOW_SIZE)
              )
              setTextWindowStart(nextStart)
              setCurrentTextIndex(nextStart)
              setActiveAutoParagraphIndex(nextStart)
              setActiveAutoSentenceKey(`${nextStart}:0`)
              setProgress(paragraphs.length <= 1 ? 0 : Math.round((nextStart / (paragraphs.length - 1)) * 100))
              ignoreTextScrollUntilRef.current = Date.now() + 500
              window.setTimeout(() => {
                if (readingCanvasRef.current) readingCanvasRef.current.scrollTop = 0
              }, 0)
              return
            }
            shouldContinue = false
          }
        }
      }

      if (!shouldContinue) {
        setAutoScrollState('ended')
        return
      }
      animationFrame = window.requestAnimationFrame(runFrame)
    }

    animationFrame = window.requestAnimationFrame(runFrame)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [autoScrollSpeed, autoScrollState, isLargeText, isRenderableEpub, paragraphs.length, textWindowEnd, textWindowStart])

  useEffect(() => () => {
    epubAutoHighlightRef.current?.removeAttribute('data-mojian-reading')
    clearEpubSentenceHighlight(epubSentenceHighlightRef.current)
  }, [])

  useEffect(() => () => {
    if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current)
  }, [])

  useEffect(() => {
    setAutoScrollState('idle')
    setActiveAutoParagraphIndex(null)
    setActiveAutoSentenceKey(null)
    epubAutoHighlightRef.current?.removeAttribute('data-mojian-reading')
    epubAutoHighlightRef.current = null
    clearEpubSentenceHighlight(epubSentenceHighlightRef.current)
    epubSentenceHighlightRef.current = null
    setNavigationBackStack([])
    setNavigationForwardStack([])
    setIsReadingRulerOpen(false)
  }, [book.id])

  function updateProgress(nextProgress: number) {
    const safeProgress = Math.min(100, Math.max(0, Math.round(nextProgress)))
    progressRef.current = safeProgress
    setProgress(safeProgress)
    onProgressChange(safeProgress)
  }

  function pauseAutoScrollForNavigation() {
    setAutoScrollState((state) => state === 'playing' ? 'paused' : state)
  }

  function stopAutoScroll() {
    setAutoScrollState('idle')
    setActiveAutoParagraphIndex(null)
    setActiveAutoSentenceKey(null)
    epubAutoHighlightRef.current?.removeAttribute('data-mojian-reading')
    epubAutoHighlightRef.current = null
    clearEpubSentenceHighlight(epubSentenceHighlightRef.current)
    epubSentenceHighlightRef.current = null
  }

  function startAutoScroll() {
    if (autoScrollState === 'ended') {
      if (isRenderableEpub) {
        setEpubLocation(0)
      } else {
        const canvas = readingCanvasRef.current
        if (canvas) canvas.scrollTop = 0
        if (isLargeText) setTextWindowStart(0)
        setCurrentTextIndex(0)
        setActiveAutoParagraphIndex(0)
        setActiveAutoSentenceKey('0:0')
      }
      updateProgress(0)
    }
    if (layoutMode !== 'continuous') changeLayoutMode('continuous')
    setIsSearchOpen(false)
    setIsSettingsOpen(false)
    setIsMoreOpen(false)
    if (!isRenderableEpub) {
      setActiveAutoParagraphIndex(currentTextIndex)
      setActiveAutoSentenceKey(`${currentTextIndex}:0`)
    }
    setAutoScrollState('playing')
  }

  function toggleAutoScroll() {
    if (autoScrollState === 'playing') {
      ignoreTextScrollUntilRef.current = Date.now() + AUTO_SCROLL_PAUSE_SETTLE_MS
      setAutoScrollState('paused')
      return
    }
    startAutoScroll()
  }

  function adjustAutoScrollSpeed(direction: -1 | 1) {
    setAutoScrollSpeed((speed) => {
      const isFastRange = speed > AUTO_SCROLL_FAST_THRESHOLD || (direction > 0 && speed >= AUTO_SCROLL_FAST_THRESHOLD)
      const step = isFastRange ? AUTO_SCROLL_FAST_STEP : AUTO_SCROLL_SPEED_STEP
      return Math.min(
        AUTO_SCROLL_MAX_SPEED,
        Math.max(AUTO_SCROLL_MIN_SPEED, Number((speed + direction * step).toFixed(2)))
      )
    })
  }

  function textProgressForIndex(index: number) {
    return paragraphs.length <= 1 ? 0 : Math.round((index / (paragraphs.length - 1)) * 100)
  }

  function navigationSnapshot(): ReaderNavigationLocation {
    return {
      type: isRenderableEpub ? 'epub' : 'text',
      value: isRenderableEpub ? String(epubLocation) : String(currentTextIndex),
      progress,
      label: currentLabel
    }
  }

  function sameNavigationLocation(left: ReaderNavigationLocation, right: ReaderNavigationLocation) {
    return left.type === right.type && left.value === right.value
  }

  function rememberNavigationOrigin(destination?: Pick<ReaderNavigationLocation, 'type' | 'value'>) {
    const origin = navigationSnapshot()
    if (destination && origin.type === destination.type && origin.value === destination.value) return
    setNavigationBackStack((stack) => {
      if (stack.length > 0 && sameNavigationLocation(stack[stack.length - 1], origin)) return stack
      return [...stack.slice(-(MAX_NAVIGATION_HISTORY - 1)), origin]
    })
    setNavigationForwardStack([])
  }

  function applyNavigationLocation(location: ReaderNavigationLocation) {
    pauseAutoScrollForNavigation()
    if (location.type === 'epub') setEpubLocation(location.value)
    else jumpToTextLocation(Number(location.value), false)
    updateProgress(location.progress)
  }

  function navigateReadingHistory(direction: 'back' | 'forward') {
    const source = direction === 'back' ? navigationBackStack : navigationForwardStack
    const target = source[source.length - 1]
    if (!target) return
    const origin = navigationSnapshot()
    if (direction === 'back') {
      setNavigationBackStack((stack) => stack.slice(0, -1))
      setNavigationForwardStack((stack) => [...stack.slice(-(MAX_NAVIGATION_HISTORY - 1)), origin])
    } else {
      setNavigationForwardStack((stack) => stack.slice(0, -1))
      setNavigationBackStack((stack) => [...stack.slice(-(MAX_NAVIGATION_HISTORY - 1)), origin])
    }
    applyNavigationLocation(target)
  }

  function jumpToTextChapter(paragraphIndex: number) {
    rememberNavigationOrigin({ type: 'text', value: String(paragraphIndex) })
    jumpToTextLocation(paragraphIndex)
  }

  function jumpToTextLocation(index: number, syncProgress = true) {
    pauseAutoScrollForNavigation()
    const safeIndex = Math.min(Math.max(index, 0), Math.max(0, paragraphs.length - 1))
    setCurrentTextIndex(safeIndex)
    if (autoScrollState !== 'idle') {
      setActiveAutoParagraphIndex(safeIndex)
      setActiveAutoSentenceKey(`${safeIndex}:0`)
    }
    ignoreTextScrollUntilRef.current = Date.now() + 700
    if (isLargeText && (safeIndex < textWindowStart || safeIndex >= textWindowEnd)) {
      setTextWindowStart(textWindowStartForIndex(safeIndex, paragraphs.length))
      window.setTimeout(() => {
        const target = readingCanvasRef.current?.querySelector<HTMLElement>(`[data-paragraph-index="${safeIndex}"]`)
        scrollTextTarget(readingCanvasRef.current, target)
      }, 0)
    } else {
      const target = readingCanvasRef.current?.querySelector<HTMLElement>(`[data-paragraph-index="${safeIndex}"]`)
      scrollTextTarget(readingCanvasRef.current, target)
    }
    if (syncProgress) updateProgress(textProgressForIndex(safeIndex))
  }

  function moveTextWindow(direction: 'previous' | 'next') {
    if (!isLargeText) return
    const maxStart = Math.max(0, paragraphs.length - TEXT_WINDOW_SIZE)
    const nextStart = direction === 'next'
      ? Math.min(maxStart, textWindowStart + TEXT_WINDOW_STEP)
      : Math.max(0, textWindowStart - TEXT_WINDOW_STEP)
    if (nextStart === textWindowStart) return
    const nextIndex = direction === 'next'
      ? nextStart
      : Math.min(paragraphs.length - 1, nextStart + TEXT_WINDOW_SIZE - 1)
    setTextWindowStart(nextStart)
    setCurrentTextIndex(nextIndex)
    if (autoScrollState !== 'idle') {
      setActiveAutoParagraphIndex(nextIndex)
      setActiveAutoSentenceKey(`${nextIndex}:0`)
    }
    updateProgress(textProgressForIndex(nextIndex))
    ignoreTextScrollUntilRef.current = Date.now() + 500
    window.setTimeout(() => {
      const canvas = readingCanvasRef.current
      if (!canvas) return
      const top = direction === 'next' ? 0 : canvas.scrollHeight
      if (typeof canvas.scrollTo === 'function') canvas.scrollTo({ top, behavior: 'auto' })
      else canvas.scrollTop = top
    }, 0)
  }

  function handleEpubLocation(location: string) {
    setEpubLocation(location)
    const renditionHref = (renditionRef.current as Rendition & {
      location?: { start?: { href?: string } }
    } | null)?.location?.start?.href
    const locationHref = location.startsWith('epubcfi(') ? renditionHref : location
    if (locationHref) {
      const normalizedLocationHref = normalizeEpubHref(locationHref)
      const chapterIndex = epubToc.findIndex((chapter) => {
        const normalizedChapterHref = normalizeEpubHref(chapter.href)
        return normalizedChapterHref === normalizedLocationHref ||
          normalizedLocationHref.endsWith(normalizedChapterHref) ||
          normalizedChapterHref.endsWith(normalizedLocationHref)
      })
      if (chapterIndex >= 0) setActiveEpubChapterIndex(chapterIndex)
    }
    if (!location.startsWith('epubcfi(')) return
    try {
      const percentage = renditionRef.current?.book.locations.percentageFromCfi(location)
      if (typeof percentage === 'number' && Number.isFinite(percentage)) updateProgress(percentage * 100)
    } catch {
      // EPUB locations are generated asynchronously; the next location event will retry.
    }
  }

  function seekToProgress(nextProgress: number) {
    pauseAutoScrollForNavigation()
    if (isRenderableEpub) {
      try {
        const location = renditionRef.current?.book.locations.cfiFromPercentage(nextProgress / 100)
        setEpubLocation(location || nextProgress / 100)
      } catch {
        setEpubLocation(nextProgress / 100)
      }
      updateProgress(nextProgress)
      return
    }
    const index = Math.round((nextProgress / 100) * Math.max(0, paragraphs.length - 1))
    jumpToTextLocation(index, false)
    updateProgress(nextProgress)
  }

  function turnPage(direction: 'previous' | 'next') {
    pauseAutoScrollForNavigation()
    if (isRenderableEpub) {
      const action = direction === 'previous' ? renditionRef.current?.prev() : renditionRef.current?.next()
      void action
      return
    }
    const step = layoutMode === 'double' ? 4 : 2
    jumpToTextLocation(currentTextIndex + (direction === 'previous' ? -step : step))
  }

  function changeLayoutMode(nextLayout: ReaderLayout) {
    if (nextLayout === layoutMode) return
    pauseAutoScrollForNavigation()
    setLayoutMode(nextLayout)
    if (isRenderableEpub) return
    ignoreTextScrollUntilRef.current = Date.now() + 700
    window.setTimeout(() => {
      const target = readingCanvasRef.current?.querySelector<HTMLElement>(`[data-paragraph-index="${currentTextIndex}"]`)
      scrollTextTarget(readingCanvasRef.current, target)
    }, 0)
  }

  function updateTextAppearanceKeepingPosition(updateAppearance: () => void) {
    const canvas = readingCanvasRef.current
    if (isRenderableEpub || !canvas) {
      updateAppearance()
      return
    }
    const stableCanvas = canvas
    const anchor = pendingAppearanceAnchorRef.current ?? captureTextViewportAnchor(canvas)
    pendingAppearanceAnchorRef.current = anchor
    ignoreTextScrollUntilRef.current = Date.now() + 700
    canvas.classList.add('reading-canvas--preserving-position')
    updateAppearance()
    if (!anchor) {
      canvas.classList.remove('reading-canvas--preserving-position')
      return
    }
    const stableAnchor = anchor
    if (appearanceRestoreFrameRef.current !== null) window.cancelAnimationFrame(appearanceRestoreFrameRef.current)
    appearanceRestoreFrameRef.current = window.requestAnimationFrame((startedAt) => {
      function restoreAnchor(frameTime: number) {
        const currentCanvas = readingCanvasRef.current
        if (!currentCanvas) {
          stableCanvas.classList.remove('reading-canvas--preserving-position')
          appearanceRestoreFrameRef.current = null
          pendingAppearanceAnchorRef.current = null
          return
        }
        const currentTop = sentenceElementByKey(currentCanvas, stableAnchor.sentenceKey)?.getBoundingClientRect().top ?? Number.NaN
        if (Number.isFinite(currentTop)) {
          const delta = currentTop - stableAnchor.viewportTop
          if (Math.abs(delta) > 0.5) currentCanvas.scrollTop += delta
        }
        ignoreTextScrollUntilRef.current = Date.now() + 250
        if (frameTime - startedAt < 280) {
          appearanceRestoreFrameRef.current = window.requestAnimationFrame(restoreAnchor)
          return
        }

        appearanceRestoreFrameRef.current = null
        pendingAppearanceAnchorRef.current = null
        currentCanvas.classList.remove('reading-canvas--preserving-position')
        const activeSelection = window.getSelection()
        if (selectionTools && activeSelection && !activeSelection.isCollapsed && activeSelection.rangeCount > 0) {
          setSelectionTools((current) => current
            ? { ...current, ...selectionToolsAnchor(activeSelection.getRangeAt(0)) }
            : current)
        }
      }

      restoreAnchor(startedAt)
    })
  }

  function adjustFontSize(delta: number) {
    updateTextAppearanceKeepingPosition(() => {
      setFontSize((size) => Math.min(32, Math.max(14, size + delta)))
    })
  }

  function applyReaderProfile(profile: ReaderProfile) {
    updateTextAppearanceKeepingPosition(() => {
      setFontSize(profile.fontSize)
      setFontFamily(profile.fontFamily)
      setLineHeight(profile.lineHeight)
      setColumnWidth(profile.columnWidth)
      setLayoutMode(profile.layoutMode)
      setTheme(profile.theme)
    })
  }

  function saveCurrentReaderProfile() {
    if (!newProfileName.trim()) return
    const saved = saveCustomReaderProfile(newProfileName, {
      fontSize,
      fontFamily,
      lineHeight,
      columnWidth,
      layoutMode,
      theme
    })
    setCustomReaderProfiles((profiles) => {
      const exists = profiles.some((profile) => profile.id === saved.id)
      return exists ? profiles.map((profile) => profile.id === saved.id ? saved : profile) : [...profiles, saved]
    })
    setNewProfileName('')
  }

  function removeCurrentReaderProfile() {
    if (!activeReaderProfileId.startsWith('custom-')) return
    deleteCustomReaderProfile(activeReaderProfileId)
    setCustomReaderProfiles((profiles) => profiles.filter((profile) => profile.id !== activeReaderProfileId))
  }

  function jumpToMark(mark: ReadingMark) {
    pauseAutoScrollForNavigation()
    rememberNavigationOrigin({ type: mark.location.type, value: mark.location.value })
    if (mark.location.type === 'epub') {
      setEpubLocation(mark.location.value)
    } else {
      jumpToTextLocation(Number(mark.location.value), false)
    }
    updateProgress(mark.progress)
  }

  function createMarkDraft(kind: ReadingMarkKind, note?: string): ReadingMarkDraft {
    const selectedIndex = kind === 'annotation' ? annotationSelection?.paragraphIndex : undefined
    const selectionProgress = selectedIndex === undefined || paragraphs.length <= 1
      ? currentTextProgress
      : Math.round((selectedIndex / (paragraphs.length - 1)) * 100)
    return {
      kind,
      location: kind === 'annotation' && annotationEpubCfi
        ? { type: 'epub', value: annotationEpubCfi }
        : selectedIndex === undefined ? currentLocation : { type: 'text', value: String(selectedIndex) },
      label: selectedIndex === undefined ? currentLabel : chapterTitleAt(selectedIndex),
      excerpt: (kind === 'annotation' ? annotationExcerpt : currentExcerpt).slice(0, 180),
      note,
      progress: isRenderableEpub ? progress : selectionProgress,
      selection: kind === 'annotation' ? annotationSelection : undefined,
      color: kind === 'annotation' ? annotationColor : undefined
    }
  }

  function toggleBookmark() {
    if (currentBookmark) onRemoveMark(currentBookmark.id)
    else onAddMark(createMarkDraft('bookmark'))
  }

  function captureTextSelection() {
    if (isRenderableEpub) return
    const domSelection = window.getSelection()
    const selection = selectedTextRange(domSelection)
    if (!selection) {
      setSelectionTools(null)
      return
    }
    pendingTextSelectionRef.current = selection
    const anchor = domSelection && domSelection.rangeCount > 0
      ? selectionToolsAnchor(domSelection.getRangeAt(0))
      : { anchorX: window.innerWidth / 2, anchorY: 84, placement: 'below' as const }
    setSelectionTools({ text: selection.exact, selection, ...anchor })
  }

  function refreshTextSelectionToolsPosition() {
    if (!selectionTools || selectionPositionFrameRef.current !== null) return
    selectionPositionFrameRef.current = window.requestAnimationFrame(() => {
      selectionPositionFrameRef.current = null
      const activeSelection = window.getSelection()
      if (!activeSelection || activeSelection.isCollapsed || activeSelection.rangeCount === 0) {
        setSelectionTools(null)
        return
      }
      setSelectionTools((current) => current
        ? { ...current, ...selectionToolsAnchor(activeSelection.getRangeAt(0)) }
        : current)
    })
  }

  function attachEpubSelectionListeners() {
    if (!isRenderableEpub) return
    const contents = (renditionRef.current as AutoScrollRendition | null)?.manager?.getContents?.() ?? []
    contents.forEach((content) => {
      if (epubSelectionDocumentsRef.current.has(content.document)) return
      const handleSelection = () => {
        const selection = content.window.getSelection()
        const text = selection?.toString().trim() ?? ''
        if (!selection || !text || selection.rangeCount === 0) {
          setSelectionTools(null)
          return
        }
        let epubCfi = ''
        const range = selection.getRangeAt(0)
        try { epubCfi = content.cfiFromRange?.(range) ?? '' } catch { epubCfi = '' }
        let frameBounds: DOMRect | undefined
        try {
          const frame = content.window.frameElement as HTMLElement | null
          frameBounds = frame?.getBoundingClientRect()
        } catch {
          frameBounds = undefined
        }
        const anchor = selectionToolsAnchor(range, frameBounds?.left ?? 0, frameBounds?.top ?? 0)
        setSelectionTools({ text: text.slice(0, 500), epubCfi, ...anchor })
      }
      const handleRulerPointerMove: EventListener = (event) => {
        if (!readingRulerOpenRef.current) return
        const canvas = readingCanvasRef.current
        if (!canvas) return
        const canvasBounds = canvas.getBoundingClientRect()
        if (canvasBounds.height <= 0) return
        let frameTop = canvasBounds.top
        try {
          frameTop = (content.window.frameElement as HTMLElement | null)?.getBoundingClientRect().top ?? frameTop
        } catch {
          // Fall back to the reading canvas when the frame element is unavailable.
        }
        const globalY = frameTop + (event as MouseEvent).clientY
        const position = Math.min(92, Math.max(8, Math.round(((globalY - canvasBounds.top) / canvasBounds.height) * 100)))
        setReadingRulerPosition(position)
      }
      content.document.addEventListener('mouseup', handleSelection)
      content.document.addEventListener('keyup', handleSelection)
      content.document.addEventListener('scroll', handleSelection, true)
      content.document.addEventListener('pointermove', handleRulerPointerMove)
      epubSelectionDocumentsRef.current.set(content.document, { selection: handleSelection, rulerPointerMove: handleRulerPointerMove })
    })
  }

  async function copySelectedText() {
    if (!selectionTools) return
    await writeClipboardText(selectionTools.text)
    setSelectionTools(null)
  }

  async function writeClipboardText(value: string) {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value)
    else {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      document.execCommand?.('copy')
      textarea.remove()
    }
  }

  function showCopyNotice(message: string) {
    if (copyNoticeTimerRef.current !== null) window.clearTimeout(copyNoticeTimerRef.current)
    setCopyNotice(message)
    copyNoticeTimerRef.current = window.setTimeout(() => {
      setCopyNotice('')
      copyNoticeTimerRef.current = null
    }, 2200)
  }

  async function copySelectedTextWithCitation() {
    if (!selectionTools) return
    const citationLabel = selectionTools.selection
      ? chapterTitleAt(selectionTools.selection.paragraphIndex)
      : currentLabel
    const citation = `“${selectionTools.text}”\n——《${book.title}》${book.author ? `，${book.author}` : ''} · ${citationLabel}`
    await writeClipboardText(citation)
    setSelectionTools(null)
    showCopyNotice('已复制正文与出处')
  }

  function openSelectedTextExternally(kind: 'lookup' | 'translate') {
    if (!selectionTools) return
    const encoded = encodeURIComponent(selectionTools.text)
    const url = kind === 'lookup'
      ? `https://zh.wiktionary.org/wiki/${encoded}`
      : `https://translate.google.com/?sl=auto&tl=zh-CN&text=${encoded}&op=translate`
    window.open(url, '_blank', 'noopener,noreferrer')
    setSelectionTools(null)
  }

  function applyBookSpeechVoice(utterance: SpeechSynthesisUtterance) {
    const voice = resolveBookSpeechVoice(speechVoices, bookSpeechVoice)
    utterance.voice = voice
    utterance.lang = voice?.lang || 'zh-CN'
  }

  function changeBookSpeechVoice(voiceURI: string) {
    if (narrationState !== 'idle' || isVoicePreviewing) stopNarration()
    if (!voiceURI) {
      clearBookSpeechVoice(book.id)
      setBookSpeechVoice(null)
      return
    }
    const voice = speechVoices.find((item) => item.voiceURI === voiceURI)
    if (!voice) return
    setBookSpeechVoice(saveBookSpeechVoice(book.id, voice))
  }

  function previewBookSpeechVoice() {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
    stopAutoScroll()
    stopNarration()
    const utterance = new SpeechSynthesisUtterance('声音试听：愿你在文字里，听见更适合这本书的节奏。')
    applyBookSpeechVoice(utterance)
    utterance.rate = speechRate
    const finishPreview = () => {
      if (voicePreviewUtteranceRef.current !== utterance) return
      voicePreviewUtteranceRef.current = null
      setIsVoicePreviewing(false)
    }
    utterance.onend = finishPreview
    utterance.onerror = finishPreview
    voicePreviewUtteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setIsVoicePreviewing(true)
  }

  function openSystemVoiceHelp() {
    window.open(systemVoiceHelpUrl(), '_blank', 'noopener,noreferrer')
  }

  function annotateSelectedText() {
    if (!selectionTools) return
    setAnnotationSelection(selectionTools.selection)
    setAnnotationEpubCfi(selectionTools.epubCfi ?? null)
    setAnnotationExcerpt(selectionTools.text.slice(0, 180))
    setAnnotationNote('')
    setAnnotationColor('amber')
    setEditingAnnotationId(null)
    setIsAnnotationOpen(true)
    setSelectionTools(null)
  }

  function speakSelectedText() {
    if (!selectionTools || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
    const textToSpeak = selectionTools.text
    stopAutoScroll()
    stopNarration()
    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    applyBookSpeechVoice(utterance)
    utterance.rate = speechRate
    utterance.onend = () => { setNarrationState('ended'); utteranceRef.current = null }
    utterance.onerror = () => { setNarrationState('idle'); utteranceRef.current = null }
    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setNarrationState('playing')
    setSelectionTools(null)
  }

  function openAnnotation() {
    let epubExact = ''
    let epubCfi: string | null = null
    if (isRenderableEpub) {
      const contents = (renditionRef.current as AutoScrollRendition | null)?.manager?.getContents?.() ?? []
      for (const content of contents) {
        const selection = content.window.getSelection()
        const exact = selection?.toString().trim() ?? ''
        if (!selection || !exact || selection.rangeCount === 0) continue
        epubExact = exact
        try { epubCfi = content.cfiFromRange?.(selection.getRangeAt(0)) ?? null } catch { epubCfi = null }
        break
      }
    }
    const selection = isRenderableEpub ? undefined : selectedTextRange(window.getSelection()) ?? pendingTextSelectionRef.current
    pendingTextSelectionRef.current = undefined
    setAnnotationSelection(selection)
    setAnnotationEpubCfi(epubCfi)
    setAnnotationExcerpt((selection?.exact || epubExact || currentExcerpt).slice(0, 180))
    setAnnotationNote('')
    setAnnotationColor('amber')
    setEditingAnnotationId(null)
    setIsAnnotationOpen(true)
  }

  function editAnnotation(mark: ReadingMark) {
    if (mark.kind !== 'annotation') return
    setAnnotationExcerpt(mark.excerpt)
    setAnnotationSelection(mark.selection)
    setAnnotationEpubCfi(mark.location.type === 'epub' ? mark.location.value : null)
    setAnnotationNote(mark.note ?? '')
    setAnnotationColor(mark.color ?? 'amber')
    setEditingAnnotationId(mark.id)
    setIsAnnotationOpen(true)
  }

  function saveAnnotation() {
    const note = annotationNote.trim()
    if (!note) return
    const draft = createMarkDraft('annotation', note)
    const existing = editingAnnotationId ? marks.find((mark) => mark.id === editingAnnotationId) : undefined
    if (existing && onUpdateMark) onUpdateMark({ ...existing, ...draft })
    else onAddMark(draft)
    setIsAnnotationOpen(false)
    setAnnotationNote('')
    setEditingAnnotationId(null)
    setAnnotationEpubCfi(null)
  }

  function handleTextScroll() {
    refreshTextSelectionToolsPosition()
    if (autoScrollState === 'playing') return
    if (Date.now() < ignoreTextScrollUntilRef.current) return
    const canvas = readingCanvasRef.current
    if (!canvas) return
    const threshold = canvas.getBoundingClientRect().top + 140
    let nearestIndex = 0
    canvas.querySelectorAll<HTMLElement>('[data-paragraph-index]').forEach((element) => {
      if (element.getBoundingClientRect().top <= threshold) nearestIndex = Number(element.dataset.paragraphIndex ?? 0)
    })
    if (autoScrollState !== 'idle') {
      const target = nearestTextReadingTarget(canvas)
      if (target) {
        setActiveAutoParagraphIndex(target.paragraphIndex)
        setActiveAutoSentenceKey(target.sentenceKey)
        nearestIndex = target.paragraphIndex
      }
    }
    if (nearestIndex === currentTextIndex) return
    setCurrentTextIndex(nearestIndex)
    const nextProgress = textProgressForIndex(nearestIndex)
    if (nextProgress !== progress) updateProgress(nextProgress)
  }

  function jumpToSearchResult(result: EpubSearchResult | TextSearchResult, resultIndex: number) {
    pauseAutoScrollForNavigation()
    if ('cfi' in result) {
      rememberNavigationOrigin({ type: 'epub', value: result.cfi })
      setEpubLocation(result.cfi)
    } else {
      rememberNavigationOrigin({ type: 'text', value: String(result.index) })
      jumpToTextLocation(result.index)
    }
    setActiveSearchResultIndex(resultIndex)
  }

  function moveBetweenSearchResults(direction: -1 | 1) {
    if (visibleSearchResults.length === 0) return
    const nextIndex = activeSearchResultIndex === -1
      ? (direction === 1 ? 0 : visibleSearchResults.length - 1)
      : (activeSearchResultIndex + direction + visibleSearchResults.length) % visibleSearchResults.length
    jumpToSearchResult(visibleSearchResults[nextIndex], nextIndex)
  }

  function jumpToStart() {
    pauseAutoScrollForNavigation()
    rememberNavigationOrigin({ type: isRenderableEpub ? 'epub' : 'text', value: '0' })
    if (isRenderableEpub) {
      setEpubLocation(0)
      updateProgress(0)
    } else {
      setCurrentTextIndex(0)
      if (autoScrollState !== 'idle') {
        setActiveAutoParagraphIndex(0)
        setActiveAutoSentenceKey('0:0')
      }
      if (isLargeText) setTextWindowStart(0)
      ignoreTextScrollUntilRef.current = Date.now() + 700
      const canvas = readingCanvasRef.current
      if (canvas && typeof canvas.scrollTo === 'function') {
        canvas.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        const target = canvas?.querySelector<HTMLElement>('[data-paragraph-index="0"]')
        scrollTextTarget(canvas, target)
      }
      updateProgress(0)
    }
    setIsMoreOpen(false)
  }

  async function toggleFullscreen() {
    const nextFocusMode = !isFocusMode
    setIsFocusMode(nextFocusMode)
    setIsMoreOpen(false)
    try {
      if (nextFocusMode && !document.fullscreenElement) await document.documentElement.requestFullscreen?.()
      else if (!nextFocusMode && document.fullscreenElement) await document.exitFullscreen?.()
    } catch {
      // Focus mode remains available when a browser blocks the native fullscreen request.
    }
  }

  function exportReadingMarks() {
    const lines = [
      `# 《${book.title}》阅读记录`, '', `作者：${book.author}`, `导出时间：${new Date().toLocaleString('zh-CN')}`, '',
      ...(marks.length > 0
        ? marks.flatMap((mark) => [
            `## ${mark.kind === 'bookmark' ? '书签' : '标注'} · ${mark.label}`, '', `进度：${mark.progress}%`,
            mark.excerpt ? `> ${mark.excerpt}` : '', mark.note ? `\n${mark.note}` : '', ''
          ])
        : ['暂无书签或标注。'])
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${safeFileName(book.title)}-阅读记录.md`
    anchor.click()
    URL.revokeObjectURL(url)
    setIsMoreOpen(false)
  }

  function stopNarration() {
    if (narrationRestartTimerRef.current !== null) {
      window.clearTimeout(narrationRestartTimerRef.current)
      narrationRestartTimerRef.current = null
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    utteranceRef.current = null
    voicePreviewUtteranceRef.current = null
    setIsVoicePreviewing(false)
    setNarrationState('idle')
    setActiveNarrationSentenceKey(null)
  }

  function speakTextAt(index: number, rate = speechRate) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
    const safeIndex = Math.min(Math.max(index, 0), Math.max(0, paragraphs.length - 1))
    const paragraph = paragraphs[safeIndex]
    if (!paragraph) {
      setNarrationState('ended')
      setActiveNarrationSentenceKey(null)
      return
    }
    narrationIndexRef.current = safeIndex
    if (!isRenderableEpub) {
      jumpToTextLocation(safeIndex, false)
      setActiveNarrationSentenceKey(`${safeIndex}:0`)
    }
    const utterance = new SpeechSynthesisUtterance(paragraph)
    applyBookSpeechVoice(utterance)
    utterance.rate = rate
    utterance.onboundary = (event) => {
      if (isRenderableEpub || typeof event.charIndex !== 'number') return
      const segments = sentenceSegmentsCache.get(safeIndex) ?? splitIntoSentenceSegments(paragraph)
      sentenceSegmentsCache.set(safeIndex, segments)
      const sentenceIndex = Math.max(0, segments.findIndex((segment) => event.charIndex < segment.end))
      setActiveNarrationSentenceKey(`${safeIndex}:${sentenceIndex}`)
    }
    utterance.onend = () => {
      if (utteranceRef.current !== utterance) return
      const nextIndex = safeIndex + 1
      if (nextIndex >= paragraphs.length || isRenderableEpub) {
        utteranceRef.current = null
        setNarrationState('ended')
        setActiveNarrationSentenceKey(null)
        return
      }
      speakTextAt(nextIndex, rate)
    }
    utterance.onerror = () => {
      if (utteranceRef.current !== utterance) return
      utteranceRef.current = null
      setNarrationState('idle')
      setActiveNarrationSentenceKey(null)
    }
    utteranceRef.current = utterance
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setNarrationState('playing')
  }

  function startNarration() {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return
    stopAutoScroll()
    if (isRenderableEpub) {
      const visibleText = (renditionRef.current as AutoScrollRendition | null)?.manager?.getContents?.()[0]?.document.body?.innerText?.trim()
      if (!visibleText) return
      const utterance = new SpeechSynthesisUtterance(visibleText)
      applyBookSpeechVoice(utterance)
      utterance.rate = speechRate
      utterance.onend = () => { setNarrationState('ended'); utteranceRef.current = null }
      utterance.onerror = () => { setNarrationState('idle'); utteranceRef.current = null }
      utteranceRef.current = utterance
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
      setNarrationState('playing')
      return
    }
    speakTextAt(narrationState === 'ended' ? 0 : currentTextIndex)
  }

  function toggleNarration() {
    if (!('speechSynthesis' in window)) return
    if (narrationState === 'playing') {
      window.speechSynthesis.pause()
      setNarrationState('paused')
      return
    }
    if (narrationState === 'paused') {
      window.speechSynthesis.resume()
      setNarrationState('playing')
      return
    }
    startNarration()
  }

  function changeSpeechRate(nextRate: number) {
    setSpeechRate(nextRate)
    if (narrationState === 'playing' || narrationState === 'paused') {
      const index = narrationIndexRef.current
      window.speechSynthesis.cancel()
      if (narrationRestartTimerRef.current !== null) window.clearTimeout(narrationRestartTimerRef.current)
      narrationRestartTimerRef.current = window.setTimeout(() => {
        narrationRestartTimerRef.current = null
        speakTextAt(index, nextRate)
      }, 0)
    }
  }

  function configureRendition(rendition: Rendition) {
    renditionRef.current = rendition
    setRenditionVersion((version) => version + 1)
    rendition.themes.fontSize(`${fontSize}px`)
    rendition.themes.default(epubAppearance(fontFamily, fontSize, lineHeight, theme))
    rendition.flow(layoutMode === 'double' ? 'paginated' : 'scrolled-doc')
    rendition.spread(layoutMode === 'double' ? 'always' : 'none')
    const renditionWithEvents = rendition as Rendition & { on?: (event: string, listener: () => void) => void }
    renditionWithEvents.on?.('rendered', () => window.setTimeout(attachEpubSelectionListeners, 0))
    window.setTimeout(attachEpubSelectionListeners, 0)
    void rendition.book.locations.generate(1200).catch(() => undefined)
  }

  function renderSentenceSpans(paragraph: string, paragraphIndex: number) {
    let segments = sentenceSegmentsCache.get(paragraphIndex)
    if (!segments) {
      segments = splitIntoSentenceSegments(paragraph)
      sentenceSegmentsCache.set(paragraphIndex, segments)
    }
    return segments.map((segment, sentenceIndex) => {
      const sentenceKey = `${paragraphIndex}:${sentenceIndex}`
      const isReadingSentence = (autoScrollState !== 'idle' && activeAutoSentenceKey === sentenceKey) ||
        (narrationState !== 'idle' && activeNarrationSentenceKey === sentenceKey)
      return (
        <span
          className={isReadingSentence ? 'reader-sentence auto-reading-sentence' : 'reader-sentence'}
          data-sentence-key={sentenceKey}
          aria-current={isReadingSentence ? 'true' : undefined}
          key={`${sentenceKey}-${segment.start}-${segment.end}`}
        >{renderAnnotatedSegment(segment, paragraphIndex)}</span>
      )
    })
  }

  function renderAnnotatedSegment(segment: SentenceSegment, paragraphIndex: number) {
    const annotations = textAnnotationsByParagraph.get(paragraphIndex)
    if (!annotations?.length) return segment.text
    const pieces: React.ReactNode[] = []
    let cursor = segment.start

    for (const mark of annotations) {
      const selection = mark.selection
      if (!selection || selection.end <= segment.start || selection.start >= segment.end) continue
      const highlightStart = Math.max(cursor, segment.start, selection.start)
      const highlightEnd = Math.min(segment.end, selection.end)
      if (highlightEnd <= highlightStart) continue
      if (highlightStart > cursor) pieces.push(segment.text.slice(cursor - segment.start, highlightStart - segment.start))
      pieces.push(
        <mark
          className={`reader-annotation-highlight reader-annotation-highlight--${mark.color ?? 'amber'}`}
          data-annotation-id={mark.id}
          key={`${mark.id}-${highlightStart}-${highlightEnd}`}
          role="button"
          tabIndex={0}
          aria-label={`编辑标注：${mark.excerpt}`}
          title={mark.note || '打开标注'}
          onClick={() => editAnnotation(mark)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              editAnnotation(mark)
            }
          }}
        >{segment.text.slice(highlightStart - segment.start, highlightEnd - segment.start)}</mark>
      )
      cursor = highlightEnd
    }
    if (cursor < segment.end) pieces.push(segment.text.slice(cursor - segment.start))
    return pieces.length ? pieces : segment.text
  }

  const readerShortcutRef = useRef({
    isAnnotationOpen,
    isSearchOpen,
    isMoreOpen,
    turnPage,
    toggleAutoScroll,
    toggleNarration,
    toggleFullscreen,
    toggleReadingRuler,
    navigateReadingHistory
  })
  readerShortcutRef.current = {
    isAnnotationOpen,
    isSearchOpen,
    isMoreOpen,
    turnPage,
    toggleAutoScroll,
    toggleNarration,
    toggleFullscreen,
    toggleReadingRuler,
    navigateReadingHistory
  }

  useEffect(() => {
    function handleReaderShortcut(event: KeyboardEvent) {
      const target = event.target
      const isTyping = target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')
      const actions = readerShortcutRef.current
      if (event.key === 'Escape') {
        if (actions.isAnnotationOpen) setIsAnnotationOpen(false)
        else if (actions.isSearchOpen) setIsSearchOpen(false)
        else if (actions.isMoreOpen) setIsMoreOpen(false)
        return
      }
      if (!isTyping && event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Backspace') {
        event.preventDefault()
        actions.navigateReadingHistory(event.shiftKey ? 'forward' : 'back')
        return
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        actions.turnPage('previous')
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        actions.turnPage('next')
      } else if (event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault()
        actions.toggleAutoScroll()
      } else if (event.key.toLocaleLowerCase() === 'v') {
        event.preventDefault()
        actions.toggleNarration()
      } else if (event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault()
        void actions.toggleFullscreen()
      } else if (event.key.toLocaleLowerCase() === 'r') {
        event.preventDefault()
        actions.toggleReadingRuler()
      }
    }
    window.addEventListener('keydown', handleReaderShortcut)
    return () => window.removeEventListener('keydown', handleReaderShortcut)
  }, [])

  function clampTocWidth(width: number) {
    return Math.min(MAX_READER_TOC_WIDTH, Math.max(MIN_READER_TOC_WIDTH, Math.round(width)))
  }

  function toggleReadingRuler() {
    setIsReadingRulerOpen((open) => !open)
    setIsMoreOpen(false)
  }

  function handleReadingRulerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!isReadingRulerOpen) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.height <= 0) return
    const position = Math.min(92, Math.max(8, Math.round(((event.clientY - bounds.top) / bounds.height) * 100)))
    setReadingRulerPosition(position)
  }

  function handleTocResizePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    tocResizeStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: tocWidth
    }
    setTocTitleTooltip(null)
    setIsTocResizing(true)
  }

  function handleTocResizePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = tocResizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    setTocWidth(clampTocWidth(start.startWidth + event.clientX - start.startX))
  }

  function finishTocResize(event: ReactPointerEvent<HTMLDivElement>) {
    const start = tocResizeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    tocResizeStartRef.current = null
    setIsTocResizing(false)
  }

  function handleTocResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextWidth: number | null = null
    if (event.key === 'ArrowLeft') nextWidth = tocWidth - 16
    else if (event.key === 'ArrowRight') nextWidth = tocWidth + 16
    else if (event.key === 'Home') nextWidth = MIN_READER_TOC_WIDTH
    else if (event.key === 'End') nextWidth = MAX_READER_TOC_WIDTH
    if (nextWidth === null) return
    event.preventDefault()
    event.stopPropagation()
    setTocWidth(clampTocWidth(nextWidth))
  }

  function showTocTitleTooltip(button: HTMLButtonElement, title: string) {
    const titleElement = button.querySelector<HTMLElement>('.toc-item__title')
    if (!titleElement || titleElement.scrollWidth <= titleElement.clientWidth) {
      setTocTitleTooltip(null)
      return
    }
    const bounds = titleElement.getBoundingClientRect()
    const left = Math.min(bounds.right + 14, window.innerWidth - 236)
    setTocTitleTooltip({
      title,
      left: Math.max(12, left),
      top: Math.min(window.innerHeight - 76, Math.max(12, bounds.top - 9)),
      maxWidth: Math.min(460, Math.max(220, window.innerWidth - left - 18))
    })
  }

  function hideTocTitleTooltip() {
    setTocTitleTooltip(null)
  }

  function renderEpubTocEntries(entries: typeof filteredEpubChapters) {
    return entries.map(({ chapter, chapterIndex }) => {
      const presentation = chapterProgressPresentation(
        chapterIndex,
        epubChapterStorageKey(chapter, chapterIndex),
        activeEpubChapterProgress
      )
      const isActive = activeEpubChapterIndex === chapterIndex
      return (
        <button
          key={`${chapter.href}-${chapterIndex}`}
          type="button"
          data-toc-index={chapterIndex}
          className={isActive ? 'toc-item--active' : ''}
          aria-current={isActive ? 'location' : undefined}
          onMouseEnter={(event) => showTocTitleTooltip(event.currentTarget, chapter.label)}
          onMouseLeave={hideTocTitleTooltip}
          onFocus={(event) => showTocTitleTooltip(event.currentTarget, chapter.label)}
          onBlur={hideTocTitleTooltip}
          onClick={() => {
            hideTocTitleTooltip()
            pauseAutoScrollForNavigation()
            rememberNavigationOrigin({ type: 'epub', value: chapter.href })
            setActiveEpubChapterIndex(chapterIndex)
            setEpubLocation(chapter.href)
          }}
        >
          {renderTocEntryContent(chapter.label, chapterIndex, presentation)}
        </button>
      )
    })
  }

  function renderTextTocEntries(entries: TextChapterEntry[]) {
    return entries.map((chapter) => {
      const chapterPosition = chapterParagraphEntries.indexOf(chapter)
      const presentation = chapterProgressPresentation(
        chapterPosition,
        textChapterStorageKey(chapter),
        activeTextChapterProgress
      )
      const isActive = activeTextChapter?.chapterIndex === chapter.chapterIndex
      return (
        <button
          key={`${chapter.title}-${chapter.chapterIndex}`}
          type="button"
          data-toc-index={chapter.chapterIndex}
          className={isActive ? 'toc-item--active' : ''}
          aria-current={isActive ? 'location' : undefined}
          onMouseEnter={(event) => showTocTitleTooltip(event.currentTarget, chapter.title)}
          onMouseLeave={hideTocTitleTooltip}
          onFocus={(event) => showTocTitleTooltip(event.currentTarget, chapter.title)}
          onBlur={hideTocTitleTooltip}
          onClick={() => {
            hideTocTitleTooltip()
            jumpToTextChapter(chapter.paragraphIndex)
          }}
        >
          {renderTocEntryContent(chapter.title, chapter.chapterIndex, presentation)}
        </button>
      )
    })
  }

  function renderTocEntryContent(
    title: string,
    chapterIndex: number,
    presentation: ReturnType<typeof chapterProgressPresentation>
  ) {
    return (
      <>
        <span className="toc-item__index">{String(chapterIndex + 1).padStart(2, '0')}</span>
        <span className="toc-item__copy">
          <strong className="toc-item__title" title={title}>{title}</strong>
          <span className="toc-item__meta">
            <span>{presentation.progressLabel}</span>
            <time dateTime={presentation.lastReadAt ? new Date(presentation.lastReadAt).toISOString() : undefined}>
              {presentation.timeLabel}
            </time>
          </span>
          <span className="toc-item__progress" aria-hidden="true">
            <span style={{ width: `${presentation.progress}%` }} />
          </span>
        </span>
      </>
    )
  }

  const autoScrollStatusLabel = autoScrollState === 'playing'
    ? '正在阅读'
    : autoScrollState === 'paused'
      ? '已暂停'
      : '已到书末'
  const autoScrollSpeedLabel = `${Number(autoScrollSpeed.toFixed(2))}×`
  const autoScrollButtonLabel = autoScrollState === 'playing'
    ? '暂停自动滚动'
    : autoScrollState === 'paused'
      ? '恢复自动滚动'
      : autoScrollState === 'ended'
        ? '从头开始自动滚动'
        : '开始自动滚动'

  return (
    <div
      className={`reader-shell${isSettingsOpen ? '' : ' reader-shell--settings-closed'}${isFocusMode ? ' reader-shell--focus' : ''}${isTocResizing ? ' reader-shell--toc-resizing' : ''}${bookReadingBackground.image ? ' reader-shell--book-background-image' : ''}`}
      data-theme={theme}
      data-layout={layoutMode}
      data-book-background={bookReadingBackground.preset}
      data-text-index={persistedTextIndex ? 'persisted' : 'runtime'}
      style={{
        '--reader-toc-width': `${tocWidth}px`,
        '--book-reading-background-image': bookReadingBackground.image ? `url("${bookReadingBackground.image}")` : 'none'
      } as CSSProperties}
    >
      <aside className="reader-toc">
        <div className="reader-panel__header">
          <button className="icon-button" type="button" aria-label="返回书架" onClick={onBack}><ArrowLeft size={19} /></button>
          <div className="reader-brand"><BookOpen size={17} /> 墨简</div>
        </div>

        <div className="reader-book-meta">
          <span>{book.format.toUpperCase()} · {book.source === 'local' ? '本地书籍' : '演示书籍'}</span>
          <h1>{book.title}</h1>
          <p>{book.author}</p>
          <div className="reader-book-stats">{formatBookContentStats(book)}</div>
        </div>

        <div className="reader-panel-tabs" aria-label="阅读导航">
          <button type="button" className={panelMode === 'toc' ? 'reader-panel-tab reader-panel-tab--active' : 'reader-panel-tab'} onClick={() => setPanelMode('toc')}>
            <List size={14} /> 目录
          </button>
          <button type="button" className={panelMode === 'marks' ? 'reader-panel-tab reader-panel-tab--active' : 'reader-panel-tab'} onClick={() => setPanelMode('marks')}>
            <Bookmark size={14} /> 阅读记录 <span>{marks.length}</span>
          </button>
        </div>
        {panelMode === 'toc' ? (
          <>
            <div className="toc-heading">
              <span>章节目录</span>
              <small>{normalizedTocQuery ? `${filteredTocCount} / ${tocTotal}` : tocTotal} 节</small>
            </div>
            <label className="toc-search-field">
              <Search size={14} />
              <input
                type="search"
                aria-label="搜索目录"
                placeholder="搜索章节名称"
                value={tocQuery}
                onChange={(event) => setTocQuery(event.target.value)}
              />
              {tocQuery && <button type="button" aria-label="清空目录搜索" onClick={() => setTocQuery('')}><X size={13} /></button>}
            </label>
            <nav
              className={shouldVirtualizeToc ? 'toc-list toc-list--virtual' : 'toc-list'}
              aria-label="书籍目录"
              ref={tocListRef}
              onScroll={(event) => {
                setTocScrollTop(event.currentTarget.scrollTop)
                hideTocTitleTooltip()
              }}
            >
              {filteredTocCount === 0 ? (
                <div className="toc-search-empty"><Search size={17} /><span>没有匹配的章节</span></div>
              ) : shouldVirtualizeToc ? (
                <div className="toc-virtual-space" style={{ height: filteredTocCount * TOC_ROW_HEIGHT }}>
                  <div className="toc-virtual-window" style={{ transform: `translateY(${tocWindowStart * TOC_ROW_HEIGHT}px)` }}>
                    {isRenderableEpub
                      ? renderEpubTocEntries(visibleEpubTocChapters)
                      : renderTextTocEntries(visibleTextTocChapters)}
                  </div>
                </div>
              ) : isRenderableEpub
                ? renderEpubTocEntries(filteredEpubChapters)
                : renderTextTocEntries(filteredTextChapters)}
            </nav>
          </>
        ) : (
          <div className="reader-marks-list" aria-label="本书阅读记录">
            {marks.length > 0 ? marks.map((mark) => (
              <button
                key={mark.id}
                type="button"
                aria-label={`跳转到${mark.label}`}
                className={mark.id === initialMark?.id ? 'reader-mark reader-mark--active' : 'reader-mark'}
                onClick={() => jumpToMark(mark)}
              >
                <span className={`reader-mark__icon reader-mark__icon--${mark.kind}`}>
                  {mark.kind === 'bookmark' ? <Bookmark size={13} /> : <MessageSquareText size={13} />}
                </span>
                <span className="reader-mark__copy">
                  <strong>{mark.label}</strong>{mark.note && <em>{mark.note}</em>}<small>{mark.excerpt}</small>
                </span>
                <span className="reader-mark__progress">{mark.progress}%</span>
              </button>
            )) : (
              <div className="reader-marks-empty"><Bookmark size={20} /><strong>本书还没有记录</strong><span>使用顶部工具栏添加书签或标注。</span></div>
            )}
          </div>
        )}

        <div className="toc-footer">
          <div className="mini-progress"><span style={{ width: `${progress}%` }} /></div>
          <span>全书进度</span><strong>{progress}%</strong>
        </div>
        <div
          className="reader-toc-resizer"
          role="separator"
          aria-label="调整目录宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_READER_TOC_WIDTH}
          aria-valuemax={MAX_READER_TOC_WIDTH}
          aria-valuenow={tocWidth}
          aria-valuetext={`${tocWidth} 像素`}
          tabIndex={0}
          title="拖拽调整目录宽度，双击恢复默认"
          onPointerDown={handleTocResizePointerDown}
          onPointerMove={handleTocResizePointerMove}
          onPointerUp={finishTocResize}
          onPointerCancel={finishTocResize}
          onKeyDown={handleTocResizeKeyDown}
          onDoubleClick={() => setTocWidth(DEFAULT_READER_TOC_WIDTH)}
        />
      </aside>

      {tocTitleTooltip && createPortal(
        <div
          className="toc-title-tooltip"
          role="tooltip"
          data-theme={theme}
          style={{
            top: tocTitleTooltip.top,
            left: tocTitleTooltip.left,
            maxWidth: tocTitleTooltip.maxWidth
          }}
        >
          {tocTitleTooltip.title}
        </div>,
        document.body
      )}

      <main className={isSearchOpen ? 'reading-workspace reading-workspace--search-open' : 'reading-workspace'}>
        <header className="reader-toolbar">
          <div className="reader-toolbar__location">
            <span>{book.title}</span><ChevronRight size={14} /><strong>{currentLabel}</strong>
            <div className="reader-location-history" role="group" aria-label="阅读位置历史">
              <button
                type="button"
                aria-label="返回上一阅读位置"
                title="返回上一阅读位置 · Ctrl + Backspace"
                disabled={navigationBackStack.length === 0}
                onClick={() => navigateReadingHistory('back')}
              ><Undo2 size={14} /></button>
              <button
                type="button"
                aria-label="前往下一阅读位置"
                title="前往下一阅读位置 · Ctrl + Shift + Backspace"
                disabled={navigationForwardStack.length === 0}
                onClick={() => navigateReadingHistory('forward')}
              ><Redo2 size={14} /></button>
            </div>
          </div>
          <div className="reader-toolbar__actions">
            <button
              className={isSearchOpen ? 'icon-button icon-button--active' : 'icon-button'}
              type="button"
              aria-label="书内搜索"
              aria-expanded={isSearchOpen}
              onClick={() => {
                setIsSearchOpen((open) => {
                  if (!open) setIsSettingsOpen(false)
                  return !open
                })
                setIsMoreOpen(false)
              }}
            ><Search size={18} /></button>
            <button className={currentBookmark ? 'icon-button icon-button--active' : 'icon-button'} type="button" aria-label={currentBookmark ? '移除书签' : '添加书签'} onClick={toggleBookmark}>
              <Bookmark size={18} fill={currentBookmark ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="添加标注"
              onMouseDown={() => { pendingTextSelectionRef.current = selectedTextRange(window.getSelection()) }}
              onClick={openAnnotation}
            ><MessageSquarePlus size={18} /></button>
            <button
              className={narrationState !== 'idle' ? 'icon-button icon-button--active' : 'icon-button'}
              type="button"
              aria-label={narrationState === 'playing' ? '暂停语音朗读' : narrationState === 'paused' ? '继续语音朗读' : '开始语音朗读'}
              aria-pressed={narrationState !== 'idle'}
              onClick={toggleNarration}
            ><Headphones size={18} /></button>
            <button
              className={autoScrollState !== 'idle' ? 'icon-button icon-button--active auto-scroll-trigger' : 'icon-button auto-scroll-trigger'}
              type="button"
              aria-label={autoScrollButtonLabel}
              aria-pressed={autoScrollState !== 'idle'}
              onClick={toggleAutoScroll}
            >
              {autoScrollState === 'playing' ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className={isSettingsOpen ? 'icon-button icon-button--active' : 'icon-button'}
              type="button"
              aria-label={isSettingsOpen ? '阅读设置' : '打开阅读设置'}
              aria-expanded={isSettingsOpen}
              onClick={() => setIsSettingsOpen((open) => !open)}
            ><Settings2 size={18} /></button>
            <div className="reader-more">
              <button
                className={isMoreOpen ? 'icon-button icon-button--active' : 'icon-button'}
                type="button"
                aria-label="更多操作"
                aria-expanded={isMoreOpen}
                onClick={() => { setIsMoreOpen((open) => !open); setIsSearchOpen(false) }}
              ><MoreHorizontal size={19} /></button>
              {isMoreOpen && (
                <div className="reader-more-menu" role="menu" aria-label="更多阅读操作">
                  {book.source === 'local' && onUpdateBook && (
                    <>
                      <button type="button" role="menuitem" onClick={() => { setIsBookMetadataOpen(true); setIsMoreOpen(false) }}><PencilLine size={15} />编辑书籍信息</button>
                      <span className="reader-more-menu__separator" />
                    </>
                  )}
                  <button type="button" role="menuitem" onClick={jumpToStart}><RotateCcw size={15} />回到书首</button>
                  <button type="button" role="menuitem" onClick={toggleFullscreen}><Expand size={15} />{isFocusMode ? '退出全屏' : '全屏阅读'}</button>
                  <button type="button" role="menuitem" aria-pressed={isReadingRulerOpen} onClick={toggleReadingRuler}><ScanLine size={15} />{isReadingRulerOpen ? '关闭阅读标尺' : '开启阅读标尺'}</button>
                  <button type="button" role="menuitem" onClick={() => { setIsStatsOpen(true); setIsMoreOpen(false) }}><BarChart3 size={15} />阅读统计</button>
                  <button type="button" role="menuitem" onClick={exportReadingMarks}><Download size={15} />导出阅读记录</button>
                  <span className="reader-more-menu__separator" />
                  <span className="reader-shortcut-hint">← → 翻页 · A 自动阅读 · V 朗读<br />R 阅读标尺 · Ctrl + ⌫ 返回位置</span>
                  <span className="reader-more-menu__separator" />
                  <button type="button" role="menuitem" onClick={onBack}><ArrowLeft size={15} />返回书架</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {isSearchOpen && (
          <section className="reader-search-panel" role="dialog" aria-label="书内搜索面板">
            <header>
              <div><span>书内搜索</span><strong>{book.format.toUpperCase()} · 全文搜索</strong></div>
              <button className="icon-button" type="button" aria-label="关闭书内搜索" onClick={() => setIsSearchOpen(false)}><X size={16} /></button>
            </header>
            <label className="reader-search-field">
              <Search size={16} />
              <input autoFocus type="search" aria-label="搜索关键词" placeholder="输入词语或句子" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
              {searchQuery && <button type="button" aria-label="清空搜索" onClick={() => setSearchQuery('')}><X size={14} /></button>}
            </label>
            <div className="reader-search-summary">
              <span>{isTextSearching && !isRenderableEpub ? '正在检索全书…' : searchQuery.trim() ? `找到 ${visibleSearchResults.length} 处结果` : '输入关键词开始搜索'}</span>
              <div className="reader-search-switcher" aria-label="切换搜索结果">
                <strong>{activeSearchResultIndex >= 0 ? activeSearchResultIndex + 1 : '—'} / {visibleSearchResults.length}</strong>
                <button
                  type="button"
                  aria-label="上一个搜索结果"
                  disabled={visibleSearchResults.length === 0}
                  onClick={() => moveBetweenSearchResults(-1)}
                ><ChevronUp size={14} /></button>
                <button
                  type="button"
                  aria-label="下一个搜索结果"
                  disabled={visibleSearchResults.length === 0}
                  onClick={() => moveBetweenSearchResults(1)}
                ><ChevronDown size={14} /></button>
              </div>
            </div>
            <div
              className="reader-search-results"
              ref={searchResultsRef}
              aria-live="polite"
              onScroll={(event) => setSearchResultsScrollTop(event.currentTarget.scrollTop)}
            >
              {searchQuery.trim() && visibleSearchResults.length === 0 ? (
                <div className="reader-search-empty"><Search size={19} /><span>暂未找到匹配内容</span></div>
              ) : visibleSearchResults.length > 0 ? (
                <div
                  className="reader-search-results__virtual"
                  style={{ height: visibleSearchResults.length * SEARCH_RESULT_ROW_HEIGHT }}
                >
                {isRenderableEpub ? (
                  searchResultWindow.map(({ result, index }) => {
                    const epubResult = result as EpubSearchResult
                    return (
                  <button
                    key={`${epubResult.cfi}-${index}`}
                    type="button"
                    aria-label={`跳转到搜索结果 ${index + 1}`}
                    aria-current={activeSearchResultIndex === index ? 'location' : undefined}
                    style={{ transform: `translateY(${index * SEARCH_RESULT_ROW_HEIGHT}px)` }}
                    onClick={() => jumpToSearchResult(epubResult, index)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span><p>{stripSearchMarkup(epubResult.excerpt)}</p>
                  </button>
                    )
                  })
                ) : (
                  searchResultWindow.map(({ result, index }) => {
                    const textResult = result as TextSearchResult
                    return (
                  <button
                    key={`${textResult.index}-${textResult.offset}`}
                    type="button"
                    aria-label={`跳转到搜索结果 ${index + 1}`}
                    aria-current={activeSearchResultIndex === index ? 'location' : undefined}
                    style={{ transform: `translateY(${index * SEARCH_RESULT_ROW_HEIGHT}px)` }}
                    onClick={() => jumpToSearchResult(textResult, index)}
                  >
                    <span>{String(index + 1).padStart(2, '0')}</span><p><strong>{textResult.label}</strong>{textResult.excerpt}</p>
                  </button>
                    )
                  })
                )}
                </div>
              ) : null}
            </div>
          </section>
        )}

        {isReadingRulerOpen && (
          <div className="reading-ruler-layer" data-testid="reading-ruler" aria-hidden="true">
            <div
              className="reading-ruler-band"
              data-testid="reading-ruler-band"
              style={{ top: `${readingRulerPosition}%` }}
            >
              <span><ScanLine size={12} />阅读标尺 · R 关闭</span>
            </div>
          </div>
        )}

        <div
          className={autoScrollState === 'playing' ? 'reading-canvas reading-canvas--auto-playing' : 'reading-canvas'}
          ref={readingCanvasRef}
          onPointerMove={handleReadingRulerPointerMove}
          onScroll={isRenderableEpub ? undefined : handleTextScroll}
          onMouseUp={isRenderableEpub ? undefined : captureTextSelection}
          onKeyUp={isRenderableEpub ? undefined : captureTextSelection}
          onWheel={() => {
            ignoreTextScrollUntilRef.current = 0
            if (autoScrollState === 'playing') setAutoScrollState('paused')
          }}
        >
          {isRenderableEpub ? (
            <div className="epub-stage" style={{ maxWidth: columnWidth + 180 }}>
              <ReactReader
                key={book.id}
                url={book.data!}
                location={epubLocation}
                locationChanged={handleEpubLocation}
                tocChanged={(toc) => {
                  const nextToc = toc as EpubChapter[]
                  setEpubToc(nextToc)
                  setActiveEpubChapterIndex((index) => Math.min(index, Math.max(0, nextToc.length - 1)))
                }}
                title={book.title}
                showToc={false}
                searchQuery={epubSearchQuery}
                onSearchResults={handleEpubSearchResults}
                getRendition={configureRendition}
              />
            </div>
          ) : (
            <article
              className={layoutMode === 'double' ? 'text-page text-page--double' : 'text-page'}
              data-font={fontFamily}
              data-auto-scroll={autoScrollState}
              style={{ fontSize, fontFamily: FONT_STACKS[fontFamily], lineHeight, maxWidth: layoutMode === 'double' ? columnWidth + 280 : columnWidth }}
            >
              {book.source === 'sample' && <span className="sample-badge">原创演示文本</span>}
              {isLargeText && (
                <div className="long-text-mode" role="status">
                  <Gauge size={15} />
                  <span><strong>长篇优化</strong><small>仅加载当前阅读区间 · {textWindowStart + 1}–{textWindowEnd} / {paragraphs.length} 段</small></span>
                </div>
              )}
              {isLargeText && textWindowStart > 0 && (
                <button className="text-window-step text-window-step--previous" type="button" onClick={() => moveTextWindow('previous')}>
                  <ChevronUp size={15} /> 加载上一段
                </button>
              )}
              {visibleParagraphs.map((paragraph, visibleIndex) => {
                const index = isLargeText ? textWindowStart + visibleIndex : visibleIndex
                const markdownBlock = markdownBlocks?.[index]
                if (markdownBlock?.kind === 'heading') {
                  const HeadingTag = markdownBlock.level && markdownBlock.level >= 3 ? 'h3' : 'h2'
                  return (
                    <HeadingTag
                      className="reader-markdown-heading"
                      key={`${paragraph}-${index}`}
                      data-chapter={paragraph}
                      data-paragraph-index={index}
                    >{renderSentenceSpans(paragraph, index)}</HeadingTag>
                  )
                }
                if (markdownBlock?.kind === 'blockquote') {
                  return <blockquote className="reader-markdown-quote" data-paragraph-index={index} key={`${paragraph}-${index}`}>{renderSentenceSpans(paragraph, index)}</blockquote>
                }
                if (markdownBlock?.kind === 'list-item') {
                  return <p className={`reader-markdown-list-item ${markdownBlock.ordered ? 'reader-markdown-list-item--ordered' : ''}`} data-paragraph-index={index} key={`${paragraph}-${index}`}>{renderSentenceSpans(paragraph, index)}</p>
                }
                if (markdownBlock?.kind === 'code') {
                  return <pre className="reader-markdown-code" data-language={markdownBlock.language || undefined} data-paragraph-index={index} key={`${paragraph}-${index}`}><code>{paragraph}</code></pre>
                }
                if (markdownBlock?.kind === 'separator') {
                  return <p className="reader-separator" data-paragraph-index={index} key={`${paragraph}-${index}`}>{paragraph}</p>
                }
                if (chapterTitles.has(paragraph)) {
                  return (
                    <h2
                      key={`${paragraph}-${index}`}
                      data-chapter={paragraph}
                      data-paragraph-index={index}
                    >{renderSentenceSpans(paragraph, index)}</h2>
                  )
                }
                const isSeparator = TEXT_SEPARATOR_PATTERN.test(paragraph)
                const paragraphClass = [
                  isSeparator ? 'reader-separator' : 'reader-paragraph',
                  !isSeparator && FLUSH_TEXT_BLOCK_PATTERN.test(paragraph) ? 'reader-paragraph--flush' : ''
                ].filter(Boolean).join(' ')
                return (
                  <p
                    className={paragraphClass}
                    data-paragraph-index={index}
                    key={`${paragraph}-${index}`}
                  >{renderSentenceSpans(paragraph, index)}</p>
                )
              })}
              {isLargeText && textWindowEnd < paragraphs.length && (
                <button className="text-window-step" type="button" onClick={() => moveTextWindow('next')}>
                  继续下一段 <ChevronDown size={15} />
                </button>
              )}
            </article>
          )}
        </div>

        {selectionTools && (
          <section
            className={`selection-tools selection-tools--${selectionTools.placement}`}
            role="toolbar"
            aria-label="选中文本工具"
            style={{ left: selectionTools.anchorX, top: selectionTools.anchorY }}
          >
            <p title={selectionTools.text}>{selectionTools.text}</p>
            <span className="selection-tools__separator" />
            <button type="button" aria-label="复制选中文本" onClick={() => void copySelectedText()}><Copy size={14} />复制</button>
            <button type="button" aria-label="带出处复制" title="同时复制书名、作者和章节" onClick={() => void copySelectedTextWithCitation()}><Quote size={14} />引用</button>
            <button type="button" aria-label="标注选中文本" onClick={annotateSelectedText}><MessageSquarePlus size={14} />标注</button>
            <button type="button" aria-label="朗读选中文本" onClick={speakSelectedText} disabled={!('speechSynthesis' in window)}><Volume2 size={14} />朗读</button>
            <button type="button" aria-label="查询选中文本" title="将在新标签页打开维基词典" onClick={() => openSelectedTextExternally('lookup')}><BookOpen size={14} />查词</button>
            <button type="button" aria-label="翻译选中文本" title="将在新标签页打开翻译服务" onClick={() => openSelectedTextExternally('translate')}><Languages size={14} />翻译</button>
            <button className="selection-tools__close" type="button" aria-label="关闭选中文本工具" onClick={() => setSelectionTools(null)}><X size={14} /></button>
          </section>
        )}

        {copyNotice && <div className="reader-copy-notice" role="status"><Check size={14} />{copyNotice}</div>}

        {narrationState !== 'idle' && (
          <section className={`narration-controller narration-controller--${narrationState}`} role="region" aria-label="语音朗读控制">
            <div className="narration-controller__status">
              <span><Headphones size={16} /></span>
              <div>
                <strong>语音朗读</strong>
                <small>
                  <span>{narrationState === 'playing' ? '正在朗读' : narrationState === 'paused' ? '已暂停' : '已读完当前内容'}</span>
                  {' · '}<em>{selectedSpeechVoice?.name ?? '系统默认'}</em>
                </small>
              </div>
            </div>
            <button className="narration-controller__play" type="button" aria-label={narrationState === 'playing' ? '暂停语音朗读' : '继续语音朗读'} onClick={toggleNarration}>
              {narrationState === 'playing' ? <Pause size={15} /> : <Play size={15} />}
              {narrationState === 'playing' ? '暂停' : narrationState === 'ended' ? '从头朗读' : '继续'}
            </button>
            <label className="narration-controller__rate">
              <span>语速 {speechRate.toFixed(1)}×</span>
              <input type="range" min="0.5" max="2.5" step="0.1" value={speechRate} aria-label="语音朗读速度" onChange={(event) => changeSpeechRate(Number(event.target.value))} />
            </label>
            <button className="narration-controller__close" type="button" aria-label="关闭语音朗读" onClick={stopNarration}><X size={15} /></button>
          </section>
        )}

        {autoScrollState !== 'idle' && (
          <section
            className={`auto-scroll-controller auto-scroll-controller--${autoScrollState}`}
            role="region"
            aria-label="自动滚动控制"
          >
            <div className="auto-scroll-controller__status" aria-live="polite">
              <span className="auto-scroll-controller__signal"><Gauge size={16} /></span>
              <span><strong>自动阅读</strong><small>{autoScrollStatusLabel}</small></span>
            </div>
            <button
              className="auto-scroll-controller__playback"
              type="button"
              aria-label={autoScrollState === 'playing' ? '暂停自动滚动' : autoScrollState === 'ended' ? '从头开始' : '恢复自动滚动'}
              onClick={toggleAutoScroll}
            >
              {autoScrollState === 'playing' ? <Pause size={15} /> : autoScrollState === 'ended' ? <RotateCcw size={15} /> : <Play size={15} />}
              {autoScrollState === 'playing' ? '暂停' : autoScrollState === 'ended' ? '从头开始' : '继续'}
            </button>
            <div className="auto-scroll-controller__speed">
              <button
                type="button"
                aria-label="降低自动滚动速度"
                disabled={autoScrollSpeed <= AUTO_SCROLL_MIN_SPEED}
                onClick={() => adjustAutoScrollSpeed(-1)}
              ><Minus size={14} /></button>
              <label>
                <span>阅读速度 · <b>最高 8×</b></span>
                <input
                  type="range"
                  min={AUTO_SCROLL_MIN_SPEED}
                  max={AUTO_SCROLL_MAX_SPEED}
                  step={AUTO_SCROLL_SPEED_STEP}
                  value={autoScrollSpeed}
                  aria-label="自动滚动速度"
                  aria-valuetext={autoScrollSpeedLabel}
                  onChange={(event) => setAutoScrollSpeed(Number(event.target.value))}
                />
              </label>
              <button
                type="button"
                aria-label="提高自动滚动速度"
                disabled={autoScrollSpeed >= AUTO_SCROLL_MAX_SPEED}
                onClick={() => adjustAutoScrollSpeed(1)}
              ><Plus size={14} /></button>
              <strong>{autoScrollSpeedLabel}</strong>
            </div>
            <button className="auto-scroll-controller__close" type="button" aria-label="关闭自动滚动" onClick={stopAutoScroll}><X size={15} /></button>
          </section>
        )}

        <footer className="reader-footerbar">
          <button className="page-step" type="button" aria-label="上一页" onClick={() => turnPage('previous')}><ChevronLeft size={17} /> 上一页</button>
          <div className="reader-progress-control">
            <input type="range" min="0" max="100" value={progress} aria-label="阅读进度" onChange={(event) => seekToProgress(Number(event.target.value))} />
            <span>{progress}%</span>
          </div>
          <button className="page-step" type="button" aria-label="下一页" onClick={() => turnPage('next')}>下一页 <ChevronRight size={17} /></button>
        </footer>
      </main>

      {isSettingsOpen && (
        <aside className="reader-settings">
          <div className="reader-panel__header reader-panel__header--settings">
            <strong>阅读设置</strong>
            <button className="icon-button" type="button" aria-label="收起阅读设置" onClick={() => setIsSettingsOpen(false)}><ChevronRight size={18} /></button>
          </div>

          <section className="setting-group setting-group--profiles">
            <div className="setting-label"><Palette size={16} /><span>阅读方案</span></div>
            <label className="select-control">
              <span>当前方案</span>
              <select
                value={activeReaderProfileId}
                aria-label="阅读方案"
                onChange={(event) => {
                  const profile = allReaderProfiles.find((item) => item.id === event.target.value)
                  if (profile) applyReaderProfile(profile)
                }}
              >
                {!activeReaderProfileId && <option value="">当前自定义</option>}
                <optgroup label="内置方案">
                  {BUILT_IN_READER_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                </optgroup>
                {customReaderProfiles.length > 0 && (
                  <optgroup label="我的方案">
                    {customReaderProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="profile-save-row">
              <input
                type="text"
                value={newProfileName}
                maxLength={24}
                aria-label="新方案名称"
                placeholder="保存当前版式"
                onChange={(event) => setNewProfileName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') saveCurrentReaderProfile() }}
              />
              <button type="button" aria-label="保存当前方案" disabled={!newProfileName.trim()} onClick={saveCurrentReaderProfile}><Save size={14} /></button>
              {activeReaderProfileId.startsWith('custom-') && (
                <button type="button" aria-label="删除当前方案" onClick={removeCurrentReaderProfile}><Trash2 size={14} /></button>
              )}
            </div>
            <p className="setting-caption">方案仅保存在当前浏览器，不会上传。</p>
          </section>

          <section className="setting-group">
            <div className="setting-label"><Type size={16} /><span>文字</span></div>
            <div className="stepper">
              <button type="button" aria-label="减小字号" onClick={() => adjustFontSize(-2)}><Minus size={16} /></button>
              <span><strong>{fontSize}</strong> px</span>
              <button type="button" aria-label="增大字号" onClick={() => adjustFontSize(2)}><Plus size={16} /></button>
            </div>
            <label className="select-control">
              <span>字体</span>
              <select
                value={fontFamily}
                aria-label="阅读字体"
                onChange={(event) => {
                  const nextFont = event.target.value as ReaderFont
                  updateTextAppearanceKeepingPosition(() => setFontFamily(nextFont))
                }}
              >
                <option value="serif">思源宋体</option><option value="song">宋体</option><option value="sans">黑体</option>
              </select>
            </label>
          </section>

          <section className="setting-group setting-group--speech">
            <div className="setting-label"><Headphones size={16} /><span>朗读声音</span></div>
            <label className="select-control">
              <span>本书专用</span>
              <select
                value={selectedSpeechVoice?.voiceURI ?? bookSpeechVoice?.voiceURI ?? ''}
                aria-label="本书朗读声音"
                onChange={(event) => changeBookSpeechVoice(event.target.value)}
              >
                <option value="">跟随系统默认</option>
                {bookSpeechVoice && !selectedSpeechVoice && (
                  <option value={bookSpeechVoice.voiceURI} disabled>{bookSpeechVoice.name}（当前不可用）</option>
                )}
                {chineseSpeechVoices.length > 0 && (
                  <optgroup label="中文声音">
                    {chineseSpeechVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} · {voice.lang} · {voice.localService ? '本地' : '联网'}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherSpeechVoices.length > 0 && (
                  <optgroup label="其他语言">
                    {otherSpeechVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} · {voice.lang} · {voice.localService ? '本地' : '联网'}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="speech-voice-status" aria-live="polite">
              <span>{speechVoices.length > 0 ? `已发现 ${speechVoices.length} 个声音` : '暂未发现可选声音'}</span>
              <strong>{bookSpeechVoice ? `已用于《${book.title}》` : '本书跟随系统'}</strong>
            </div>
            <div className="speech-voice-actions">
              <button type="button" aria-label="试听当前声音" disabled={!('speechSynthesis' in window)} onClick={previewBookSpeechVoice}>
                {isVoicePreviewing ? <Pause size={14} /> : <Play size={14} />}{isVoicePreviewing ? '试听中' : '试听'}
              </button>
              <button type="button" aria-label="刷新声音" onClick={refreshSpeechVoices}><RefreshCw size={14} />刷新</button>
              <button type="button" aria-label="获取更多声音" onClick={openSystemVoiceHelp}><ExternalLink size={14} />更多声音</button>
            </div>
            <p className="setting-caption">
              {bookSpeechVoice && !selectedSpeechVoice
                ? '原声音当前不可用，朗读时会自动使用系统默认声音。'
                : '声音选择按书保存在本机。系统下载新声音后，返回这里点击刷新。'}
            </p>
          </section>

          <section className="setting-group">
            <div className="setting-label"><Columns2 size={16} /><span>版式</span></div>
            <label className="range-control">
              <span>行距 <strong>{lineHeight.toFixed(1)}</strong></span>
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.1"
                value={lineHeight}
                onChange={(event) => {
                  const nextLineHeight = Number(event.target.value)
                  updateTextAppearanceKeepingPosition(() => setLineHeight(nextLineHeight))
                }}
              />
            </label>
            <label className="range-control">
              <span>页宽 <strong>{columnWidth}px</strong></span>
              <input
                type="range"
                min="520"
                max="860"
                step="20"
                value={columnWidth}
                onChange={(event) => {
                  const nextColumnWidth = Number(event.target.value)
                  updateTextAppearanceKeepingPosition(() => setColumnWidth(nextColumnWidth))
                }}
              />
            </label>
            <div className="layout-options" aria-label="阅读版式">
              <button type="button" className={layoutMode === 'continuous' ? 'layout-option layout-option--active' : 'layout-option'} onClick={() => changeLayoutMode('continuous')}><Maximize2 size={16} />连续</button>
              <button type="button" className={layoutMode === 'double' ? 'layout-option layout-option--active' : 'layout-option'} onClick={() => changeLayoutMode('double')}><Columns2 size={16} />双页</button>
            </div>
          </section>

          <section className="setting-group">
            <div className="setting-label"><Sun size={16} /><span>主题</span></div>
            <div className="theme-options">
              <button type="button" aria-label="白纸" className={theme === 'paper' ? 'theme-swatch theme-swatch--active' : 'theme-swatch'} onClick={() => setTheme('paper')}><span className="theme-swatch__paper" />白纸{theme === 'paper' && <Check size={13} />}</button>
              <button type="button" aria-label="米纸" className={theme === 'sepia' ? 'theme-swatch theme-swatch--active' : 'theme-swatch'} onClick={() => setTheme('sepia')}><span className="theme-swatch__sepia" />米纸{theme === 'sepia' && <Check size={13} />}</button>
              <button type="button" aria-label="夜间" className={theme === 'night' ? 'theme-swatch theme-swatch--active' : 'theme-swatch'} onClick={() => setTheme('night')}><span className="theme-swatch__night"><Moon size={11} /></span>夜间{theme === 'night' && <Check size={13} />}</button>
            </div>
          </section>

          <div className="settings-tip"><Sun size={16} /><p><strong>护眼提示</strong><span>夜间阅读时建议降低屏幕亮度。</span></p></div>
        </aside>
      )}

      {isStatsOpen && (
        <div className="annotation-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setIsStatsOpen(false) }}>
          <section className="reading-stats-dialog" role="dialog" aria-modal="true" aria-label="阅读统计">
            <header>
              <div><span>本地阅读数据</span><h2>阅读统计</h2></div>
              <button className="icon-button" type="button" aria-label="关闭阅读统计" onClick={() => setIsStatsOpen(false)}><X size={18} /></button>
            </header>
            <div className="reading-stats-hero">
              <div>
                <span>累计阅读</span>
                <strong>{formatReadingDuration(displayedReadingMs)}</strong>
                <small>当前会话 {formatReadingDuration(sessionReadingMs)}</small>
              </div>
              <div className="reading-stats-progress" aria-label={`已读 ${progress}%`}>
                <span style={{ width: `${progress}%` }} />
                <strong>{progress}%</strong>
                <small>全书进度</small>
              </div>
            </div>
            <dl className="reading-stats-metrics">
              <div><dt><BookOpen size={15} />预计读完</dt><dd>{remainingReadingMinutes > 0 ? formatReadingEstimate(remainingReadingMinutes) : (isRenderableEpub ? '继续阅读后估算' : '已读完')}</dd></div>
              <div><dt><CalendarDays size={15} />活跃天数</dt><dd>{activeReadingDays} 天</dd></div>
              <div><dt><BarChart3 size={15} />平均会话</dt><dd>{formatReadingDuration(averageSessionMs)}</dd></div>
            </dl>
            <footer><span>数据仅保存在当前浏览器</span><small>停留超过两分钟且无操作时自动停止计时</small></footer>
          </section>
        </div>
      )}

      {isAnnotationOpen && (
        <div className="annotation-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setIsAnnotationOpen(false) }}>
          <section className="annotation-dialog" role="dialog" aria-modal="true" aria-labelledby="annotation-heading">
            <header>
              <div><span>阅读标注</span><h2 id="annotation-heading">{editingAnnotationId ? '编辑这条标注' : '记下此处的想法'}</h2></div>
              <button className="icon-button" type="button" aria-label="关闭标注" onClick={() => setIsAnnotationOpen(false)}><X size={18} /></button>
            </header>
            <blockquote>{annotationExcerpt || currentExcerpt}</blockquote>
            <label>
              <span>标注内容</span>
              <textarea autoFocus aria-label="标注内容" placeholder="写下问题、联想或稍后要回看的理由…" value={annotationNote} onChange={(event) => setAnnotationNote(event.target.value)} />
            </label>
            {!isRenderableEpub && (
              <div className="annotation-colors" aria-label="标注颜色">
                {(['amber', 'coral', 'sage'] as AnnotationColor[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`annotation-color annotation-color--${color} ${annotationColor === color ? 'annotation-color--active' : ''}`}
                    aria-label={`${color}标注颜色`}
                    aria-pressed={annotationColor === color}
                    onClick={() => setAnnotationColor(color)}
                  />
                ))}
              </div>
            )}
            <footer>
              <span>{annotationSelection ? chapterTitleAt(annotationSelection.paragraphIndex) : currentLabel} · {isRenderableEpub ? progress : annotationSelection ? Math.round((annotationSelection.paragraphIndex / Math.max(1, paragraphs.length - 1)) * 100) : currentTextProgress}%</span>
              <div><button className="dialog-cancel" type="button" onClick={() => setIsAnnotationOpen(false)}>取消</button><button className="dialog-save" type="button" disabled={!annotationNote.trim()} onClick={saveAnnotation}>{editingAnnotationId ? '保存修改' : '保存标注'}</button></div>
            </footer>
          </section>
        </div>
      )}

      {isBookMetadataOpen && onUpdateBook && (
        <BookMetadataDialog
          book={book}
          groups={groups}
          onClose={() => setIsBookMetadataOpen(false)}
          onSave={onUpdateBook}
        />
      )}
    </div>
  )
}
