import type { CSSProperties } from 'react'
import type { ReaderBook } from '../types'
import { isSafeBookImageDataUrl } from '../utils/bookImages'

interface BookCoverProps {
  book: ReaderBook
  compact?: boolean
}

export function BookCover({ book, compact = false }: BookCoverProps) {
  const coverImage = isSafeBookImageDataUrl(book.cover.image) ? book.cover.image : undefined
  const style = {
    '--cover-background': book.cover.background,
    '--cover-foreground': book.cover.foreground
  } as CSSProperties

  return (
    <div className={`book-cover${compact ? ' book-cover--compact' : ''}${coverImage ? ' book-cover--image' : ''}`} style={style}>
      {coverImage && <img className="book-cover__image" src={coverImage} alt={`${book.title}封面预览`} />}
      {coverImage && <span className="book-cover__image-shade" aria-hidden="true" />}
      <span className="book-cover__format">{book.format}</span>
      <div className="book-cover__title">{book.title}</div>
      <span className="book-cover__author">{book.author}</span>
    </div>
  )
}
