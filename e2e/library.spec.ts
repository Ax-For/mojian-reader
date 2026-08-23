import { expect, test } from '@playwright/test'

test('reader flow from library to text appearance settings', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()
  await expect(page.getByRole('heading', { name: '人间草木' })).toBeVisible()
  await expect(page.getByText('阅读设置', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '夜间' }).click()
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-theme', 'night')
  await page.getByRole('button', { name: '返回书架' }).click()
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
})

test('bookmark survives the library round trip and jumps back into the reader', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()
  await page.getByRole('button', { name: '添加书签' }).click()
  await expect(page.getByRole('button', { name: '移除书签' })).toBeVisible()

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('button', { name: /书签与标注 1/ }).click()
  await expect(page.getByRole('heading', { name: '书签与标注' })).toBeVisible()

  await page.getByRole('button', { name: /跳转到/ }).click()
  await expect(page.getByRole('heading', { name: '人间草木' })).toBeVisible()
  await expect(page.getByRole('button', { name: '移除书签' })).toBeVisible()
  await expect(page.getByRole('button', { name: /阅读记录 1/ })).toBeVisible()
})

test('chapter navigation follows the reading position and remembers chapter activity', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()

  const toc = page.getByRole('navigation', { name: '书籍目录' })
  const firstChapter = toc.getByRole('button', { name: /第一章 清晨的书桌/ })
  const secondChapter = toc.getByRole('button', { name: /第二章 一段安静的时间/ })
  const activeChapter = toc.locator('[aria-current="location"]')
  await expect(activeChapter).toBeVisible()
  await expect(activeChapter).toContainText(/已读 \d+%|阅读中/)
  await expect(activeChapter.locator('.toc-item__copy > strong')).toHaveCSS('font-size', '12px')
  await expect(firstChapter).toContainText('未开始')
  await expect(secondChapter).toContainText('已读 50%')

  const thirdChapter = toc.getByRole('button', { name: /第三章 把书带回本地/ })
  await thirdChapter.click()
  await expect(thirdChapter).toHaveAttribute('aria-current', 'location')
  await expect(thirdChapter).toContainText('刚刚')
  await expect(firstChapter).toContainText('未开始')
  await expect(secondChapter).toContainText('已读 50%')

  await firstChapter.click()
  await expect(firstChapter).toHaveAttribute('aria-current', 'location')
  await expect(secondChapter).toContainText('已读 50%')
  await expect(thirdChapter).toContainText('已开始 · 0%')

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('button', { name: '打开人间草木' }).click()
  const restoredToc = page.getByRole('navigation', { name: '书籍目录' })
  await expect(restoredToc.getByRole('button', { name: /第一章 清晨的书桌/ })).toHaveAttribute('aria-current', 'location')
  await expect(restoredToc.getByRole('button', { name: /第二章 一段安静的时间/ })).toContainText('已读 50%')
  await expect(restoredToc.getByRole('button', { name: /第三章 把书带回本地/ })).toContainText('已开始 · 0%')
})

test('table of contents width can be dragged, adjusted by keyboard and restored after reopening', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()

  const toc = page.locator('.reader-toc')
  const resizer = page.getByRole('separator', { name: '调整目录宽度' })
  const initialWidth = (await toc.boundingBox())!.width
  const handle = (await resizer.boundingBox())!

  await page.mouse.move(handle.x + handle.width / 2, handle.y + 160)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 92, handle.y + 160, { steps: 6 })
  await page.mouse.up()

  await expect.poll(async () => (await toc.boundingBox())!.width).toBeGreaterThan(initialWidth + 80)
  const draggedWidth = Number(await resizer.getAttribute('aria-valuenow'))
  await resizer.focus()
  await resizer.press('ArrowRight')
  await expect(resizer).toHaveAttribute('aria-valuenow', String(draggedWidth + 16))

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('button', { name: '打开人间草木' }).click()
  await expect(page.getByRole('separator', { name: '调整目录宽度' })).toHaveAttribute('aria-valuenow', String(draggedWidth + 16))
})

