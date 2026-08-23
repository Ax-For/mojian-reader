import { decodeTextBuffer } from '../utils/textDecoder'
import { buildTextBookIndex } from '../utils/textBookIndex'

self.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  self.postMessage({ type: 'progress', value: 62 })
  try {
    const content = decodeTextBuffer(event.data.buffer)
    self.postMessage({ type: 'progress', value: 82 })
    const textIndex = buildTextBookIndex(content)
    self.postMessage({ type: 'complete', content, textIndex })
  } catch {
    self.postMessage({ type: 'error' })
  }
}

export {}
