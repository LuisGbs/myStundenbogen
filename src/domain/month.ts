import type { AllocationStatus } from './allocation'
import { monthDates, weekdayShort, formatDateShort, type YearMonth } from './date'
import { summarizeDay } from './day'
import { formatDuration } from './duration'
import type { ActivityType, Day, ISODate, Minutes, Project } from './types'

export interface MonthRow {
  activityType: ActivityType
  perDay: Minutes[]
  total: Minutes
}

export interface MonthGroup {
  project: Project
  perDay: Minutes[]
  total: Minutes
  rows: MonthRow[]
}

export interface MonthDayInfo {
  date: ISODate
  worked: Minutes | null
  booked: Minutes
  open: Minutes
  status: AllocationStatus
  /** Enthält noch geplante (nicht gestempelte) Blöcke. */
  planned: boolean
}

export interface MonthGrid {
  yearMonth: YearMonth
  dates: ISODate[]
  days: MonthDayInfo[]
  groups: MonthGroup[]
  totals: { worked: Minutes; booked: Minutes; open: Minutes }
}

export interface MonthGridOptions {
  /** Aktive Projekte ohne Buchung in diesem Monat trotzdem anzeigen. */
  includeEmptyActive: boolean
  /** Für laufende Stempel-Blöcke: heutiges Datum + Minuten seit Mitternacht. */
  today?: ISODate
  nowMinutes?: Minutes | null
}

function placeholderProject(id: string): Project {
  return { id, name: 'Unbekanntes Projekt', code: '', color: '#888888', active: false, sortOrder: 1e9, createdAt: '' }
}

function placeholderActivity(id: string): ActivityType {
  return { id, name: 'Unbekannt', active: false, sortOrder: 1e9 }
}

export function buildMonthGrid(
  yearMonth: YearMonth,
  days: Day[],
  projects: Project[],
  activityTypes: ActivityType[],
  options: MonthGridOptions,
): MonthGrid {
  const dates = monthDates(yearMonth)
  const n = dates.length
  const dayByDate = new Map(days.map((d) => [d.date, d]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const activityById = new Map(activityTypes.map((a) => [a.id, a]))

  // projectId → activityTypeId → Minuten je Tag
  const cells = new Map<string, Map<string, Minutes[]>>()

  const dayInfos: MonthDayInfo[] = dates.map((date, dayIndex) => {
    const day = dayByDate.get(date)
    if (!day) return { date, worked: null, booked: 0, open: 0, status: 'empty', planned: false }
    const now = date === options.today ? (options.nowMinutes ?? null) : null
    const { worked, allocation } = summarizeDay(day, now)
    for (const a of day.allocations) {
      const minutes = allocation.minutes[a.id]
      if (!minutes) continue
      let byActivity = cells.get(a.projectId)
      if (!byActivity) cells.set(a.projectId, (byActivity = new Map()))
      let perDay = byActivity.get(a.activityTypeId)
      if (!perDay) byActivity.set(a.activityTypeId, (perDay = new Array<Minutes>(n).fill(0)))
      perDay[dayIndex] += minutes
    }
    return {
      date,
      worked,
      booked: allocation.allocated,
      open: allocation.open,
      status: allocation.status,
      planned: day.timeMode === 'blocks' && day.blocks.some((b) => b.planned),
    }
  })

  const projectIds = new Set(cells.keys())
  if (options.includeEmptyActive) {
    for (const p of projects) if (p.active) projectIds.add(p.id)
  }

  const groups: MonthGroup[] = [...projectIds]
    .map((id) => projectById.get(id) ?? placeholderProject(id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((project) => {
      const byActivity = cells.get(project.id) ?? new Map<string, Minutes[]>()
      const rows: MonthRow[] = [...byActivity.entries()]
        .map(([activityId, perDay]) => ({
          activityType: activityById.get(activityId) ?? placeholderActivity(activityId),
          perDay,
          total: perDay.reduce((s, v) => s + v, 0),
        }))
        .sort((a, b) => a.activityType.sortOrder - b.activityType.sortOrder)
      const perDay = dates.map((_, i) => rows.reduce((s, r) => s + r.perDay[i], 0))
      return { project, rows, perDay, total: perDay.reduce((s, v) => s + v, 0) }
    })

  const totals = dayInfos.reduce(
    (t, d) => ({ worked: t.worked + (d.worked ?? 0), booked: t.booked + d.booked, open: t.open + d.open }),
    { worked: 0, booked: 0, open: 0 },
  )

  return { yearMonth, dates, days: dayInfos, groups, totals }
}

/** Monatstabelle als Zeilen/Spalten für Excel-Export (Werte in h:mm). */
export function monthGridToTable(grid: MonthGrid): string[][] {
  const fmt = (m: Minutes) => (m === 0 ? '' : formatDuration(m))
  const header = [
    'Projekt',
    'Nr.',
    'Tätigkeit',
    ...grid.dates.map((d) => `${weekdayShort(d)} ${formatDateShort(d)}`),
    'Summe',
  ]
  const rows = grid.groups.flatMap((g) =>
    g.rows.map((r) => [g.project.name, g.project.code, r.activityType.name, ...r.perDay.map(fmt), fmt(r.total)]),
  )
  const blank = new Array<string>(header.length).fill('')
  return [
    header,
    ...rows,
    blank,
    ['Summe gebucht', '', '', ...grid.days.map((d) => fmt(d.booked)), fmt(grid.totals.booked)],
    ['Arbeitszeit', '', '', ...grid.days.map((d) => fmt(d.worked ?? 0)), fmt(grid.totals.worked)],
  ]
}

/** Tabelle als TSV (Zwischenablage → Excel) oder CSV (Trennzeichen ';' für Excel DE/CH). */
export function toDelimited(table: string[][], separator: '\t' | ';'): string {
  const escape = (value: string) =>
    /["\n\r\t;]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  return table.map((row) => row.map(escape).join(separator)).join('\r\n')
}