test('reader keeps explicit navigation history and offers a movable reading ruler', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()

  const toc = page.getByRole('navigation', { name: '书籍目录' })
  const firstChapter = toc.getByRole('button', { name: /第一章 清晨的书桌/ })
  const thirdChapter = toc.getByRole('button', { name: /第三章 把书带回本地/ })
  await thirdChapter.click()
  await firstChapter.click()
  await page.getByRole('button', { name: '返回上一阅读位置' }).click()
  await expect(thirdChapter).toHaveAttribute('aria-current', 'location')
  await page.getByRole('button', { name: '前往下一阅读位置' }).click()
  await expect(firstChapter).toHaveAttribute('aria-current', 'location')

  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '开启阅读标尺' }).click()
  const ruler = page.getByTestId('reading-ruler')
  await expect(ruler).toBeVisible()
  const canvas = page.locator('.reading-canvas')
  const canvasBounds = (await canvas.boundingBox())!
  await page.mouse.move(canvasBounds.x + canvasBounds.width / 2, canvasBounds.y + canvasBounds.height * 0.68)
  const expectedRulerTop = canvasBounds.height * 0.68
  await expect.poll(() => page.getByTestId('reading-ruler-band').evaluate((element) => Number.parseFloat(getComputedStyle(element).top)))
    .toBeGreaterThan(expectedRulerTop - 2)
  await expect.poll(() => page.getByTestId('reading-ruler-band').evaluate((element) => Number.parseFloat(getComputedStyle(element).top)))
    .toBeLessThan(expectedRulerTop + 2)
  await page.keyboard.press('r')
  await expect(ruler).toBeHidden()
})

test('reader toolbar, search, layout, progress and settings controls are interactive', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()

  const tocSearch = page.getByRole('searchbox', { name: '搜索目录' })
  await tocSearch.fill('第一章')
  await expect(page.getByText('1 / 4 节')).toBeVisible()
  await expect(page.getByRole('button', { name: /第一章 清晨的书桌/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /第二章 一段安静的时间/ })).toBeHidden()
  await page.getByRole('button', { name: '清空目录搜索' }).click()

  await page.getByRole('button', { name: '书内搜索' }).click()
  await page.getByRole('searchbox', { name: '搜索关键词' }).fill('阅读界面')
  const searchPanel = page.getByRole('dialog', { name: '书内搜索面板' })
  await expect(searchPanel.getByText(/好的阅读界面不应该抢走注意力/)).toBeVisible()
  const firstSearchResult = searchPanel.getByRole('button', { name: /跳转到搜索结果/ }).first()
  await firstSearchResult.click()
  await expect(searchPanel).toBeVisible()
  await expect(firstSearchResult).toHaveAttribute('aria-current', 'location')
  await searchPanel.getByRole('button', { name: '关闭书内搜索' }).click()

  const progress = page.getByRole('slider', { name: '阅读进度' })
  await progress.fill('48')
  await expect.poll(async () => Number(await progress.inputValue())).toBeGreaterThan(35)
  await expect.poll(async () => Number(await progress.inputValue())).toBeLessThan(60)
  await page.getByRole('button', { name: '下一页' }).click()

  await page.getByRole('button', { name: '打开阅读设置' }).click()
  await page.getByRole('combobox', { name: '阅读字体' }).selectOption('sans')
  await expect(page.getByRole('article')).toHaveAttribute('data-font', 'sans')
  await page.getByRole('button', { name: '双页' }).click()
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-layout', 'double')

  await page.getByRole('button', { name: '收起阅读设置' }).click()
  await expect(page.getByText('护眼提示')).toBeHidden()
  await page.getByRole('button', { name: '打开阅读设置' }).click()
  await expect(page.getByText('护眼提示')).toBeVisible()

  await page.getByRole('button', { name: '更多操作' }).click()
  await expect(page.getByRole('menuitem', { name: '导出阅读记录' })).toBeVisible()
  await page.getByRole('menuitem', { name: '回到书首' }).click()
  await expect(progress).toHaveValue('0')
})

