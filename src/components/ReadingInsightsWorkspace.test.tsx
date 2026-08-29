import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sampleBooks } from '../data/sampleBooks'
import { getDailyReviewMark, loadDailyReadingGoal } from '../services/readingInsights'
import { recordReadingActivity } from '../services/readingStats'
import type { ReadingMark } from '../types'
import { ReadingInsightsWorkspace } from './ReadingInsightsWorkspace'

const NOW = new Date(2026, 7, 29, 12).getTime()
const annotations: ReadingMark[] = [
  {
    id: 'insight-a',
    bookId: sampleBooks[0].id,
    kind: 'annotation',
    location: { type: 'text', value: '3' },
    label: '第一章 清晨的书桌',
    excerpt: '阅读最动人的地方，常常不是获得答案。',
    note: '提醒自己慢下来',
    progress: 35,
    createdAt: 10
  },
  {
    id: 'insight-b',
    bookId: sampleBooks[1].id,
    kind: 'annotation',
    location: { type: 'epub', value: 'epub-cfi(/6/2)' },
    label: '第二章',
    excerpt: '另一条值得再次遇见的句子。',
    progress: 42,
    createdAt: 20
  }
]

beforeEach(() => {
  localStorage.clear()
  vi.setSystemTime(NOW)
  recordReadingActivity(sampleBooks[0].id, 20 * 60_000, NOW, true, 64)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('ReadingInsightsWorkspace', () => {
  it('turns local reading data into a goal, weekly rhythm and finish plan', () => {
    render(<ReadingInsightsWorkspace books={sampleBooks} marks={annotations} onOpenBook={vi.fn()} onOpenMark={vi.fn()} now={NOW} />)

    expect(screen.getByRole('heading', { name: '阅读洞察' })).toBeInTheDocument()
    expect(screen.getByText('今日已读 20 分钟')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: '每日阅读目标' })).toHaveValue('30')
    expect(screen.getByRole('region', { name: '七日阅读节奏' })).toBeInTheDocument()
    const plans = screen.getByRole('region', { name: '读完计划' })
    expect(within(plans).getByRole('button', { name: '继续阅读人间草木' })).toBeInTheDocument()
    expect(within(plans).getAllByText(/每天 30 分钟/)).not.toHaveLength(0)
  })

  it('updates the local goal and immediately recalculates the plan', () => {
    render(<ReadingInsightsWorkspace books={sampleBooks} marks={annotations} onOpenBook={vi.fn()} onOpenMark={vi.fn()} now={NOW} />)

    fireEvent.change(screen.getByRole('slider', { name: '每日阅读目标' }), { target: { value: '45' } })
    expect(loadDailyReadingGoal()).toBe(45)
    expect(screen.getByText('每日 45 分钟')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '读完计划' })).toHaveTextContent('每天 45 分钟')
  })

  it('resurfaces annotations, rotates the daily card and jumps back to the source', async () => {
    const user = userEvent.setup()
    const onOpenMark = vi.fn()
    render(<ReadingInsightsWorkspace books={sampleBooks} marks={annotations} onOpenBook={vi.fn()} onOpenMark={onOpenMark} now={NOW} />)
    const firstReview = getDailyReviewMark(annotations, 0, NOW)!
    const secondReview = getDailyReviewMark(annotations, 1, NOW)!

    expect(screen.getByText(firstReview.excerpt)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '换一条回顾' }))
    expect(screen.getByText(secondReview.excerpt)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `回到${secondReview.label}` }))
    expect(onOpenMark).toHaveBeenCalledWith(secondReview)
  })
})
