import type { BookContentMetrics } from './bookMetrics'
import { countTextReadingUnits } from './textBookIndex'

interface EpubManifestItem {
  href: string
  mediaType: string
  properties: string
}

function attribute(source: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1] ?? ''
}

function normalizeArchivePath(basePath: string, relativePath: string) {
  let decodedPath = relativePath.split(/[?#]/)[0]
  try {
    decodedPath = decodeURIComponent(decodedPath)
  } catch {
    // Keep the archive path as-is when an EPUB contains malformed URL encoding.
  }
  const segments = [...basePath.split('/').slice(0, -1), ...decodedPath.split('/')]
  const normalized: string[] = []
  for (const segment of segments) {
    if (!segment || segment === '.') continue
    if (segment === '..') normalized.pop()
    else normalized.push(segment)
  }
  return normalized.join('/')
}

function readableText(markup: string) {
  return markup
    .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi, (_, entity: string) => ({
      nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"
    })[entity.toLocaleLowerCase()] ?? ' ')
}

function navigationChapterCount(markup: string, isNcx: boolean) {
  if (isNcx) return markup.match(/<(?:\w+:)?navPoint\b/gi)?.length ?? 0
  const toc = markup.match(/<nav\b[^>]*(?:epub:type|type)\s*=\s*["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? markup
  return toc.match(/<a\b[^>]*\bhref\s*=/gi)?.length ?? 0
}

export async function analyzeEpubBook(
  data: ArrayBuffer,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<BookContentMetrics> {
  if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError')
  const { default: JSZip } = await import('jszip')
  const archive = await JSZip.loadAsync(data)
  onProgress?.(48)

  const filesByLowerPath = new Map(Object.keys(archive.files).map((path) => [path.toLocaleLowerCase(), path]))
  const readText = async (path: string) => {
    const actualPath = filesByLowerPath.get(path.toLocaleLowerCase()) ?? path
    return archive.file(actualPath)?.async('text') ?? null
  }
  const container = await readText('META-INF/container.xml')
  const discoveredOpf = Object.keys(archive.files).find((path) => /\.opf$/i.test(path))
  const opfPath = container ? attribute(container, 'full-path') || discoveredOpf : discoveredOpf
  if (!opfPath) throw new Error('EPUB 缺少书籍清单')
  const opf = await readText(opfPath)
  if (!opf) throw new Error('EPUB 书籍清单无法读取')

  const manifest = new Map<string, EpubManifestItem>()
  for (const match of opf.matchAll(/<(?:\w+:)?item\b([^>]+)>/gi)) {
    const id = attribute(match[1], 'id')
    if (!id) continue
    manifest.set(id, {
      href: attribute(match[1], 'href'),
      mediaType: attribute(match[1], 'media-type'),
      properties: attribute(match[1], 'properties')
    })
  }
  const spineIds = [...opf.matchAll(/<(?:\w+:)?itemref\b([^>]+)>/gi)]
    .filter((match) => attribute(match[1], 'linear').toLocaleLowerCase() !== 'no')
    .map((match) => attribute(match[1], 'idref'))
    .filter(Boolean)

  const navigationItem = [...manifest.values()].find((item) => /(?:^|\s)nav(?:\s|$)/i.test(item.properties))
    ?? [...manifest.values()].find((item) => /application\/x-dtbncx\+xml/i.test(item.mediaType))
  let chapterCount = 0
  if (navigationItem?.href) {
    const navigationMarkup = await readText(normalizeArchivePath(opfPath, navigationItem.href))
    if (navigationMarkup) chapterCount = navigationChapterCount(navigationMarkup, /ncx/i.test(navigationItem.mediaType))
  }
  if (chapterCount === 0) chapterCount = Math.max(1, spineIds.length)

  let wordCount = 0
  for (const [index, id] of spineIds.entries()) {
    if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError')
    if (index > 0 && index % 8 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const item = manifest.get(id)
    if (!item?.href) continue
    const markup = await readText(normalizeArchivePath(opfPath, item.href))
    if (markup) wordCount += countTextReadingUnits(readableText(markup))
    onProgress?.(52 + Math.round(((index + 1) / Math.max(1, spineIds.length)) * 43))
  }

  return { chapterCount, wordCount }
}