test('automatic reading scrolls continuously and exposes focus, speed and playback controls', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()
  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '回到书首' }).click()
  await expect.poll(() => page.locator('.reading-canvas').evaluate((element) => element.scrollTop)).toBeLessThan(4)
  await page.getByRole('button', { name: '双页' }).click()

  await page.getByRole('button', { name: '开始自动滚动' }).click()
  const controls = page.getByRole('region', { name: '自动滚动控制' })
  await expect(controls).toBeVisible()
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-layout', 'continuous')
  await expect(page.locator('.reading-canvas')).toHaveCSS('scroll-behavior', 'auto')
  await expect(controls.getByText('正在阅读')).toBeVisible()
  await expect(page.getByRole('article').locator('[aria-current="true"]')).toBeVisible()

  const speedSlider = controls.getByRole('slider', { name: '自动滚动速度' })
  await expect(speedSlider).toHaveAttribute('max', '8')
  await speedSlider.fill('8')
  await expect(controls.getByText('8×', { exact: true })).toBeVisible()
  const beforeScroll = await page.locator('.reading-canvas').evaluate((element) => element.scrollTop)
  await page.waitForTimeout(650)
  const afterScroll = await page.locator('.reading-canvas').evaluate((element) => element.scrollTop)
  expect(afterScroll).toBeGreaterThan(beforeScroll + 8)

  const highlightedBeforePause = await page.getByRole('article').locator('[aria-current="true"]')
    .getAttribute('data-sentence-key')
  await controls.getByRole('button', { name: '暂停自动滚动' }).click()
  await expect(controls.getByText('已暂停')).toBeVisible()
  await page.waitForTimeout(120)
  await expect(page.getByRole('article').locator('[aria-current="true"]'))
    .toHaveAttribute('data-sentence-key', highlightedBeforePause ?? '')
  await expect(controls.getByRole('button', { name: '恢复自动滚动' })).toBeVisible()
  await controls.getByRole('button', { name: '恢复自动滚动' }).click()
  await expect(controls.getByText('正在阅读')).toBeVisible()

  await controls.getByRole('button', { name: '关闭自动滚动' }).click()
  await expect(controls).toBeHidden()
  await expect(page.getByRole('article').locator('[aria-current="true"]')).toHaveCount(0)
})

test('speech voices can be previewed and remembered independently for each book', async ({ page }) => {
  await page.addInitScript(() => {
    const voices = [
      { default: true, lang: 'zh-CN', localService: true, name: '晓晓', voiceURI: 'voice-xiaoxiao' },
      { default: false, lang: 'zh-CN', localService: false, name: '云希', voiceURI: 'voice-yunxi' }
    ]
    class BrowserTestUtterance {
      lang = ''
      rate = 1
      voice: (typeof voices)[number] | null = null
      onboundary: ((event: { charIndex: number }) => void) | null = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(public text: string) {}
    }
    const testWindow = window as Window & { __lastSpeechVoiceURI?: string }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: BrowserTestUtterance })
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (utterance: BrowserTestUtterance) => { testWindow.__lastSpeechVoiceURI = utterance.voice?.voiceURI },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined
      }
    })
  })

  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()
  const voiceSelect = page.getByRole('combobox', { name: '本书朗读声音' })
  await expect(voiceSelect).toBeVisible()
  await expect(voiceSelect.getByRole('option', { name: /云希/ })).toBeAttached()
  await voiceSelect.selectOption('voice-yunxi')
  await page.getByRole('button', { name: '试听当前声音' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __lastSpeechVoiceURI?: string }).__lastSpeechVoiceURI)).toBe('voice-yunxi')

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('button', { name: '打开长夜行' }).click()
  await expect(page.getByRole('combobox', { name: '本书朗读声音' })).toHaveValue('')

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('button', { name: '打开人间草木' }).click()
  await expect(page.getByRole('combobox', { name: '本书朗读声音' })).toHaveValue('voice-yunxi')
})

