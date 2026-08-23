import { searchTextOccurrences } from '../utils/textSearch'

let paragraphs: string[] = []
let labels: string[] = []

self.onmessage = (event: MessageEvent<
  | { type: 'initialize'; paragraphs: string[]; labels: string[] }
  | { type: 'search'; requestId: number; query: string }
>) => {
  if (event.data.type === 'initialize') {
    paragraphs = event.data.paragraphs
    labels = event.data.labels
    return
  }
  const { query, requestId } = event.data
  const results = searchTextOccurrences(paragraphs, labels, query)
  self.postMessage({ type: 'results', requestId, results })
}

export {}
