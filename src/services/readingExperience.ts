import type { ReaderBook, ReadingMark } from '../types'

const RESUME_STORAGE_KEY = 'mojian-reading-resume-snapshots'
const STALLED_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const TIMESTAMP_FLOOR = new Date('2000-01-01T00:00:00Z').getTime()

export type SmartShelfId = 'reading' | 'finishing' | 'stalled' | 'annotated'

export interface SmartShelf {
  id: SmartShelfId
  label: string
  description: string
  books: ReaderBook[]
}

export interface ReadingResumeSnapshot {
  bookId: string
  chapterLabel: string
  excerpt: string
  progress: number
  lastReadAt: number
}

export interface ResumeMemory {
  chapterLabel: string
  excerpt: string
  progress: number
  lastReadAt: number
  timeLabel: string
  source: 'snapshot' | 'mark' | 'progress'
}

export interface StoryMapChapter {
  id: string
  title: string
  progress: number
  startProgress: number
  endProgress: number
  lastReadAt?: number
}

export interface StoryMapSegment {
  id: string
  title: string
  startIndex: number
  endIndex: number
  progress: number
  markCount: number
  lastReadAt?: number
  isActive: boolean
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function isReliableTimestamp(value: number) {
  return Number.isFinite(value) && value >= TIMESTAMP_FLOOR
}

function sortByLastOpened(books: ReaderBook[]) {
  return [...books].sort((left, right) => right.lastOpened - left.lastOpened)
}

export function buildSmartShelves(books: ReaderBook[], marks: ReadingMark[], now = Date.now()): SmartShelf[] {
  const markedBookIds = new Set(marks.map((mark) => mark.bookId))
  const activeBooks = books.filter((book) => book.progress > 0 && book.progress < 100)
  return [
    {
      id: 'reading',
      label: '正在阅读',
      description: '已经开始、尚未读完的书',
      books: sortByLastOpened(activeBooks)
    },
    {
      id: 'finishing',
      label: '快读完',
      description: '进度超过 75%，适合优先完成',
      books: sortByLastOpened(activeBooks.filter((book) => book.progress >= 75))
    },
    {
      id: 'stalled',
      label: '搁置较久',
      description: '超过 14 天没有继续阅读',
      books: sortByLastOpened(activeBooks.filter((book) => (
        isReliableTimestamp(book.lastOpened) && now - book.lastOpened >= STALLED_AFTER_MS
      )))
    },
    {
      id: 'annotated',
      label: '有标注',
      description: '保存过书签、摘抄或想法的书',
      books: sortByLastOpened(books.filter((book) => markedBookIds.has(book.id)))
    }
  ]
}

function normalizeSnapshot(value: unknown): ReadingResumeSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<ReadingResumeSnapshot>
  const bookId = normalizeText(candidate.bookId, 200)
  const chapterLabel = normalizeText(candidate.chapterLabel, 300)
  const excerpt = normalizeText(candidate.excerpt, 360)
  if (!bookId || !chapterLabel || !excerpt || !isReliableTimestamp(candidate.lastReadAt ?? 0)) return null
  return {
    bookId,
    chapterLabel,
    excerpt,
    progress: clampProgress(candidate.progress ?? 0),
    lastReadAt: candidate.lastReadAt!
  }
}

function loadResumeSnapshots() {
  if (typeof localStorage === 'undefined') return {} as Record<string, ReadingResumeSnapshot>
  try {
    const stored = JSON.parse(localStorage.getItem(RESUME_STORAGE_KEY) ?? '{}') as unknown
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(
      Object.entries(stored).flatMap(([bookId, value]) => {
        const snapshot = normalizeSnapshot(value)
        return snapshot && snapshot.bookId === bookId ? [[bookId, snapshot]] : []
      })
    )
  } catch {
    return {}
  }
}

export function loadReadingResumeSnapshot(bookId: string) {
  return loadResumeSnapshots()[bookId] ?? null
}

export function saveReadingResumeSnapshot(snapshot: ReadingResumeSnapshot) {
  const normalized = normalizeSnapshot(snapshot)
  if (!normalized || typeof localStorage === 'undefined') return null
  const stored = loadResumeSnapshots()
  stored[normalized.bookId] = normalized
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(stored))
  return normalized
}

export function formatResumeTime(timestamp: number, now = Date.now()) {
  if (!isReliableTimestamp(timestamp)) return '保存在本地'
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))} 小时前`
  if (elapsed < 7 * 24 * 60 * 60_000) return `${Math.floor(elapsed / (24 * 60 * 60_000))} 天前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(timestamp)
}

export function buildResumeMemory(
  book: ReaderBook,
  marks: ReadingMark[],
  snapshot: ReadingResumeSnapshot | null,
  now = Date.now()
): ResumeMemory {
  if (snapshot?.bookId === book.id) {
    return {
      chapterLabel: snapshot.chapterLabel,
      excerpt: snapshot.excerpt,
      progress: snapshot.progress,
      lastReadAt: snapshot.lastReadAt,
      timeLabel: formatResumeTime(snapshot.lastReadAt, now),
      source: 'snapshot'
    }
  }

  const recentMark = marks
    .filter((mark) => mark.bookId === book.id)
    .sort((left, right) => right.createdAt - left.createdAt)[0]
  if (recentMark) {
    return {
      chapterLabel: recentMark.label,
      excerpt: normalizeText(recentMark.note || recentMark.excerpt, 360),
      progress: clampProgress(recentMark.progress),
      lastReadAt: recentMark.createdAt,
      timeLabel: formatResumeTime(recentMark.createdAt, now),
      source: 'mark'
    }
  }

  return {
    chapterLabel: book.progress > 0 ? `全书 ${clampProgress(book.progress)}%` : '尚未开始',
    excerpt: normalizeText(book.note, 360) || '阅读位置已经保存在这台设备，打开后可以继续上一次的进度。',
    progress: clampProgress(book.progress),
    lastReadAt: book.lastOpened,
    timeLabel: formatResumeTime(book.lastOpened, now),
    source: 'progress'
  }
}

export function buildStoryMapSegments(
  chapters: StoryMapChapter[],
  marks: ReadingMark[],
  activeIndex: number,
  maxSegments = 96
): StoryMapSegment[] {
  if (chapters.length === 0) return []
  const safeLimit = Math.max(1, Math.floor(maxSegments))
  const segmentSize = Math.max(1, Math.ceil(chapters.length / safeLimit))
  const segments: StoryMapSegment[] = []

  for (let startIndex = 0; startIndex < chapters.length; startIndex += segmentSize) {
    const group = chapters.slice(startIndex, startIndex + segmentSize)
    const endIndex = startIndex + group.length - 1
    const first = group[0]
    const last = group[group.length - 1]
    const rangeStart = first.startProgress
    const rangeEnd = endIndex === chapters.length - 1 ? 100.0001 : last.endProgress
    const groupMarks = marks.filter((mark) => mark.progress >= rangeStart && mark.progress < rangeEnd)
    const timestamps = group.map((chapter) => chapter.lastReadAt).filter((value): value is number => Boolean(value))
    segments.push({
      id: `${first.id}:${last.id}`,
      title: group.length === 1 ? first.title : `${first.title} – ${last.title}`,
      startIndex,
      endIndex,
      progress: Math.round(group.reduce((total, chapter) => total + clampProgress(chapter.progress), 0) / group.length),
      markCount: groupMarks.length,
      lastReadAt: timestamps.length ? Math.max(...timestamps) : undefined,
      isActive: activeIndex >= startIndex && activeIndex <= endIndex
    })
  }

  return segments
}