test('reading profiles, selection tools and local statistics work together', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /继续阅读人间草木/ }).click()

  await page.getByRole('combobox', { name: '阅读方案' }).selectOption('longform')
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-theme', 'sepia')
  await expect(page.getByRole('article')).toHaveCSS('font-size', '22px')
  await page.getByRole('textbox', { name: '新方案名称' }).fill('长篇测试方案')
  await page.getByRole('button', { name: '保存当前方案' }).click()
  await expect(page.getByRole('option', { name: '长篇测试方案' })).toBeAttached()

  const paragraph = page.getByRole('article').locator('[data-paragraph-index]').filter({ hasText: '阅读' }).first()
  await paragraph.scrollIntoViewIfNeeded()
  const selectionBounds = await paragraph.evaluate((element) => {
    const sentence = element.querySelector('[data-sentence-key]')
    const textNode = sentence?.firstChild
    if (!sentence || !textNode) throw new Error('没有可选择的正文')
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, Math.min(6, textNode.textContent?.length ?? 0))
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const bounds = range.getBoundingClientRect()
    sentence.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return { top: bounds.top, bottom: bounds.bottom, centerX: bounds.left + bounds.width / 2 }
  })
  const tools = page.getByRole('toolbar', { name: '选中文本工具' })
  await expect(tools).toBeVisible()
  const toolsBounds = await tools.boundingBox()
  expect(toolsBounds).not.toBeNull()
  const viewportWidth = page.viewportSize()!.width
  const expectedCenterX = Math.min(
    viewportWidth - toolsBounds!.width / 2 - 12,
    Math.max(toolsBounds!.width / 2 + 12, selectionBounds.centerX)
  )
  expect(Math.abs((toolsBounds!.x + toolsBounds!.width / 2) - expectedCenterX)).toBeLessThan(8)
  const verticalGap = Math.min(
    Math.abs(toolsBounds!.y + toolsBounds!.height - selectionBounds.top),
    Math.abs(toolsBounds!.y - selectionBounds.bottom)
  )
  expect(verticalGap).toBeLessThan(20)
  await expect(tools.getByRole('button', { name: '查询选中文本' })).toBeVisible()
  await expect(tools.getByRole('button', { name: '翻译选中文本' })).toBeVisible()
  await tools.getByRole('button', { name: '标注选中文本' }).click()
  await page.getByRole('textbox', { name: '标注内容' }).fill('端到端快捷标注')
  await page.getByRole('button', { name: '保存标注' }).click()
  await expect(page.getByRole('button', { name: /编辑标注/ })).toBeVisible()

  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '阅读统计' }).click()
  const stats = page.getByRole('dialog', { name: '阅读统计' })
  await expect(stats).toBeVisible()
  await expect(stats.getByText('数据仅保存在当前浏览器')).toBeVisible()
  await expect(stats.getByText('预计读完')).toBeVisible()
})

