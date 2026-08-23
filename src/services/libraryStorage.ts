import type { ReaderBook, ReadingMark } from '../types'

const DATABASE_NAME = 'mojian-library'
const BOOK_STORE = 'books'
const BOOK_PAYLOAD_STORE = 'book-payloads'
const MARK_STORE = 'reading-marks'
const DATABASE_VERSION = 3

export type LocalBookPayload = Pick<ReaderBook, 'content' | 'data' | 'textIndex'>

function bookMetadata(book: ReaderBook): ReaderBook {
  const metadata = { ...book }
  metadata.content = undefined
  metadata.data = undefined
  metadata.textIndex = undefined
  return metadata
}

function openLibrary(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = (event) => {
      const database = request.result
      const transaction = request.transaction!
      let bookStore: IDBObjectStore
      if (!database.objectStoreNames.contains(BOOK_STORE)) {
        bookStore = database.createObjectStore(BOOK_STORE, { keyPath: 'id' })
      } else {
        bookStore = transaction.objectStore(BOOK_STORE)
      }
      let payloadStore: IDBObjectStore
      if (!database.objectStoreNames.contains(BOOK_PAYLOAD_STORE)) {
        payloadStore = database.createObjectStore(BOOK_PAYLOAD_STORE, { keyPath: 'id' })
      } else {
        payloadStore = transaction.objectStore(BOOK_PAYLOAD_STORE)
      }
      if (!database.objectStoreNames.contains(MARK_STORE)) {
        const markStore = database.createObjectStore(MARK_STORE, { keyPath: 'id' })
        markStore.createIndex('bookId', 'bookId', { unique: false })
      }

      if ((event as IDBVersionChangeEvent).oldVersion > 0 && (event as IDBVersionChangeEvent).oldVersion < 3) {
        const cursorRequest = bookStore.openCursor()
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (!cursor) return
          const book = cursor.value as ReaderBook
          if (book.content !== undefined || book.data !== undefined) {
            payloadStore.put({ id: book.id, content: book.content, data: book.data, textIndex: book.textIndex })
            cursor.update(bookMetadata(book))
          }
          cursor.continue()
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadLocalBooks(): Promise<ReaderBook[]> {
  const database = await openLibrary()
  if (!database) return []

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BOOK_STORE, 'readonly')
    const request = transaction.objectStore(BOOK_STORE).getAll()
    request.onsuccess = () => resolve(request.result as ReaderBook[])
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function saveLocalBook(book: ReaderBook): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOK_STORE, BOOK_PAYLOAD_STORE], 'readwrite')
    transaction.objectStore(BOOK_STORE).put(bookMetadata(book))
    if (book.content !== undefined || book.data !== undefined || book.textIndex !== undefined) {
      transaction.objectStore(BOOK_PAYLOAD_STORE).put({ id: book.id, content: book.content, data: book.data, textIndex: book.textIndex })
    }
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function saveLocalBookMetadata(book: ReaderBook): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BOOK_STORE, 'readwrite')
    transaction.objectStore(BOOK_STORE).put(bookMetadata(book))
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function saveLocalBookPayload(id: string, payload: LocalBookPayload): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BOOK_PAYLOAD_STORE, 'readwrite')
    transaction.objectStore(BOOK_PAYLOAD_STORE).put({ id, ...payload })
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function loadLocalBookPayload(id: string): Promise<LocalBookPayload | null> {
  const database = await openLibrary()
  if (!database) return null

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(BOOK_PAYLOAD_STORE, 'readonly')
    const request = transaction.objectStore(BOOK_PAYLOAD_STORE).get(id)
    request.onsuccess = () => {
      const stored = request.result as (LocalBookPayload & { id: string }) | undefined
      resolve(stored ? { content: stored.content, data: stored.data, textIndex: stored.textIndex } : null)
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function deleteLocalBook(id: string): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOK_STORE, BOOK_PAYLOAD_STORE, MARK_STORE], 'readwrite')
    transaction.objectStore(BOOK_STORE).delete(id)
    transaction.objectStore(BOOK_PAYLOAD_STORE).delete(id)
    const markStore = transaction.objectStore(MARK_STORE)
    const markCursor = markStore.index('bookId').openKeyCursor(IDBKeyRange.only(id))
    markCursor.onsuccess = () => {
      const cursor = markCursor.result
      if (!cursor) return
      markStore.delete(cursor.primaryKey)
      cursor.continue()
    }
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function clearLocalLibrary(): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOK_STORE, BOOK_PAYLOAD_STORE], 'readwrite')
    transaction.objectStore(BOOK_STORE).clear()
    transaction.objectStore(BOOK_PAYLOAD_STORE).clear()
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function loadReadingMarks(): Promise<ReadingMark[]> {
  const database = await openLibrary()
  if (!database) return []

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MARK_STORE, 'readonly')
    const request = transaction.objectStore(MARK_STORE).getAll()
    request.onsuccess = () => resolve(request.result as ReadingMark[])
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => database.close()
  })
}

export async function saveReadingMark(mark: ReadingMark): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MARK_STORE, 'readwrite')
    transaction.objectStore(MARK_STORE).put(mark)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function deleteReadingMark(id: string): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MARK_STORE, 'readwrite')
    transaction.objectStore(MARK_STORE).delete(id)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function clearReadingMarks(): Promise<void> {
  const database = await openLibrary()
  if (!database) return

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MARK_STORE, 'readwrite')
    transaction.objectStore(MARK_STORE).clear()
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}
