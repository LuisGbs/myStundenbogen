import { useMemo } from 'react'
import {
  addMonths,
  dayOfMonth,
  isWeekend,
  monthDates,
  monthLabel,
  todayISO,
  weekdayShort,
  yearMonthOf,
  type YearMonth,
} from '../../domain/date'
import { formatDuration, formatSignedDuration } from '../../domain/duration'
import {
  buildMonthGrid,
  monthGridToTable,
  toDelimited,
  type MonthDayInfo,
  type MonthGroup,
} from '../../domain/month'
import type { Minutes } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { downloadFile, useLocalPreference, useNow } from '../../lib/browser'
import { href } from '../../lib/router'
import { useActivityTypes, useDaysInRange, useProjects } from '../../storage/hooks'
import './month.css'

const fmt = (m: Minutes) => (m === 0 ? '' : formatDuration(m))

export function MonthPage({ month }: { month: YearMonth }) {
  const dates = monthDates(month)
  const days = useDaysInRange(dates[0], dates[dates.length - 1])
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  const [includeEmpty, setIncludeEmpty] = useLocalPreference('month.includeEmpty', false)
  const [toast, showToast] = useToast()
  const now = useNow(60_000)
  const today = todayISO(now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const grid = useMemo(
    () =>
      days && projects && activityTypes
        ? buildMonthGrid(month, days, projects, activityTypes, { includeEmptyActive: includeEmpty, today, nowMinutes })
        : null,
    [month, days, projects, activityTypes, includeEmpty, today, nowMinutes],
  )

  if (!grid) return null

  const copyTable = async () => {
    try {
      await navigator.clipboard.writeText(toDelimited(monthGridToTable(grid), '\t'))
      showToast('Tabelle kopiert – in Excel einfügen mit Strg+V')
    } catch {
      showToast('Kopieren nicht möglich – bitte CSV herunterladen')
    }
  }
  const downloadCsv = () =>
    downloadFile(`stundenbogen-${month}.csv`, '﻿' + toDelimited(monthGridToTable(grid), ';'), 'text/csv;charset=utf-8')

  const isCurrentMonth = month === yearMonthOf(today)

  return (
    <div className="page month-page">
      <div className="month-head">
        <div className="month-head__nav">
          <a className="icon-btn" href={href.month(addMonths(month, -1))} aria-label="Vorheriger Monat">
            <Icon name="chevron-left" size={20} />
          </a>
          <h1>{monthLabel(month)}</h1>
          <a className="icon-btn" href={href.month(addMonths(month, 1))} aria-label="Nächster Monat">
            <Icon name="chevron-right" size={20} />
          </a>
          {!isCurrentMonth && (
            <a className="btn btn--ghost" href={href.month()}>
              Aktueller Monat
            </a>
          )}
        </div>
        <dl className="month-head__totals">
          <div>
            <dt>Gearbeitet</dt>
            <dd className="num">{formatDuration(grid.totals.worked)}</dd>
          </div>
          <div>
            <dt>Gebucht</dt>
            <dd className="num">{formatDuration(grid.totals.booked)}</dd>
          </div>
          <div className={grid.totals.open !== 0 ? 'is-warn' : undefined}>
            <dt>Offen</dt>
            <dd className="num">{formatSignedDuration(grid.totals.open)}</dd>
          </div>
        </dl>
        <div className="month-head__actions">
          <label className="checkbox">
            <input type="checkbox" checked={includeEmpty} onChange={(e) => setIncludeEmpty(e.target.checked)} />
            Leere Projekte zeigen
          </label>
          <button type="button" className="btn" onClick={copyTable}>
            <Icon name="copy" /> Tabelle kopieren
          </button>
          <button type="button" className="btn" onClick={downloadCsv}>
            <Icon name="download" /> CSV
          </button>
        </div>
      </div>

      {grid.groups.length === 0 ? (
        <div className="card empty-state">
          <p>Für {monthLabel(month)} gibt es noch keine gebuchten Stunden.</p>
          <a className="btn btn--primary" href={href.today()}>
            Heute eintragen
          </a>
        </div>
      ) : (
        <div className="grid-scroll">
          <table className="month-grid" data-testid="month-grid">
            <thead>
              <tr>
                <th className="sticky-col corner" scope="col">
                  Projekt / Tätigkeit
                </th>
                {grid.days.map((d) => (
                  <th key={d.date} scope="col" className={dayClass(d, today)}>
                    <a href={href.day(d.date)} title={dayTitle(d)}>
                      <span className="wd">{weekdayShort(d.date)}</span>
                      <span className="dn">{dayOfMonth(d.date)}</span>
                      {hasWarning(d) && <span className="warn-dot" aria-label="nicht vollständig verteilt" />}
                      {d.planned && <span className="plan-mark" aria-label="geplant">~</span>}
                    </a>
                  </th>
                ))}
                <th scope="col" className="sum-col">
                  Σ
                </th>
              </tr>
            </thead>
            <tbody>
              {grid.groups.map((g) => (
                <GroupRows key={g.project.id} group={g} days={grid.days} today={today} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th className="sticky-col" scope="row">
                  Gebucht
                </th>
                {grid.days.map((d) => (
                  <td key={d.date} className={dayClass(d, today)}>
                    {fmt(d.booked)}
                  </td>
                ))}
                <td className="sum-col">{fmt(grid.totals.booked)}</td>
              </tr>
              <tr>
                <th className="sticky-col" scope="row">
                  Gearbeitet
                </th>
                {grid.days.map((d) => (
                  <td
                    key={d.date}
                    className={`${dayClass(d, today)}${d.planned ? ' is-planned' : ''}`}
                    data-testid={`worked-${d.date}`}
                    title={d.planned ? 'Enthält geplante, noch nicht gestempelte Zeiten' : undefined}
                  >
                    {fmt(d.worked ?? 0)}
                  </td>
                ))}
                <td className="sum-col">{fmt(grid.totals.worked)}</td>
              </tr>
              <tr className="open-row">
                <th className="sticky-col" scope="row">
                  Offen
                </th>
                {grid.days.map((d) => (
                  <td key={d.date} className={`${dayClass(d, today)}${d.open !== 0 ? ' is-warn' : ''}`}>
                    {d.open === 0 ? '' : formatSignedDuration(d.open)}
                  </td>
                ))}
                <td className={`sum-col${grid.totals.open !== 0 ? ' is-warn' : ''}`}>
                  {grid.totals.open === 0 ? '' : formatSignedDuration(grid.totals.open)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {toast}
    </div>
  )
}

function GroupRows({ group, days, today }: { group: MonthGroup; days: MonthDayInfo[]; today: string }) {
  const { project } = group
  return (
    <>
      <tr className={`group-row${project.active ? '' : ' is-inactive'}`}>
        <th className="sticky-col" scope="rowgroup">
          <span className="dot" style={{ background: project.color }} />
          <span className="group-row__name">{project.name}</span>
          {project.code && <span className="group-row__code">{project.code}</span>}
        </th>
        {days.map((d, i) => (
          <td key={d.date} className={dayClass(d, today)}>
            {fmt(group.perDay[i])}
          </td>
        ))}
        <td className="sum-col">{fmt(group.total)}</td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.activityType.id} className="sub-row">
          <th className="sticky-col" scope="row">
            {r.activityType.name}
          </th>
          {days.map((d, i) => (
            <td key={d.date} className={dayClass(d, today)}>
              {r.perDay[i] > 0 ? <a href={href.day(d.date)}>{formatDuration(r.perDay[i])}</a> : ''}
            </td>
          ))}
          <td className="sum-col">{fmt(r.total)}</td>
        </tr>
      ))}
    </>
  )
}

function hasWarning(d: MonthDayInfo): boolean {
  return d.status === 'open' || d.status === 'over' || d.status === 'no-total'
}

function dayClass(d: MonthDayInfo, today: string): string {
  return ['day-col', isWeekend(d.date) && 'is-weekend', d.date === today && 'is-today'].filter(Boolean).join(' ')
}

function dayTitle(d: MonthDayInfo): string {
  switch (d.status) {
    case 'open':
      return `Noch ${formatDuration(d.open)} offen`
    case 'over':
      return `${formatDuration(-d.open)} zu viel gebucht`
    case 'no-total':
      return 'Arbeitszeit fehlt'
    default:
      return 'Tag öffnen'
  }
}
