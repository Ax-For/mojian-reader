import { describe, expect, it } from 'vitest'
import { parseMarkdownBlocks } from './markdown'

describe('parseMarkdownBlocks', () => {
  it('creates safe semantic blocks for common Markdown constructs', () => {
    const blocks = parseMarkdownBlocks(`# 标题

普通 **正文** 与 [链接](https://example.com)。

> 引用内容

- 第一项
- 第二项

\`\`\`ts
const value = '<script>'
\`\`\`

---`)

    expect(blocks).toEqual([
      expect.objectContaining({ kind: 'heading', level: 1, text: '标题' }),
      expect.objectContaining({ kind: 'paragraph', text: '普通 正文 与 链接。' }),
      expect.objectContaining({ kind: 'blockquote', text: '引用内容' }),
      expect.objectContaining({ kind: 'list-item', ordered: false, text: '第一项' }),
      expect.objectContaining({ kind: 'list-item', ordered: false, text: '第二项' }),
      expect.objectContaining({ kind: 'code', language: 'ts', text: "const value = '<script>'" }),
      expect.objectContaining({ kind: 'separator', text: '---' })
    ])
  })

  it('joins wrapped prose while preserving blank-line paragraph boundaries', () => {
    expect(parseMarkdownBlocks('第一行\n继续第一段\n\n第二段')).toEqual([
      expect.objectContaining({ kind: 'paragraph', text: '第一行 继续第一段' }),
      expect.objectContaining({ kind: 'paragraph', text: '第二段' })
    ])
  })
})