test('local book metadata, cover and reading background persist as one book profile', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]:not([data-backup-input])').setInputFiles({
    name: '待整理样书.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章 归档\n这是一段用于验证书籍资料的正文。')
  })
  await expect(page.getByRole('status')).toContainText('已导入 1 本书')
  await expect(page.getByRole('button', { name: '打开待整理样书' })).toContainText(/1 章 · \d+ 字/)

  await page.getByRole('button', { name: '管理待整理样书' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑书籍资料' })
  await dialog.getByRole('textbox', { name: '书名' }).fill('山窗随笔')
  await dialog.getByRole('textbox', { name: '作者' }).fill('林间客')
  await dialog.getByRole('textbox', { name: '书籍备注' }).fill('秋季重读清单')
  await dialog.getByRole('button', { name: '松林阅读背景' }).click()
  await dialog.locator('input[data-cover-input]').setInputFiles({
    name: 'cover.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  })
  await expect(dialog.getByRole('img', { name: '山窗随笔封面预览' })).toBeVisible()
  await dialog.getByRole('button', { name: '保存书籍信息' }).click()

  await expect(page.getByRole('button', { name: '打开山窗随笔' })).toBeVisible()
  await page.reload()
  await page.getByRole('searchbox', { name: '搜索书名、作者或备注' }).fill('秋季重读')
  await expect(page.getByRole('button', { name: '打开山窗随笔' })).toBeVisible()
  await page.getByRole('button', { name: '打开山窗随笔' }).click()
  await expect(page.getByRole('heading', { name: '山窗随笔' })).toBeVisible()
  await expect(page.locator('.reader-book-meta')).toContainText(/1 章 · \d+ 字/)
  await expect(page.locator('.reader-shell')).toHaveAttribute('data-book-background', 'sage')

  await page.getByRole('button', { name: '更多操作' }).click()
  await page.getByRole('menuitem', { name: '编辑书籍信息' }).click()
  const readerDialog = page.getByRole('dialog', { name: '编辑书籍资料' })
  await readerDialog.getByRole('textbox', { name: '书名' }).fill('山窗随笔·二读')
  await readerDialog.getByRole('textbox', { name: '书籍备注' }).fill('已在阅读详情页更新')
  await readerDialog.getByRole('button', { name: '保存书籍信息' }).click()
  await expect(page.getByRole('heading', { name: '山窗随笔·二读' })).toBeVisible()

  await page.getByRole('button', { name: '返回书架' }).click()
  await page.getByRole('searchbox', { name: '搜索书名、作者或备注' }).fill('已在阅读详情页更新')
  await expect(page.getByRole('button', { name: '打开山窗随笔·二读' })).toBeVisible()
})

test('custom shelf groups organize books, persist locally and delete without deleting books', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]:not([data-backup-input])').setInputFiles({
    name: '分组测试书.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('第一章 整理\n这本书用于验证自建分组。')
  })
  await expect(page.getByRole('status')).toContainText('已导入 1 本书')

  await page.getByRole('button', { name: '管理自建分组' }).click()
  const manager = page.getByRole('dialog', { name: '管理自建分组' })
  await manager.getByRole('textbox', { name: '新分组名称' }).fill('待读清单')
  await manager.getByRole('button', { name: '创建分组' }).click()
  await expect(manager.getByText('待读清单', { exact: true })).toBeVisible()
  await manager.getByRole('button', { name: '关闭分组管理' }).click()

  await page.getByRole('button', { name: '管理分组测试书' }).click()
  const bookDialog = page.getByRole('dialog', { name: '编辑书籍资料' })
  await bookDialog.getByRole('button', { name: '待读清单分组' }).click()
  await expect(bookDialog.getByRole('button', { name: '待读清单分组' })).toHaveAttribute('aria-pressed', 'true')
  await bookDialog.getByRole('button', { name: '保存书籍信息' }).click()

  await page.getByRole('button', { name: '待读清单 1 本' }).click()
  await expect(page.getByRole('heading', { name: '待读清单' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开分组测试书' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开人间草木' })).toHaveCount(0)

  await page.reload()
  await page.getByRole('button', { name: '待读清单 1 本' }).click()
  await expect(page.getByRole('button', { name: '打开分组测试书' })).toBeVisible()

  await page.getByRole('button', { name: '管理自建分组' }).click()
  await manager.getByRole('button', { name: '重命名待读清单' }).click()
  await manager.getByRole('textbox', { name: '重命名分组' }).fill('今年阅读')
  await manager.getByRole('button', { name: '保存重命名' }).click()
  await expect(manager.getByText('今年阅读', { exact: true })).toBeVisible()
  await manager.getByRole('button', { name: '删除今年阅读' }).click()
  await manager.getByRole('button', { name: '确认删除今年阅读' }).click()
  await expect(manager.getByText('今年阅读', { exact: true })).toHaveCount(0)
  await manager.getByRole('button', { name: '关闭分组管理' }).click()

  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开分组测试书' })).toBeVisible()
})

