import type { BookGroup } from '../types'

const STORAGE_KEY = 'mojian-book-groups'
const MAX_GROUPS = 100
const MAX_GROUP_NAME_LENGTH = 40

export function normalizeBookGroups(value: unknown): BookGroup[] {
  if (!Array.isArray(value)) return []
  const groups: BookGroup[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  for (const item of value.slice(0, MAX_GROUPS)) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Partial<BookGroup>
    const id = typeof candidate.id === 'string' ? candidate.id.trim().slice(0, 120) : ''
    const name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, MAX_GROUP_NAME_LENGTH) : ''
    const normalizedName = name.toLocaleLowerCase()
    if (!id || !name || typeof candidate.createdAt !== 'number' || !Number.isFinite(candidate.createdAt)) continue
    if (ids.has(id) || names.has(normalizedName)) continue
    ids.add(id)
    names.add(normalizedName)
    groups.push({ id, name, createdAt: candidate.createdAt })
  }

  return groups
}

export function loadBookGroups(): BookGroup[] {
  try {
    return normalizeBookGroups(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return []
  }
}

export function saveBookGroups(groups: BookGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBookGroups(groups)))
}
