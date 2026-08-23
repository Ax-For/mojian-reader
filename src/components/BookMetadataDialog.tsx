import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, FolderOpen, Image as ImageIcon, Palette, Trash2, Upload, X } from 'lucide-react'
import type { BookCover as BookCoverData, BookGroup, BookReadingBackground, ReaderBook } from '../types'
import { readBookImageFile } from '../utils/bookImages'
import { normalizeReadingBackground, READING_BACKGROUND_PRESETS } from '../utils/bookMetadata'
import { BookCover } from './BookCover'

interface BookMetadataDialogProps {
  book: ReaderBook
  onClose: () => void
  onSave: (book: ReaderBook) => void
  onDelete?: (book: ReaderBook) => void
  groups?: BookGroup[]
}

const COVER_PALETTES: { label: string; background: string; foreground: string }[] = [
  { label: '朱砂', background: '#a54432', foreground: '#fff3df' },
  { label: '秋麦', background: '#c29a55', foreground: '#27251e' },
  { label: '松墨', background: '#344e4a', foreground: '#f0e8d5' },
  { label: '暮蓝', background: '#4a5769', foreground: '#f7efe2' },
  { label: '玄青', background: '#292d2b', foreground: '#ece5d8' }
]

export function BookMetadataDialog({ book, onClose, onSave, onDelete, groups = [] }: BookMetadataDialogProps) {
  const coverInput = useRef<HTMLInputElement>(null)
  const readingBackgroundInput = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [note, setNote] = useState(book.note ?? '')
  const [cover, setCover] = useState<BookCoverData>({ ...book.cover })
  const [readingBackground, setReadingBackground] = useState<BookReadingBackground>(() => normalizeReadingBackground(book.readingBackground))
  const [imageError, setImageError] = useState<string | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [groupIds, setGroupIds] = useState(() => book.groupIds?.filter((id) => groups.some((group) => group.id === id)) ?? [])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function updateBookImage(kind: 'cover' | 'background', file?: File) {
    if (!file) return
    setImageError(null)
    try {
      const image = await readBookImageFile(file)
      if (kind === 'cover') setCover((current) => ({ ...current, image }))
      else setReadingBackground((current) => ({ ...current, image }))
    } catch (error) {
      setImageError(error instanceof Error ? error.message : '图片读取失败，请重新选择。')
    }
  }

  const editedBook: ReaderBook = {
    ...book,
    title: title.trim() || book.title,
    author: author.trim() || '未知作者',
    note,
    cover,
    readingBackground,
    groupIds: groupIds.length ? groupIds : undefined
  }

  return (
    <div className="library-dialog-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="library-dialog library-dialog--metadata" role="dialog" aria-modal="true" aria-labelledby="book-manager-title">
        <div className="library-dialog__heading">
          <div>
            <p className="eyebrow">本地书籍</p>
            <h2 id="book-manager-title">编辑书籍资料</h2>
          </div>
          <div className="library-dialog__heading-actions">
            <span>{book.format.toUpperCase()} · {book.sizeLabel}</span>
            <button type="button" aria-label="关闭书籍资料编辑" onClick={onClose}><X size={17} /></button>
          </div>
        </div>

        <div className="metadata-dialog__body">
          <aside className="metadata-preview">
            <p>实时预览</p>
            <BookCover book={editedBook} />
            <strong>{title.trim() || book.title}</strong>
            <span>{author.trim() || '未知作者'}</span>
            <div
              className={`metadata-reading-preview${readingBackground.image ? ' metadata-reading-preview--image' : ''}`}
              data-preset={readingBackground.preset}
              style={readingBackground.image ? { backgroundImage: `url("${readingBackground.image}")` } : undefined}
            >
              <i /><i /><i /><i />
              <small>{READING_BACKGROUND_PRESETS.find((item) => item.id === readingBackground.preset)?.label}</small>
            </div>
          </aside>

          <div className="metadata-editor">
            <section className="metadata-section" aria-labelledby="metadata-basic-heading">
              <div className="metadata-section__heading">
                <div><strong id="metadata-basic-heading">基本资料</strong><span>用于书架展示和本地搜索</span></div>
              </div>
              <div className="metadata-fields metadata-fields--split">
                <label>
                  <span>书名</span>
                  <input autoFocus value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <label>
                  <span>作者</span>
                  <input value={author} maxLength={300} onChange={(event) => setAuthor(event.target.value)} />
                </label>
              </div>
              <label className="metadata-note-field">
                <span>书籍备注 <small>{note.length}/2000</small></span>
                <textarea
                  aria-label="书籍备注"
                  value={note}
                  maxLength={2000}
                  placeholder="记录版本、来源、阅读计划或任何想保留的信息…"
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </section>

            <section className="metadata-section" aria-labelledby="metadata-groups-heading">
              <div className="metadata-section__heading">
                <div><strong id="metadata-groups-heading">所在分组</strong><span>可同时加入多个自建分组</span></div>
              </div>
              {groups.length > 0 ? (
                <div className="metadata-group-options">
                  {groups.map((group) => {
                    const isSelected = groupIds.includes(group.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        aria-label={`${group.name}分组`}
                        aria-pressed={isSelected}
                        onClick={() => setGroupIds((current) => (
                          current.includes(group.id)
                            ? current.filter((id) => id !== group.id)
                            : [...current, group.id]
                        ))}
                      >
                        <FolderOpen size={15} />
                        <span>{group.name}</span>
                        <i>{isSelected && <Check size={12} />}</i>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="metadata-groups-empty">还没有自建分组，可在书架左侧创建。</p>
              )}
            </section>

            <section className="metadata-section" aria-labelledby="metadata-cover-heading">
              <div className="metadata-section__heading">
                <div><strong id="metadata-cover-heading">书籍封面</strong><span>上传图片，或使用内置封面配色</span></div>
                <div className="metadata-inline-actions">
                  {cover.image && <button type="button" onClick={() => setCover((current) => ({ ...current, image: undefined }))}>移除图片</button>}
                  <button type="button" onClick={() => coverInput.current?.click()}><ImageIcon size={14} /> 上传封面</button>
                </div>
              </div>
              <div className="cover-palette" aria-label="封面配色">
                {COVER_PALETTES.map((palette) => (
                  <button
                    key={palette.label}
                    type="button"
                    aria-label={`${palette.label}封面配色`}
                    aria-pressed={cover.background === palette.background && cover.foreground === palette.foreground}
                    style={{ '--swatch': palette.background, '--swatch-ink': palette.foreground } as CSSProperties}
                    onClick={() => setCover({ background: palette.background, foreground: palette.foreground })}
                  ><span>字</span>{palette.label}</button>
                ))}
              </div>
              <input
                ref={coverInput}
                data-cover-input
                className="visually-hidden"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                onChange={(event) => {
                  void updateBookImage('cover', event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </section>

            <section className="metadata-section" aria-labelledby="metadata-background-heading">
              <div className="metadata-section__heading">
                <div><strong id="metadata-background-heading">阅读背景</strong><span>只对这本书生效，不改变全局主题</span></div>
                <div className="metadata-inline-actions">
                  {readingBackground.image && <button type="button" onClick={() => setReadingBackground((current) => ({ ...current, image: undefined }))}>移除背景图</button>}
                  <button type="button" onClick={() => readingBackgroundInput.current?.click()}><Upload size={14} /> 上传背景</button>
                </div>
              </div>
              <div className="reading-background-options">
                {READING_BACKGROUND_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={`${preset.label}阅读背景`}
                    aria-pressed={readingBackground.preset === preset.id}
                    onClick={() => setReadingBackground((current) => ({ ...current, preset: preset.id }))}
                  >
                    <span style={{ '--background-swatch': preset.color } as CSSProperties}><Palette size={13} /></span>
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </button>
                ))}
              </div>
              <input
                ref={readingBackgroundInput}
                data-reading-background-input
                className="visually-hidden"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.avif,image/jpeg,image/png,image/webp,image/avif"
                onChange={(event) => {
                  void updateBookImage('background', event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              {imageError && <p className="metadata-image-error" role="alert">{imageError}</p>}
            </section>

            {onDelete && (
              <div className="library-dialog__danger">
                <button
                  className={deleteArmed ? 'danger-button danger-button--armed' : 'danger-button'}
                  type="button"
                  onClick={() => {
                    if (!deleteArmed) {
                      setDeleteArmed(true)
                      return
                    }
                    onDelete(book)
                    onClose()
                  }}
                >
                  <Trash2 size={16} />
                  {deleteArmed ? '确认删除书籍' : '删除书籍'}
                </button>
                {deleteArmed && <small>正文、进度与这本书的标注将一并删除。</small>}
              </div>
            )}
          </div>
        </div>

        <div className="library-dialog__actions">
          <button className="quiet-action" type="button" onClick={onClose}>取消</button>
          <button
            className="primary-button"
            type="button"
            disabled={!title.trim()}
            onClick={() => {
              onSave({
                ...book,
                title: title.trim(),
                author: author.trim() || '未知作者',
                note: note.trim() || undefined,
                cover,
                readingBackground,
                groupIds: groupIds.length ? groupIds : undefined
              })
              onClose()
            }}
          >
            保存书籍信息
          </button>
        </div>
      </section>
    </div>
  )
}