test('a very large local TXT opens in a bounded reading window without crashing', async ({ page }) => {
  const novel = Array.from({ length: 1_800 }, (_, index) => (
    `第${index + 1}章 山水之间 ${index + 1}\n这是第 ${index + 1} 章的正文段落，用于验证长篇小说。`
  )).join('\n')
  await page.goto('/')
  await page.locator('input[type="file"]:not([data-backup-input])').setInputFiles({
    name: '剑来性能测试.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(novel)
  })

  await expect(page.getByRole('status')).toContainText('已导入 1 本书')
  const persistedIndex = await page.evaluate(() => new Promise<{ version?: number; paragraphCount: number }>((resolve, reject) => {
    const request = indexedDB.open('mojian-library', 3)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const payloadRequest = database.transaction('book-payloads', 'readonly').objectStore('book-payloads').getAll()
      payloadRequest.onerror = () => reject(payloadRequest.error)
      payloadRequest.onsuccess = () => {
        const indexedPayload = payloadRequest.result.find((payload) => payload.textIndex)
        resolve({
          version: indexedPayload?.textIndex?.version,
          paragraphCount: indexedPayload?.textIndex?.paragraphs?.length ?? 0
        })
        database.close()
      }
    }
  }))
  expect(persistedIndex).toEqual({ version: 1, paragraphCount: 3_600 })
  await page.getByRole('button', { name: '打开剑来性能测试' }).click()
  await expect(page.getByRole('heading', { name: '剑来性能测试' })).toBeVisible()
  await expect(page.getByText('长篇优化')).toBeVisible()
  expect(await page.locator('[data-paragraph-index]').count()).toBeLessThanOrEqual(180)
  await expect(page.locator('.text-page p').first()).toHaveCSS('text-indent', '40px')

  const canvas = page.locator('.reading-canvas')
  await canvas.evaluate((element) => {
    element.style.scrollBehavior = 'auto'
    element.scrollTop = 1500
    element.style.removeProperty('scroll-behavior')
  })
  await page.waitForTimeout(80)
  const viewportAnchor = await canvas.evaluate((element) => {
    const canvasBounds = element.getBoundingClientRect()
    const focusLine = canvasBounds.top + element.clientHeight * 0.36
    const candidates = Array.from(element.querySelectorAll<HTMLElement>('[data-sentence-key]'))
    const target = candidates.reduce((nearest, candidate) => (
      Math.abs(candidate.getBoundingClientRect().top - focusLine) < Math.abs(nearest.getBoundingClientRect().top - focusLine)
        ? candidate
        : nearest
    ))
    return { key: target.dataset.sentenceKey!, offset: target.getBoundingClientRect().top - focusLine }
  })
  await page.getByRole('button', { name: '增大字号' }).click()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const restoredOffset = await canvas.evaluate((element, key) => {
    const canvasBounds = element.getBoundingClientRect()
    const focusLine = canvasBounds.top + element.clientHeight * 0.36
    const target = element.querySelector<HTMLElement>(`[data-sentence-key="${key}"]`)
    if (!target) throw new Error('字号变化后阅读锚点丢失')
    return target.getBoundingClientRect().top - focusLine
  }, viewportAnchor.key)
  expect(Math.abs(restoredOffset - viewportAnchor.offset)).toBeLessThan(4)
  await page.waitForTimeout(320)
  const settledOffset = await canvas.evaluate((element, key) => {
    const canvasBounds = element.getBoundingClientRect()
    const focusLine = canvasBounds.top + element.clientHeight * 0.36
    const target = element.querySelector<HTMLElement>(`[data-sentence-key="${key}"]`)
    if (!target) throw new Error('字号动画结束后阅读锚点丢失')
    return target.getBoundingClientRect().top - focusLine
  }, viewportAnchor.key)
  expect(Math.abs(settledOffset - viewportAnchor.offset)).toBeLessThan(4)

  await page.getByRole('searchbox', { name: '搜索目录' }).fill('第1799章')
  await expect(page.getByText('1 / 1800 节')).toBeVisible()
  await page.getByRole('button', { name: /第1799章 山水之间/ }).click()
  await expect(page.getByRole('heading', { name: '第1799章 山水之间 1799' })).toBeVisible()
  expect(await page.locator('[data-paragraph-index]').count()).toBeLessThanOrEqual(180)

  await page.getByRole('button', { name: '返回书架' }).click()
  const reopenStartedAt = Date.now()
  await page.getByRole('button', { name: '打开剑来性能测试' }).click()
  await expect(page.getByRole('heading', { name: '剑来性能测试' })).toBeVisible()
  expect(Date.now() - reopenStartedAt).toBeLessThan(1_500)
})
