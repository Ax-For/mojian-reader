const STORAGE_KEY = 'mojian-book-speech-voices'

export interface BookSpeechVoicePreference {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
}

type StoredBookSpeechVoices = Record<string, BookSpeechVoicePreference>

function normalizeVoicePreference(value: unknown): BookSpeechVoicePreference | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<BookSpeechVoicePreference>
  if (
    typeof candidate.voiceURI !== 'string' || !candidate.voiceURI.trim() ||
    typeof candidate.name !== 'string' || !candidate.name.trim() ||
    typeof candidate.lang !== 'string' || !candidate.lang.trim()
  ) return null
  return {
    voiceURI: candidate.voiceURI,
    name: candidate.name,
    lang: candidate.lang,
    localService: candidate.localService === true
  }
}

function loadStoredBookSpeechVoices(): StoredBookSpeechVoices {
  if (typeof localStorage === 'undefined') return {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([bookId, value]) => [bookId, normalizeVoicePreference(value)] as const)
        .filter((entry): entry is readonly [string, BookSpeechVoicePreference] => entry[1] !== null)
    )
  } catch {
    return {}
  }
}

function persistStoredBookSpeechVoices(voices: StoredBookSpeechVoices) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(voices))
}

export function loadBookSpeechVoice(bookId: string): BookSpeechVoicePreference | null {
  return loadStoredBookSpeechVoices()[bookId] ?? null
}

export function saveBookSpeechVoice(bookId: string, voice: SpeechSynthesisVoice): BookSpeechVoicePreference {
  const preference: BookSpeechVoicePreference = {
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService
  }
  persistStoredBookSpeechVoices({ ...loadStoredBookSpeechVoices(), [bookId]: preference })
  return preference
}

export function clearBookSpeechVoice(bookId: string) {
  const stored = loadStoredBookSpeechVoices()
  delete stored[bookId]
  persistStoredBookSpeechVoices(stored)
}

export function resolveBookSpeechVoice(
  voices: SpeechSynthesisVoice[],
  preference: BookSpeechVoicePreference | null
): SpeechSynthesisVoice | null {
  if (!preference) return null
  return voices.find((voice) => voice.voiceURI === preference.voiceURI)
    ?? voices.find((voice) => voice.name === preference.name && voice.lang === preference.lang)
    ?? null
}
