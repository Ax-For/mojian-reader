import type { TextBookIndex } from '../types'
import { buildTextBookIndex } from '../utils/textBookIndex'

const WORKER_INDEX_THRESHOLD = 256 * 1024

export function buildTextBookIndexAsync(text: string): Promise<TextBookIndex> {
  if (typeof Worker === 'undefined' || text.length < WORKER_INDEX_THRESHOLD) {
    return Promise.resolve().then(() => buildTextBookIndex(text))
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/textBookIndex.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ type: 'complete'; index: TextBookIndex } | { type: 'error' }>) => {
      worker.terminate()
      if (event.data.type === 'complete') resolve(event.data.index)
      else reject(new Error('无法建立长篇索引'))
    }
    worker.onerror = () => {
      worker.terminate()
      reject(new Error('无法建立长篇索引'))
    }
    worker.postMessage({ text })
  })
}
