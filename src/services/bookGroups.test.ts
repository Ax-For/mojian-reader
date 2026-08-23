import { afterEach, describe, expect, it } from 'vitest'
import { loadBookGroups, normalizeBookGroups, saveBookGroups } from './bookGroups'

afterEach(() => localStorage.clear())

describe('book groups', () => {
  it('normalizes names and removes invalid or duplicate groups', () => {
    expect(normalizeBookGroups([
      { id: ' reread ', name: ' 想重读 ', createdAt: 2 },
      { id: 'reread', name: '重复标识', createdAt: 3 },
      { id: 'another', name: '想重读', createdAt: 4 },
      { id: '', name: '无效', createdAt: 5 }
    ])).toEqual([
      { id: 'reread', name: '想重读', createdAt: 2 }
    ])
  })

  it('persists valid groups locally and tolerates malformed storage', () => {
    saveBookGroups([
      { id: 'reread', name: '想重读', createdAt: 1 },
      { id: 'research', name: '资料书', createdAt: 2 }
    ])
    expect(loadBookGroups()).toEqual([
      { id: 'reread', name: '想重读', createdAt: 1 },
      { id: 'research', name: '资料书', createdAt: 2 }
    ])

    localStorage.setItem('mojian-book-groups', '{broken')
    expect(loadBookGroups()).toEqual([])
  })
})
