import { addDays, formatDateLong, isISODate, todayISO } from '../../domain/date'
import { emptyDay, summarizeDay } from '../../domain/day'
import { layoutTimeline } from '../../domain/timeline'
import type { Day, ISODate } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { useNow } from '../../lib/browser'
import { href, navigate } from '../../lib/router'
import { useActivityTypes, useDay, useProjects, useSettings } from '../../storage/hooks'
import { updateDay } from '../../storage/repo'
import { AllocationSection } from './AllocationSection'
import { DayTimeline } from './DayTimeline'
import { TimeSection } from './TimeSection'
import './day.css'

export function DayPage({ date }: { date: ISODate }) {
  const stored = useDay(date)
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  const settings = useSettings()

  const isToday = date === todayISO()
  const hasRunningBlock = !!stored?.blocks.some((b) => b.end === null)
  const now = useNow(isToday && hasRunningBlock ? 20_000 : null)

  if (stored === undefined || !projects || !activityTypes || !settings) return null

  const day = stored ?? emptyDay(date)
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : null
  const summary = summarizeDay(day, nowMinutes)
  const timelineBlocks = layoutTimeline(day, summary.allocation, nowMinutes)?.blocks ?? []
  const change = (fn: (day: Day) => Day) => void updateDay(date, fn)

  return (
    <div className="page page--narrow day-page">
      <DayNavigation date={date} isToday={isToday} />
      <TimeSection day={day} isToday={isToday} nowMinutes={nowMinutes} worked={summary.worked} onChange={change} />
      <DayTimeline
        day={day}
        result={summary.allocation}
        projects={projects}
        activityTypes={activityTypes}
        nowMinutes={nowMinutes}
        onChange={change}
      />
      <AllocationSection
        day={day}
        result={summary.allocation}
        projects={projects}
        activityTypes={activityTypes}
        settings={settings}
        timelineBlocks={timelineBlocks}
        onChange={change}
      />
    </div>
  )
}

function DayNavigation({ date, isToday }: { date: ISODate; isToday: boolean }) {
  return (
    <div className="day-nav">
      <a className="icon-btn" href={href.day(addDays(date, -1))} aria-label="Vorheriger Tag" title="Vorheriger Tag">
        <Icon name="chevron-left" size={20} />
      </a>
      <h1 className="day-nav__date">{formatDateLong(date)}</h1>
      <a className="icon-btn" href={href.day(addDays(date, 1))} aria-label="Nächster Tag" title="Nächster Tag">
        <Icon name="chevron-right" size={20} />
      </a>
      <div className="day-nav__spacer" />
      {!isToday && (
        <a className="btn btn--ghost" href={href.today()}>
          Heute
        </a>
      )}
      <input
        type="date"
        className="input day-nav__picker"
        aria-label="Datum wählen"
        value={date}
        onChange={(e) => isISODate(e.target.value) && navigate(href.day(e.target.value))}
      />
    </div>
  )
}
