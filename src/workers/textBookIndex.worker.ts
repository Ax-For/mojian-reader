import { buildTextBookIndex } from '../utils/textBookIndex'

self.onmessage = (event: MessageEvent<{ text: string }>) => {
  try {
    self.postMessage({ type: 'complete', index: buildTextBookIndex(event.data.text) })
  } catch {
    self.postMessage({ type: 'error' })
  }
}

export {}
