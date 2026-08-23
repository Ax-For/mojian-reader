import { describe, expect, it } from 'vitest'
import {
  MAX_BOOK_IMAGE_BYTES,
  isSafeBookImageDataUrl,
  validateBookImageFile
} from './bookImages'

describe('book image safety', () => {
  it('accepts common raster formats and rejects SVG or oversized images', () => {
    expect(validateBookImageFile(new File(['png'], 'cover.png', { type: 'image/png' }))).toEqual({ ok: true })
    expect(validateBookImageFile(new File(['webp'], 'background.webp', { type: 'image/webp' }))).toEqual({ ok: true })

    expect(validateBookImageFile(new File(['<svg/>'], 'cover.svg', { type: 'image/svg+xml' }))).toEqual({
      ok: false,
      message: '请选择 JPG、PNG、WebP 或 AVIF 图片。'
    })
    expect(validateBookImageFile(new File([new Uint8Array(MAX_BOOK_IMAGE_BYTES + 1)], 'huge.jpg', { type: 'image/jpeg' }))).toEqual({
      ok: false,
      message: '图片不能超过 4 MB。'
    })
  })

  it('only allows bounded raster data URLs to reach rendered styles and images', () => {
    expect(isSafeBookImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true)
    expect(isSafeBookImageDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false)
    expect(isSafeBookImageDataUrl('https://example.com/cover.jpg')).toBe(false)
  })
})
