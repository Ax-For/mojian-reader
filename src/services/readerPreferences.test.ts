import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_READER_PREFERENCES, loadReaderPreferences, saveReaderPreferences } from './readerPreferences'

describe('reader preferences', () => {
  beforeEach(() => localStorage.clear())

  it('returns safe defaults when no settings have been saved', () => {
    expect(loadReaderPreferences()).toEqual(DEFAULT_READER_PREFERENCES)
  })

  it('persists supported appearance, layout and automatic reading settings', () => {
    saveReaderPreferences({
      ...DEFAULT_READER_PREFERENCES,
      fontSize: 24,
      fontFamily: 'sans',
      lineHeight: 2.1,
      columnWidth: 760,
      layoutMode: 'double',
      theme: 'night',
      autoScrollSpeed: 5,
      tocWidth: 360
    })

    expect(loadReaderPreferences()).toEqual(expect.objectContaining({
      fontSize: 24,
      fontFamily: 'sans',
      lineHeight: 2.1,
      columnWidth: 760,
      layoutMode: 'double',
      theme: 'night',
      autoScrollSpeed: 5,
      tocWidth: 360
    }))
  })

  it('clamps malformed persisted values instead of trusting local data', () => {
    localStorage.setItem('mojian-reader-preferences', JSON.stringify({
      fontSize: 200,
      lineHeight: -4,
      columnWidth: 20,
      autoScrollSpeed: 99,
      tocWidth: 900,
      theme: 'unknown'
    }))

    expect(loadReaderPreferences()).toEqual(expect.objectContaining({
      fontSize: 32,
      lineHeight: 1.4,
      columnWidth: 520,
      autoScrollSpeed: 8,
      tocWidth: 420,
      theme: 'paper'
    }))
  })
})
