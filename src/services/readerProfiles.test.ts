import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_READER_PREFERENCES } from './readerPreferences'
import {
  BUILT_IN_READER_PROFILES,
  deleteCustomReaderProfile,
  loadCustomReaderProfiles,
  saveCustomReaderProfile
} from './readerProfiles'

describe('reader profiles', () => {
  beforeEach(() => localStorage.clear())

  it('ships restrained presets for paper, long-form and night reading', () => {
    expect(BUILT_IN_READER_PROFILES.map((profile) => profile.name)).toEqual(['纸页阅读', '长篇沉浸', '夜间专注'])
  })

  it('saves the current appearance as a reusable local profile and can remove it', () => {
    const saved = saveCustomReaderProfile('  我的长篇方案  ', {
      ...DEFAULT_READER_PREFERENCES,
      fontSize: 24,
      theme: 'sepia'
    })

    expect(saved.name).toBe('我的长篇方案')
    expect(loadCustomReaderProfiles()).toEqual([
      expect.objectContaining({ id: saved.id, name: '我的长篇方案', fontSize: 24, theme: 'sepia' })
    ])

    deleteCustomReaderProfile(saved.id)
    expect(loadCustomReaderProfiles()).toEqual([])
  })

  it('ignores malformed saved profiles', () => {
    localStorage.setItem('mojian-reader-profiles', JSON.stringify([{ id: '', name: '', fontSize: 999 }]))
    expect(loadCustomReaderProfiles()).toEqual([])
  })
})
