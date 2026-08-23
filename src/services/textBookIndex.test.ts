import { describe, expect, it, vi } from 'vitest'
import { buildTextBookIndexAsync } from './textBookIndex'

describe('text book index service', () => {
  it('builds the same reusable index when workers are unavailable', async () => {
    vi.stubGlobal('Worker', undefined)
    const index = await buildTextBookIndexAsync('第一章 测试\n正文。')
    expect(index.version).toBe(1)
    expect(index.paragraphs).toEqual(['第一章 测试', '正文。'])
    expect(index.chapters).toEqual([{ title: '第一章 测试', paragraphIndex: 0 }])
    vi.unstubAllGlobals()
  })
})
