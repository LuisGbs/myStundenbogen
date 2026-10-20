import { useMemo } from 'react'
import {
  addMonths,
  dayOfMonth,
  formatDateShort,
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
import { balanceUntil, holidayLookup, targetMinutes } from '../../domain/target'
import type { Minutes } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { downloadFile, useLocalPreference, useNow } from '../../lib/browser'
import { href } from '../../lib/router'
import { useActivityTypes, useDaysInRange, useProjects, useSettings } from '../../storage/hooks'
import './month.css'

const fmt = (m: Minutes) => (m === 0 ? '' : formatDuration(m))

export function MonthPage({ month }: { month: YearMonth }) {
  const dates = monthDates(month)
  const days = useDaysInRange(dates[0], dates[dates.length - 1])
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  const settings = useSettings()
  // Für den Saldo: alle Tage vom Startdatum der Überstunden bis Monatsende.
  const monthEnd = dates[dates.length - 1]
  const balanceFrom = settings && settings.balanceStart.date < dates[0] ? settings.balanceStart.date : dates[0]
  const balanceDays = useDaysInRange(balanceFrom, monthEnd)
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

  if (!grid || !settings || !balanceDays) return null

  // Soll je Tag (Feiertage berücksichtigt) und Monatssummen bis heute.
  const holiday = holidayLookup(settings)
  const holidays = grid.dates.map((d) => holiday(d))
  const targets = grid.dates.map((d, i) => targetMinutes(d, settings, holidays[i]))
  // Gezählt wird ab dem Stichtag der Überstunden bis heute (davor wurde noch nicht erfasst).
  const elapsed = grid.dates.map((d) => d <= today && d >= settings.balanceStart.date)
  const targetToDate = targets.reduce((sum, t, i) => sum + (elapsed[i] ? t : 0), 0)
  const workedToDate = grid.days.reduce((sum, d, i) => sum + (elapsed[i] ? (d.worked ?? 0) : 0), 0)
  const balanceDate = monthEnd < today ? monthEnd : today
  const balance = balanceUntil(balanceDays, settings, balanceDate, today, nowMinutes)
  const dayDiff = (i: number) =>
    elapsed[i] && (targets[i] > 0 || grid.days[i].worked !== null) ? (grid.days[i].worked ?? 0) - targets[i] : null
  const columnClass = (d: MonthDayInfo, i: number) => `${dayClass(d, today)}${holidays[i] ? ' is-holiday' : ''}`

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
          <div title="Soll-Zeit ab Stichtag bis heute (Feiertage abgezogen)">
            <dt>Soll</dt>
            <dd className="num" data-testid="month-target">{formatDuration(targetToDate)}</dd>
          </div>
          <div className={workedToDate - targetToDate < 0 ? 'is-minus' : 'is-plus'} title="Gearbeitet − Soll ab Stichtag bis heute">
            <dt>Differenz</dt>
            <dd className="num" data-testid="month-diff">{formatSignedDuration(workedToDate - targetToDate)}</dd>
          </div>
          <div
            className={balance.minutes < 0 ? 'is-minus' : 'is-plus'}
            title={`Überstunden-Saldo per ${formatDateShort(balanceDate)} (inkl. Startsaldo)`}
          >
            <dt>Saldo</dt>
            <dd className="num" data-testid="month-balance">{formatSignedDuration(balance.minutes)}</dd>
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

      {grid.groups.length === 0 && (
        <p className="month-empty muted">
          Für {monthLabel(month)} gibt es noch keine gebuchten Stunden. <a href={href.today()}>Heute eintragen</a>
        </p>
      )}
      <div className="grid-scroll">
        <table className="month-grid" data-testid="month-grid">
          <thead>
            <tr>
              <th className="sticky-col corner" scope="col">
                Projekt / Tätigkeit
              </th>
              {grid.days.map((d, i) => (
                <th key={d.date} scope="col" className={columnClass(d, i)}>
                  <a href={href.day(d.date)} title={[holidays[i]?.name, dayTitle(d)].filter(Boolean).join(' · ')}>
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
              <GroupRows key={g.project.id} group={g} days={grid.days} columnClass={columnClass} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky-col" scope="row">
                Gebucht
              </th>
              {grid.days.map((d, i) => (
                <td key={d.date} className={columnClass(d, i)}>
                  {fmt(d.booked)}
                </td>
              ))}
              <td className="sum-col">{fmt(grid.totals.booked)}</td>
            </tr>
            <tr>
              <th className="sticky-col" scope="row">
                Gearbeitet
              </th>
              {grid.days.map((d, i) => (
                <td
                  key={d.date}
                  className={`${columnClass(d, i)}${d.planned ? ' is-planned' : ''}`}
                  data-testid={`worked-${d.date}`}
                  title={d.planned ? 'Enthält geplante, noch nicht gestempelte Zeiten' : undefined}
                >
                  {fmt(d.worked ?? 0)}
                </td>
              ))}
              <td className="sum-col">{fmt(grid.totals.worked)}</td>
            </tr>
            <tr className="target-row">
              <th className="sticky-col" scope="row">
                Soll
              </th>
              {grid.days.map((d, i) => (
                <td key={d.date} className={columnClass(d, i)} data-testid={`target-${d.date}`}>
                  {fmt(targets[i])}
                </td>
              ))}
              <td className="sum-col">{fmt(targets.reduce((a, b) => a + b, 0))}</td>
            </tr>
            <tr className="diff-row">
              <th className="sticky-col" scope="row">
                Differenz
              </th>
              {grid.days.map((d, i) => {
                const diff = dayDiff(i)
                return (
                  <td
                    key={d.date}
                    className={`${columnClass(d, i)}${diff !== null && diff < 0 ? ' is-minus' : diff ? ' is-plus' : ''}`}
                    data-testid={`diff-${d.date}`}
                  >
                    {diff === null || diff === 0 ? '' : formatSignedDuration(diff)}
                  </td>
                )
              })}
              <td className={`sum-col${workedToDate - targetToDate < 0 ? ' is-minus' : ' is-plus'}`}>
                {formatSignedDuration(workedToDate - targetToDate)}
              </td>
            </tr>
            <tr className="open-row">
              <th className="sticky-col" scope="row">
                Offen
              </th>
              {grid.days.map((d, i) => (
                <td key={d.date} className={`${columnClass(d, i)}${d.open !== 0 ? ' is-warn' : ''}`}>
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
      {toast}
    </div>
  )
}

function GroupRows({
  group,
  days,
  columnClass,
}: {
  group: MonthGroup
  days: MonthDayInfo[]
  columnClass: (d: MonthDayInfo, i: number) => string
}) {
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
          <td key={d.date} className={columnClass(d, i)}>
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
            <td
              key={d.date}
              className={`${columnClass(d, i)}${r.notes[i].length ? ' has-note' : ''}`}
              title={r.notes[i].length ? r.notes[i].join('\n') : undefined}
            >
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
