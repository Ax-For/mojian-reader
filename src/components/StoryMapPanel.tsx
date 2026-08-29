import { Bookmark, Clock3, MapPinned } from 'lucide-react'
import type { ReadingMark } from '../types'
import {
  buildStoryMapSegments,
  formatResumeTime,
  type StoryMapChapter
} from '../services/readingExperience'

interface StoryMapPanelProps {
  chapters: StoryMapChapter[]
  marks: ReadingMark[]
  activeIndex: number
  onOpenChapter: (index: number) => void
}

export function StoryMapPanel({ chapters, marks, activeIndex, onOpenChapter }: StoryMapPanelProps) {
  const segments = buildStoryMapSegments(chapters, marks, activeIndex)
  const safeActiveIndex = Math.min(Math.max(activeIndex, 0), Math.max(0, chapters.length - 1))
  const activeChapter = chapters[safeActiveIndex]
  const exploredCount = chapters.filter((chapter) => chapter.progress > 0).length
  const nearbyStart = Math.max(0, safeActiveIndex - 2)
  const nearbyChapters = chapters.slice(nearbyStart, nearbyStart + 5)

  return (
    <nav className="story-map" aria-label="故事地图">
      <header className="story-map__header">
        <span><MapPinned size={15} /> 阅读轨迹</span>
        <strong>已探索 {exploredCount} / {chapters.length} 章</strong>
        <small>{marks.length} 条阅读记录</small>
      </header>

      <div className="story-map__legend" aria-hidden="true">
        <span><i data-state="read" />已读</span>
        <span><i data-state="current" />当前</span>
        <span><i data-state="unread" />未读</span>
      </div>

      <div className="story-map__grid" aria-label="全书章节缩略图">
        {segments.map((segment) => {
          const destination = segment.isActive ? safeActiveIndex : segment.startIndex
          const detail = `${segment.title} · 已读 ${segment.progress}%${segment.markCount ? ` · ${segment.markCount} 条记录` : ''}`
          return (
            <button
              key={segment.id}
              type="button"
              className={segment.isActive ? 'story-map__segment story-map__segment--active' : 'story-map__segment'}
              aria-label={`跳转到故事地图区段 ${detail}`}
              title={detail}
              onClick={() => onOpenChapter(destination)}
            >
              <span style={{ height: `${segment.progress}%` }} />
              {segment.markCount > 0 && <i aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {activeChapter && (
        <section className="story-map__focus" aria-label="当前故事位置">
          <span className="story-map__focus-index">{String(safeActiveIndex + 1).padStart(2, '0')}</span>
          <div>
            <small>当前故事位置</small>
            <strong>{activeChapter.title}</strong>
            <p>
              <span>已读 {activeChapter.progress}%</span>
              <span><Clock3 size={11} /> {activeChapter.lastReadAt ? formatResumeTime(activeChapter.lastReadAt) : '刚刚'}</span>
            </p>
          </div>
        </section>
      )}

      <div className="story-map__nearby">
        <span>附近章节</span>
        {nearbyChapters.map((chapter, offset) => {
          const chapterIndex = nearbyStart + offset
          const chapterMarks = marks.filter((mark) => mark.progress >= chapter.startProgress && (
            chapterIndex === chapters.length - 1 ? mark.progress <= 100 : mark.progress < chapter.endProgress
          )).length
          return (
            <button
              key={chapter.id}
              type="button"
              className={chapterIndex === safeActiveIndex ? 'story-map__chapter story-map__chapter--active' : 'story-map__chapter'}
              aria-current={chapterIndex === safeActiveIndex ? 'location' : undefined}
              aria-label={`跳转到故事地图章节 ${chapter.title}`}
              onClick={() => onOpenChapter(chapterIndex)}
            >
              <span>{String(chapterIndex + 1).padStart(2, '0')}</span>
              <strong>{chapter.title}</strong>
              <small>{chapterMarks > 0 ? <><Bookmark size={10} /> {chapterMarks}</> : `${chapter.progress}%`}</small>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
