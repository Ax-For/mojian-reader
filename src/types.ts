export type BookFormat = 'txt' | 'epub' | 'md'

export interface BookCover {
  background: string
  foreground: string
  image?: string
}

export type ReadingBackgroundPreset = 'default' | 'warm' | 'sage' | 'slate'

export interface BookReadingBackground {
  preset: ReadingBackgroundPreset
  image?: string
}

export interface BookGroup {
  id: string
  name: string
  createdAt: number
}

export interface TextBookChapterIndex {
  title: string
  paragraphIndex: number
}

export interface TextBookIndex {
  version: 1
  paragraphs: string[]
  chapters: TextBookChapterIndex[]
  totalReadingUnits: number
}

export interface ReaderBook {
  id: string
  title: string
  author: string
  format: BookFormat
  source: 'sample' | 'local'
  fileSize: number
  sizeLabel: string
  progress: number
  lastOpened: number
  content?: string
  data?: ArrayBuffer
  textIndex?: TextBookIndex
  chapterCount?: number
  wordCount?: number
  cover: BookCover
  note?: string
  readingBackground?: BookReadingBackground
  groupIds?: string[]
}

export interface ChapterMarker {
  title: string
  start: number
}

export type ReaderTheme = 'paper' | 'sepia' | 'night'
export type ReaderFont = 'serif' | 'song' | 'sans'
export type ReaderLayout = 'continuous' | 'double'

export type LibrarySection = 'library' | 'marks'
export type ReadingMarkKind = 'bookmark' | 'annotation'

export interface ReadingLocation {
  type: 'text' | 'epub'
  value: string
}

export type AnnotationColor = 'amber' | 'coral' | 'sage'

export interface TextAnnotationSelection {
  paragraphIndex: number
  start: number
  end: number
  exact: string
}

export interface ReadingMarkDraft {
  kind: ReadingMarkKind
  location: ReadingLocation
  label: string
  excerpt: string
  note?: string
  progress: number
  selection?: TextAnnotationSelection
  color?: AnnotationColor
}

export interface ReadingMark extends ReadingMarkDraft {
  id: string
  bookId: string
  createdAt: number
}
