export const MAX_BOOK_IMAGE_BYTES = 4 * 1024 * 1024

const SAFE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif'
])

const SAFE_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|avif)$/i
const SAFE_DATA_URL = /^data:image\/(?:jpeg|png|webp|avif);base64,[a-z0-9+/]+=*$/i
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_BOOK_IMAGE_BYTES * 4 / 3) + 128

export type BookImageValidation = { ok: true } | { ok: false; message: string }

export function validateBookImageFile(file: File): BookImageValidation {
  if (!SAFE_IMAGE_EXTENSIONS.test(file.name) || !SAFE_IMAGE_MIME_TYPES.has(file.type.toLocaleLowerCase())) {
    return { ok: false, message: '请选择 JPG、PNG、WebP 或 AVIF 图片。' }
  }
  if (file.size > MAX_BOOK_IMAGE_BYTES) {
    return { ok: false, message: '图片不能超过 4 MB。' }
  }
  if (file.size === 0) return { ok: false, message: '图片内容为空，请重新选择。' }
  return { ok: true }
}

export function isSafeBookImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_DATA_URL_LENGTH && SAFE_DATA_URL.test(value)
}

export function readBookImageFile(file: File): Promise<string> {
  const validation = validateBookImageFile(file)
  if (!validation.ok) return Promise.reject(new Error(validation.message))

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择。'))
    reader.onload = () => {
      if (isSafeBookImageDataUrl(reader.result)) resolve(reader.result)
      else reject(new Error('图片内容无效，请重新选择。'))
    }
    reader.readAsDataURL(file)
  })
}
