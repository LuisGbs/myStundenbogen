import { addDays, formatDateLong, isISODate, todayISO } from '../../domain/date'
import { emptyDay, summarizeDay } from '../../domain/day'
import { holidayOn, type Holiday } from '../../domain/holidays'
import { withPlannedBlocks } from '../../domain/plan'
import { balanceUntil, targetMinutes } from '../../domain/target'
import { layoutTimeline } from '../../domain/timeline'
import type { Day, ISODate } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { useNow } from '../../lib/browser'
import { href, navigate } from '../../lib/router'
import { useActivityTypes, useDay, useDaysInRange, useProjects, useSettings } from '../../storage/hooks'
import { updateDay } from '../../storage/repo'
import { AllocationSection } from './AllocationSection'
import { DayTimeline } from './DayTimeline'
import { TimeSection, type DayBalance } from './TimeSection'
import './day.css'

export function DayPage({ date }: { date: ISODate }) {
  const stored = useDay(date)
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  const settings = useSettings()

  const today = todayISO()
  const isToday = date === today
  const hasRunningBlock = !!stored?.blocks.some((b) => b.end === null)
  const now = useNow(isToday && hasRunningBlock ? 20_000 : null)
  // Für den Überstunden-Saldo: alle Tage vom Startdatum bis vor diesem Tag.
  const balanceFrom = settings && settings.balanceStart.date < date ? settings.balanceStart.date : date
  const balanceDays = useDaysInRange(balanceFrom, addDays(date, -1) < balanceFrom ? balanceFrom : addDays(date, -1))

  if (stored === undefined || !projects || !activityTypes || !settings || !balanceDays) return null

  // Noch nichts gestempelt → Vorlage „normaler Arbeitstag“ als geplant zeigen.
  const day = withPlannedBlocks(stored ?? emptyDay(date), settings)
  const nowMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : null
  const summary = summarizeDay(day, nowMinutes)
  const timelineBlocks = layoutTimeline(day, summary.allocation, nowMinutes)?.blocks ?? []
  const holiday = holidayOn(date, settings)
  const target = targetMinutes(date, settings, holiday)
  // Ein noch unberührter Tag (nur Vorlage angezeigt) zählt für den Saldo als „nicht erfasst“.
  const recorded = stored ? summary.worked : null
  const before = date <= today ? balanceUntil(balanceDays, settings, addDays(date, -1), today) : null
  const balance: DayBalance = {
    target,
    dayDiff: (recorded ?? 0) - target,
    recorded: recorded !== null,
    after: before && date >= settings.balanceStart.date ? before.minutes + (recorded ?? 0) - target : null,
    missingDays: before?.missingDays ?? [],
  }
  // Erste Änderung übernimmt den geplanten Tag mit (Projekte hängen dann an den Plan-Blöcken).
  const change = (fn: (day: Day) => Day) => void updateDay(date, (d) => fn(withPlannedBlocks(d, settings)))

  return (
    <div className="page page--narrow day-page">
      <DayNavigation date={date} isToday={isToday} holiday={holiday} />
      <TimeSection
        day={day}
        isToday={isToday}
        nowMinutes={nowMinutes}
        worked={summary.worked}
        balance={balance}
        onChange={change}
      />
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

function DayNavigation({ date, isToday, holiday }: { date: ISODate; isToday: boolean; holiday: Holiday | null }) {
  return (
    <div className="day-nav">
      <a className="icon-btn" href={href.day(addDays(date, -1))} aria-label="Vorheriger Tag" title="Vorheriger Tag">
        <Icon name="chevron-left" size={20} />
      </a>
      <h1 className="day-nav__date">{formatDateLong(date)}</h1>
      <a className="icon-btn" href={href.day(addDays(date, 1))} aria-label="Nächster Tag" title="Nächster Tag">
        <Icon name="chevron-right" size={20} />
      </a>
      {holiday && (
        <span className="badge badge--holiday" data-testid="holiday-badge" title={holiday.note}>
          Feiertag: {holiday.name}
          {holiday.share < 1 ? ' (½)' : ''}
        </span>
      )}
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
