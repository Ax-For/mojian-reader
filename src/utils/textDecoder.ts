import jschardet from 'jschardet'

const ENCODING_DETECTION_SAMPLE_BYTES = 256 * 1024

function toBinaryString(bytes: Uint8Array): string {
  const chunkSize = 8192
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return result
}

function normalizeEncoding(encoding: string | null): string {
  const normalized = encoding?.toLowerCase().replace(/[_\s]/g, '-') ?? 'utf-8'
  if (['gb2312', 'gbk', 'gb18030', 'hz-gb-2312'].includes(normalized)) return 'gb18030'
  if (normalized === 'ascii') return 'utf-8'
  return normalized
}

export function decodeTextBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const detectionSample = bytes.subarray(0, Math.min(bytes.length, ENCODING_DETECTION_SAMPLE_BYTES))
  const detected = jschardet.detect(toBinaryString(detectionSample))
  const encoding = normalizeEncoding(detected.encoding)
  let decoded: string

  try {
    decoded = new TextDecoder(encoding).decode(bytes)
  } catch {
    decoded = new TextDecoder('utf-8').decode(bytes)
  }

  return decoded.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}
