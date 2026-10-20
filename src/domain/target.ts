import { addDays, isoWeekNumber, weekdayIndex, weekStart } from './date'
import { workedMinutes } from './dayTotal'
import { holidayMap, type Holiday } from './holidays'
import type { Day, ISODate, Minutes, Settings } from './types'

/** Höchstarbeitszeit pro Woche (Standard 45 h, Arbeitsgesetz CH für Büropersonal). */
export const DEFAULT_WEEKLY_MAX = 45 * 60

export type TargetSettings = Pick<
  Settings,
  'weekdayTargets' | 'holidayRegion' | 'holidayOverrides' | 'customHolidays' | 'balanceStart'
>

/** Merkt sich die Feiertage je Jahr, damit lange Zeiträume schnell gerechnet sind. */
export function holidayLookup(settings: Omit<TargetSettings, 'weekdayTargets' | 'balanceStart'>) {
  const years = new Map<number, Map<ISODate, Holiday>>()
  return (date: ISODate): Holiday | null => {
    const year = Number(date.slice(0, 4))
    let map = years.get(year)
    if (!map) years.set(year, (map = holidayMap(year, settings)))
    return map.get(date) ?? null
  }
}

/** Soll-Zeit eines Tages: Wochentags-Soll, an Feiertagen anteilig weniger (halber Feiertag = halbes Soll). */
export function targetMinutes(
  date: ISODate,
  settings: Pick<TargetSettings, 'weekdayTargets'>,
  holiday: Holiday | null,
): Minutes {
  const base = settings.weekdayTargets[weekdayIndex(date)] ?? 0
  return Math.round(base * (1 - (holiday?.share ?? 0)))
}

export interface BalanceResult {
  /** Überstunden-Saldo in Minuten (negativ = Minusstunden). */
  minutes: Minutes
  /** Vergangene Arbeitstage ohne erfasste Arbeitszeit (zählen mit 0 h). */
  missingDays: ISODate[]
}

/**
 * Saldo = Startsaldo + Summe (Ist − Soll) für jeden Tag vom Startdatum bis
 * einschließlich `until`. Für `today` zählt ein laufender Block bis `nowMinutes`.
 */
export function balanceUntil(
  days: Day[],
  settings: TargetSettings,
  until: ISODate,
  today: ISODate,
  nowMinutes: Minutes | null = null,
): BalanceResult {
  const start = settings.balanceStart
  let minutes = start.minutes
  const missingDays: ISODate[] = []
  if (until < start.date) return { minutes, missingDays }

  const byDate = new Map(days.map((d) => [d.date, d]))
  const holiday = holidayLookup(settings)
  for (let date = start.date; date <= until; date = addDays(date, 1)) {
    const target = targetMinutes(date, settings, holiday(date))
    const day = byDate.get(date)
    const worked = day ? workedMinutes(day, date === today ? nowMinutes : null) : null
    minutes += (worked ?? 0) - target
    if (worked === null && target > 0 && date < today) missingDays.push(date)
  }
  return { minutes, missingDays }
}

/** Summe der Wochentags-Soll-Zeiten (z.B. 41:30). */
export function weeklyTarget(settings: Pick<TargetSettings, 'weekdayTargets'>): Minutes {
  return settings.weekdayTargets.reduce((sum, m) => sum + (m || 0), 0)
}

export interface WeekSummary {
  from: ISODate
  to: ISODate
  weekNumber: number
  /** Gearbeitet in dieser Woche (alle erfassten Tage Mo–So). */
  worked: Minutes
  /** Soll der Woche (Feiertage abgezogen). */
  target: Minutes
  max: Minutes
  /** Noch bis zum Soll (negativ = Soll überschritten). */
  toTarget: Minutes
  /** Noch bis zur Höchstarbeitszeit (negativ = überschritten). */
  toMax: Minutes
}

/** Wochenübersicht (Mo–So) für die Woche, in der `date` liegt. */
export function weekSummary(
  days: Day[],
  date: ISODate,
  settings: TargetSettings & Pick<Settings, 'weeklyMaxMinutes'>,
  today: ISODate,
  nowMinutes: Minutes | null = null,
): WeekSummary {
  const from = weekStart(date)
  const to = addDays(from, 6)
  const holiday = holidayLookup(settings)
  let worked = 0
  let target = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    target += targetMinutes(d, settings, holiday(d))
    const day = days.find((x) => x.date === d)
    if (day) worked += workedMinutes(day, d === today ? nowMinutes : null) ?? 0
  }
  const max = settings.weeklyMaxMinutes ?? DEFAULT_WEEKLY_MAX
  return { from, to, weekNumber: isoWeekNumber(date), worked, target, max, toTarget: target - worked, toMax: max - worked }
}
