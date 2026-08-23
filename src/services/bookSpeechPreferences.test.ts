import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearBookSpeechVoice,
  loadBookSpeechVoice,
  resolveBookSpeechVoice,
  saveBookSpeechVoice
} from './bookSpeechPreferences'

function voice(overrides: Partial<SpeechSynthesisVoice> = {}) {
  return {
    default: false,
    lang: 'zh-CN',
    localService: true,
    name: '晓晓',
    voiceURI: 'voice-xiaoxiao',
    ...overrides
  } as SpeechSynthesisVoice
}

describe('book speech preferences', () => {
  beforeEach(() => localStorage.clear())

  it('keeps each book voice independent and restores it by voice URI', () => {
    const firstVoice = voice()
    const secondVoice = voice({ name: '云希', voiceURI: 'voice-yunxi' })

    saveBookSpeechVoice('book-a', firstVoice)
    saveBookSpeechVoice('book-b', secondVoice)

    expect(loadBookSpeechVoice('book-a')).toEqual(expect.objectContaining({
      voiceURI: 'voice-xiaoxiao',
      name: '晓晓'
    }))
    expect(loadBookSpeechVoice('book-b')).toEqual(expect.objectContaining({
      voiceURI: 'voice-yunxi',
      name: '云希'
    }))
    expect(resolveBookSpeechVoice([secondVoice, firstVoice], loadBookSpeechVoice('book-a'))).toBe(firstVoice)
  })

  it('falls back to the same name and language when a platform changes the voice URI', () => {
    saveBookSpeechVoice('book-a', voice())
    const migratedVoice = voice({ voiceURI: 'voice-xiaoxiao-v2' })

    expect(resolveBookSpeechVoice([migratedVoice], loadBookSpeechVoice('book-a'))).toBe(migratedVoice)
  })

  it('ignores malformed storage and can return a book to the system default', () => {
    localStorage.setItem('mojian-book-speech-voices', '{broken')
    expect(loadBookSpeechVoice('book-a')).toBeNull()

    saveBookSpeechVoice('book-a', voice())
    clearBookSpeechVoice('book-a')
    expect(loadBookSpeechVoice('book-a')).toBeNull()
    expect(resolveBookSpeechVoice([voice()], null)).toBeNull()
  })
})
