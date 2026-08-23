export interface TextSearchMatch {
  index: number
  offset: number
  label: string
  excerpt: string
}

export interface ChapterLocation {
  title: string
  paragraphIndex: number
}

export function buildParagraphChapterLabels(paragraphCount: number, chapters: ChapterLocation[]) {
  const labels = new Array<string>(paragraphCount)
  let chapterCursor = 0
  let activeTitle = chapters[0]?.title ?? '正文'
  for (let index = 0; index < paragraphCount; index += 1) {
    while (chapters[chapterCursor + 1]?.paragraphIndex <= index) chapterCursor += 1
    if (chapters[chapterCursor]?.paragraphIndex <= index) activeTitle = chapters[chapterCursor].title
    labels[index] = activeTitle
  }
  return labels
}

export function searchTextOccurrences(paragraphs: string[], labels: string[], rawQuery: string): TextSearchMatch[] {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return []
  const results: TextSearchMatch[] = []
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index]
    const normalizedParagraph = paragraph.toLocaleLowerCase()
    let offset = normalizedParagraph.indexOf(query)
    while (offset !== -1) {
      const excerptStart = Math.max(0, offset - 34)
      const excerptEnd = Math.min(paragraph.length, offset + query.length + 54)
      results.push({
        index,
        offset,
        label: labels[index] ?? '正文',
        excerpt: `${excerptStart > 0 ? '…' : ''}${paragraph.slice(excerptStart, excerptEnd)}${excerptEnd < paragraph.length ? '…' : ''}`
      })
      offset = normalizedParagraph.indexOf(query, offset + Math.max(1, query.length))
    }
  }
  return results
}
