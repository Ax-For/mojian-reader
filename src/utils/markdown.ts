export type MarkdownBlockKind = 'heading' | 'paragraph' | 'blockquote' | 'list-item' | 'code' | 'separator'

export interface MarkdownBlock {
  kind: MarkdownBlockKind
  text: string
  level?: number
  ordered?: boolean
  language?: string
}

function plainInlineMarkdown(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^\s)]+(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1')
    .trim()
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  let codeLines: string[] | null = null
  let codeLanguage = ''

  function flushParagraph() {
    if (paragraph.length === 0) return
    const text = plainInlineMarkdown(paragraph.join(' ').replace(/\s+/g, ' '))
    if (text) blocks.push({ kind: 'paragraph', text })
    paragraph = []
  }

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/)
    if (fence) {
      if (codeLines) {
        blocks.push({ kind: 'code', text: codeLines.join('\n'), language: codeLanguage })
        codeLines = null
        codeLanguage = ''
      } else {
        flushParagraph()
        codeLines = []
        codeLanguage = fence[1] ?? ''
      }
      continue
    }
    if (codeLines) {
      codeLines.push(line)
      continue
    }
    if (!line.trim()) {
      flushParagraph()
      continue
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      flushParagraph()
      blocks.push({ kind: 'heading', level: heading[1].length, text: plainInlineMarkdown(heading[2]) })
      continue
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph()
      blocks.push({ kind: 'separator', text: line.trim() })
      continue
    }
    const quote = line.match(/^\s*>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      blocks.push({ kind: 'blockquote', text: plainInlineMarkdown(quote[1]) })
      continue
    }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)、]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      blocks.push({ kind: 'list-item', ordered: Boolean(ordered), text: plainInlineMarkdown((ordered ?? unordered)![1]) })
      continue
    }
    paragraph.push(line.trim())
  }
  flushParagraph()
  if (codeLines) blocks.push({ kind: 'code', text: codeLines.join('\n'), language: codeLanguage })
  return blocks
}
