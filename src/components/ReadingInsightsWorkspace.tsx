import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarCheck2,
  Flame,
  Quote,
  RefreshCw,
  Target,
  TimerReset
} from 'lucide-react'
import type { ReaderBook, ReadingMark } from '../types'
import {
  buildCompletionPlans,
  getDailyReviewMark,
  loadDailyReadingGoal,
  saveDailyReadingGoal,
  summarizeReadingActivity
} from '../services/readingInsights'
import { formatReadingDuration, formatReadingEstimate, loadBookReadingStats } from '../services/readingStats'
import { BookCover } from './BookCover'

interface ReadingInsightsWorkspaceProps {
  books: ReaderBook[]
  marks: ReadingMark[]
  onOpenBook: (book: ReaderBook) => void
  onOpenMark: (mark: ReadingMark) => void
  now?: number
  dailyGoal?: number
  onDailyGoalChange?: (minutes: number) => void
}

function formatFinishDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp)
}

export function ReadingInsightsWorkspace({
  books,
  marks,
  onOpenBook,
  onOpenMark,
  now = Date.now(),
  dailyGoal: controlledDailyGoal,
  onDailyGoalChange
}: ReadingInsightsWorkspaceProps) {
  const [localDailyGoal, setLocalDailyGoal] = useState(loadDailyReadingGoal)
  const dailyGoal = controlledDailyGoal ?? localDailyGoal
  const [reviewOffset, setReviewOffset] = useState(0)
  const readingStats = useMemo(() => books.map((book) => loadBookReadingStats(book.id)), [books])
  const activity = useMemo(
    () => summarizeReadingActivity(readingStats, dailyGoal, now),
    [dailyGoal, now, readingStats]
  )
  const completionPlans = useMemo(
    () => buildCompletionPlans(books, readingStats, dailyGoal, now),
    [books, dailyGoal, now, readingStats]
  )
  const reviewMark = useMemo(
    () => getDailyReviewMark(marks, reviewOffset, now),
    [marks, now, reviewOffset]
  )
  const annotationCount = useMemo(
    () => marks.filter((mark) => mark.kind === 'annotation').length,
    [marks]
  )
  const reviewBook = books.find((book) => book.id === reviewMark?.bookId)
  const chartMaximum = Math.max(dailyGoal, ...activity.week.map((day) => day.minutes), 1)

  function updateGoal(value: number) {
    const savedGoal = saveDailyReadingGoal(value)
    setLocalDailyGoal(savedGoal)
    onDailyGoalChange?.(savedGoal)
  }

  return (
    <div className="reading-insights-workspace">
      <section className="page-heading insights-page-heading">
        <div>
          <p className="eyebrow">本地阅读数据</p>
          <h1>阅读洞察</h1>
          <p>看清最近的阅读节奏，并把正在读的书拆成可完成的计划。</p>
        </div>
        <div className="insights-local-note"><span />统计只保存在当前浏览器</div>
      </section>

      <section className="insights-overview" aria-label="阅读目标与节奏">
        <div className="insights-goal">
          <div className="insights-section-kicker"><Target size={16} /> 今日目标</div>
          <div className="insights-goal__value">
            <strong>{activity.todayMinutes}</strong>
            <span>/ {dailyGoal} 分钟</span>
          </div>
          <p>今日已读 {activity.todayMinutes} 分钟</p>
          <div
            className="insights-goal__track"
            role="progressbar"
            aria-label={`今日阅读 ${activity.todayMinutes}/${dailyGoal} 分钟`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={activity.goalProgress}
          >
            <span style={{ width: `${activity.goalProgress}%` }} />
          </div>
          <label className="insights-goal__control">
            <span>每日 {dailyGoal} 分钟</span>
            <input
              type="range"
              min="10"
              max="120"
              step="5"
              value={dailyGoal}
              aria-label="每日阅读目标"
              onChange={(event) => updateGoal(Number(event.target.value))}
            />
            <small>拖动后，完成日期会同步重算</small>
          </label>
        </div>

        <div className="insights-week" role="region" aria-label="七日阅读节奏">
          <header>
            <div>
              <span className="insights-section-kicker"><BarChart3 size={16} /> 七日阅读节奏</span>
              <strong>{activity.week.reduce((total, day) => total + day.minutes, 0)} 分钟</strong>
            </div>
            <small>虚线为每日目标</small>
          </header>
          <div className="insights-week__chart">
            <i className="insights-week__goal-line" style={{ bottom: `${Math.min(100, (dailyGoal / chartMaximum) * 100)}%` }} />
            {activity.week.map((day) => (
              <div className={day.isToday ? 'insights-day insights-day--today' : 'insights-day'} key={day.key}>
                <div className="insights-day__bar" title={`${day.label} · ${day.minutes} 分钟`}>
                  <span
                    className={day.goalMet ? 'insights-day__fill insights-day__fill--met' : 'insights-day__fill'}
                    style={{ height: `${day.minutes === 0 ? 2 : Math.max(8, (day.minutes / chartMaximum) * 100)}%` }}
                  />
                </div>
                <strong>{day.minutes}</strong>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>

        <dl className="insights-summary">
          <div><dt><Flame size={15} />连续达标</dt><dd>{activity.streakDays} 天</dd></div>
          <div><dt><TimerReset size={15} />累计阅读</dt><dd>{formatReadingDuration(activity.totalMinutes * 60_000)}</dd></div>
          <div><dt><CalendarCheck2 size={15} />活跃天数</dt><dd>{activity.activeDays} 天</dd></div>
          <div><dt><BookOpen size={15} />阅读会话</dt><dd>{activity.sessionCount} 次</dd></div>
        </dl>
      </section>

      <section className="completion-plans" role="region" aria-label="读完计划">
        <header className="section-heading">
          <div>
            <p className="eyebrow">{completionPlans.length} 本进行中</p>
            <h2>读完计划</h2>
          </div>
          <span>按当前节奏与每日目标估算</span>
        </header>
        {completionPlans.length > 0 ? (
          <div className="completion-plan-list">
            {completionPlans.map((plan) => (
              <button
                className="completion-plan-row"
                type="button"
                key={plan.book.id}
                aria-label={`继续阅读${plan.book.title}`}
                onClick={() => onOpenBook(plan.book)}
              >
                <BookCover book={plan.book} compact />
                <span className="completion-plan-row__book">
                  <small>{plan.book.author}</small>
                  <strong>{plan.book.title}</strong>
                  <span className="completion-plan-row__progress" aria-label={`阅读进度 ${plan.book.progress}%`}>
                    <i style={{ width: `${plan.book.progress}%` }} />
                  </span>
                </span>
                <span className="completion-plan-row__estimate">
                  <small>{plan.usesObservedPace ? '按个人节奏' : '按字数估算'}</small>
                  <strong>{formatReadingEstimate(plan.remainingMinutes)}</strong>
                </span>
                <span className="completion-plan-row__date">
                  <small>预计 {formatFinishDate(plan.estimatedFinishAt)}读完</small>
                  <strong>{plan.daysRemaining} 天 · 每天 {dailyGoal} 分钟</strong>
                </span>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="insights-empty"><BookOpen size={22} /><strong>还没有可估算的进行中书籍</strong><span>开始阅读后，这里会根据进度与字数生成计划。</span></div>
        )}
      </section>

      <section className="daily-review" role="region" aria-label="每日标注回顾">
        <header>
          <div>
            <span className="insights-section-kicker"><Quote size={16} /> 每日回顾</span>
            <h2>重新遇见一条标注</h2>
          </div>
          {annotationCount > 1 && (
            <button type="button" className="quiet-action" aria-label="换一条回顾" onClick={() => setReviewOffset((current) => current + 1)}>
              <RefreshCw size={15} />换一条
            </button>
          )}
        </header>
        {reviewMark ? (
          <div className="daily-review__content">
            <div className="daily-review__index">{String((reviewOffset % Math.max(1, annotationCount)) + 1).padStart(2, '0')}</div>
            <div>
              <blockquote>{reviewMark.excerpt}</blockquote>
              {reviewMark.note && <p>{reviewMark.note}</p>}
              <span>《{reviewBook?.title ?? '已移除书籍'}》 · {reviewMark.label}</span>
            </div>
            <button type="button" className="secondary-button" aria-label={`回到${reviewMark.label}`} onClick={() => onOpenMark(reviewMark)}>
              回到原文 <ArrowUpRight size={15} />
            </button>
          </div>
        ) : (
          <div className="insights-empty"><Quote size={22} /><strong>还没有可回顾的标注</strong><span>在阅读页选中文字并添加标注后，每天会在这里重新遇见一条。</span></div>
        )}
      </section>
    </div>
  )
}
