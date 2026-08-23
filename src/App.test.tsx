import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('react-reader', () => ({
  ReactReader: () => <div data-testid="epub-reader">EPUB reader</div>
}))

afterEach(cleanup)

describe('Mojian Reader', () => {
  it('presents the local-first library and supported formats', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '我的书架' })).toBeInTheDocument()
    expect(screen.getByText('文件只保留在这台设备')).toBeInTheDocument()
    expect(screen.getByText('EPUB · TXT · MD')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /导入书籍/ })).toBeInTheDocument()
  })

  it('filters the library by search query', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('searchbox', { name: '搜索书名、作者或备注' }), '月亮')
    const shelf = screen.getByTestId('book-shelf')
    expect(within(shelf).getByRole('button', { name: '打开月亮与六便士' })).toBeInTheDocument()
    expect(within(shelf).queryByRole('button', { name: '打开人间草木' })).not.toBeInTheDocument()
  })

  it('opens a book and changes the reading appearance', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /继续阅读人间草木/ }))
    expect(await screen.findByRole('heading', { name: '人间草木' })).toBeInTheDocument()
    expect(screen.getByText('阅读设置')).toBeInTheDocument()

    const article = screen.getByRole('article')
    expect(article).toHaveStyle({ fontSize: '20px' })
    await user.click(screen.getByRole('button', { name: '增大字号' }))
    expect(article).toHaveStyle({ fontSize: '22px' })

    await user.click(screen.getByRole('button', { name: '返回书架' }))
    expect(screen.getByRole('heading', { name: '我的书架' })).toBeInTheDocument()
  })

  it('imports a supported local text file and rejects unsupported files', async () => {
    const { container } = render(<App />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const unsupported = new File(['pdf'], 'manual.pdf', { type: 'application/pdf' })

    fireEvent.change(input, { target: { files: [unsupported] } })
    expect(screen.getByRole('status')).toHaveTextContent('未找到可导入文件')

    const localText = new File(['第一章\n本地文字'], '我的样书.txt', { type: 'text/plain' })
    Object.defineProperty(localText, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new TextEncoder().encode('第一章\n本地文字').buffer)
    })
    fireEvent.change(input, { target: { files: [localText] } })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('已导入 1 本书'))
    expect(screen.getByRole('button', { name: '打开我的样书' })).toBeInTheDocument()
  })

  it('persists a bookmark and reopens the book from the marks workspace', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /继续阅读人间草木/ }))
    await user.click(screen.getByRole('button', { name: '添加书签' }))
    await user.click(screen.getByRole('button', { name: '返回书架' }))
    await user.click(screen.getByRole('button', { name: /书签与标注/ }))

    expect(screen.getByRole('heading', { name: '书签与标注' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /跳转到/ }))
    expect(await screen.findByRole('heading', { name: '人间草木' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除书签' })).toBeInTheDocument()
  })
})
