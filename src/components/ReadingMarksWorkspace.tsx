import { useMemo, useState } from 'react'
import { ArrowUpRight, Bookmark, MessageSquareText, Pencil, Trash2, X } from 'lucide-react'
import type { AnnotationColor, ReaderBook, ReadingMark, ReadingMarkKind } from '../types'
import { BookCover } from './BookCover'

type MarkFilter = 'all' | ReadingMarkKind

interface ReadingMarksWorkspaceProps {
  books: ReaderBook[]
  marks: ReadingMark[]
  query: string
  onOpenMark: (mark: ReadingMark) => void
  onDeleteMark: (id: string) => void
  onUpdateMark?: (mark: ReadingMark) => void
}

const MARK_FILTERS: { id: MarkFilter; label: string }[] = [
  { id: 'all', label: '全部记录' },
  { id: 'bookmark', label: '书签' },
  { id: 'annotation', label: '标注' }
]

function formatMarkTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(timestamp)
}

export function ReadingMarksWorkspace({
  books,
  marks,
  query,
  onOpenMark,
  onDeleteMark,
  onUpdateMark
}: ReadingMarksWorkspaceProps) {
  const [filter, setFilter] = useState<MarkFilter>('all')
  const [editingMark, setEditingMark] = useState<ReadingMark | null>(null)
  const [editingNote, setEditingNote] = useState('')
  const [editingColor, setEditingColor] = useState<AnnotationColor>('amber')
  const booksById = useMemo(() => new Map(books.map((book) => [book.id, book])), [books])
  const visibleMarks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return [...marks]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((mark) => {
        const book = booksById.get(mark.bookId)
        const searchable = `${book?.title ?? ''} ${book?.author ?? ''} ${mark.label} ${mark.excerpt} ${mark.note ?? ''}`
          .toLocaleLowerCase()
        return (filter === 'all' || mark.kind === filter) &&
          (!normalizedQuery || searchable.includes(normalizedQuery))
      })
  }, [booksById, filter, marks, query])
  const bookmarkCount = marks.filter((mark) => mark.kind === 'bookmark').length
  const annotationCount = marks.length - bookmarkCount

  return (
    <>
      <section className="page-heading marks-page-heading">
        <div>
          <p className="eyebrow">阅读记录</p>
          <h1>书签与标注</h1>
          <p>从保存的位置继续阅读，或回看写下的想法。</p>
        </div>
        <div className="marks-summary" aria-label="阅读记录统计">
          <span><Bookmark size={14} /> {bookmarkCount} 个书签</span>
          <span><MessageSquareText size={14} /> {annotationCount} 条标注</span>
        </div>
      </section>

      <section className="marks-section" aria-labelledby="marks-heading">
        <div className="section-heading section-heading--shelf">
          <div>
            <p className="eyebrow">{visibleMarks.length} 条记录</p>
            <h2 id="marks-heading">保存的阅读位置</h2>
          </div>
          <div className="filter-tabs" aria-label="阅读记录筛选">
            {MARK_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? 'filter-tab filter-tab--active' : 'filter-tab'}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {visibleMarks.length > 0 ? (
          <div className="marks-list">
            {visibleMarks.map((mark) => {
              const book = booksById.get(mark.bookId)
              return (
                <article className="mark-row" key={mark.id}>
                  {book ? <BookCover book={book} compact /> : <div className="mark-row__missing">已移除</div>}
                  <div className="mark-row__body">
                    <div className="mark-row__meta">
                      <span className={`mark-kind mark-kind--${mark.kind}`}>
                        {mark.kind === 'bookmark' ? <Bookmark size={12} /> : <MessageSquareText size={12} />}
                        {mark.kind === 'bookmark' ? '书签' : '标注'}
                      </span>
                      <span>{book?.title ?? '书籍已从书架移除'}</span>
                      <span>已读 {mark.progress}%</span>
                    </div>
                    <h3>{mark.label}</h3>
                    {mark.note && <p className="mark-row__note">{mark.note}</p>}
                    <blockquote>{mark.excerpt || '该位置没有可展示的文本摘要。'}</blockquote>
                    <time dateTime={new Date(mark.createdAt).toISOString()}>{formatMarkTime(mark.createdAt)}</time>
                  </div>
                  <div className="mark-row__actions">
                    <button
                      className="mark-jump-button"
                      type="button"
                      disabled={!book}
                      aria-label={`跳转到${mark.label}`}
                      onClick={() => onOpenMark(mark)}
                    >
                      继续阅读 <ArrowUpRight size={15} />
                    </button>
                    {mark.kind === 'annotation' && onUpdateMark && (
                      <button
                        className="mark-delete-button mark-edit-button"
                        type="button"
                        aria-label={`编辑${mark.label}`}
                        onClick={() => {
                          setEditingMark(mark)
                          setEditingNote(mark.note ?? '')
                          setEditingColor(mark.color ?? 'amber')
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button
                      className="mark-delete-button"
                      type="button"
                      aria-label={`删除${mark.label}`}
                      onClick={() => onDeleteMark(mark.id)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-shelf marks-empty">
            <Bookmark size={24} />
            <h3>{marks.length === 0 ? '还没有保存阅读记录' : '没有找到匹配的记录'}</h3>
            <p>{marks.length === 0 ? '在阅读页添加书签或标注后，会集中显示在这里。' : '试试其他关键词或筛选条件。'}</p>
          </div>
        )}
      </section>
      {editingMark && (
        <div className="library-dialog-overlay" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setEditingMark(null)
        }}>
          <section className="library-dialog mark-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="mark-edit-title">
            <div className="library-dialog__heading">
              <div><p className="eyebrow">阅读标注</p><h2 id="mark-edit-title">编辑标注</h2></div>
              <button className="mark-delete-button" type="button" aria-label="关闭编辑标注" onClick={() => setEditingMark(null)}><X size={17} /></button>
            </div>
            <blockquote>{editingMark.excerpt}</blockquote>
            <label>
              <span>标注内容</span>
              <textarea aria-label="编辑标注内容" value={editingNote} onChange={(event) => setEditingNote(event.target.value)} />
            </label>
            <div className="annotation-colors" aria-label="标注颜色">
              {(['amber', 'coral', 'sage'] as AnnotationColor[]).map((color) => (
                <button key={color} type="button" className={`annotation-color annotation-color--${color} ${editingColor === color ? 'annotation-color--active' : ''}`} aria-label={`${color}标注颜色`} aria-pressed={editingColor === color} onClick={() => setEditingColor(color)} />
              ))}
            </div>
            <div className="library-dialog__actions">
              <button className="quiet-action" type="button" onClick={() => setEditingMark(null)}>取消</button>
              <button className="primary-button" type="button" disabled={!editingNote.trim()} onClick={() => {
                onUpdateMark?.({ ...editingMark, note: editingNote.trim(), color: editingColor })
                setEditingMark(null)
              }}>保存标注修改</button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
