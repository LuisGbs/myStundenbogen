import { addDays, isoWeekNumber, weekdayIndex, weekStart } from './date'
import { emptyDay } from './day'
import { stampedMinutes, workedMinutes } from './dayTotal'
import { holidayMap, type Holiday } from './holidays'
import { withPlannedBlocks } from './plan'
import type { Day, ISODate, Minutes, Settings } from './types'

/** Höchstarbeitszeit pro Woche (Standard 45 h, Arbeitsgesetz CH für Büropersonal). */
export const DEFAULT_WEEKLY_MAX = 45 * 60

export type TargetSettings = Pick<
  Settings,
  'weekdayTargets' | 'holidayRegion' | 'holidayOverrides' | 'customHolidays'
>

/** Merkt sich die Feiertage je Jahr, damit lange Zeiträume schnell gerechnet sind. */
export function holidayLookup(settings: Omit<TargetSettings, 'weekdayTargets'>) {
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
  /** Geplante Blöcke mitzählen (nur für die Vorhersage „voraussichtlich“) */
  includePlanned = false,
): WeekSummary {
  const from = weekStart(date)
  const to = addDays(from, 6)
  const holiday = holidayLookup(settings)
  let worked = 0
  let target = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    target += targetMinutes(d, settings, holiday(d))
    const day = days.find((x) => x.date === d)
    if (day) {
      const now = d === today ? nowMinutes : null
      worked += (includePlanned ? workedMinutes(day, now) : stampedMinutes(day, now)) ?? 0
    }
  }
  const max = settings.weeklyMaxMinutes ?? DEFAULT_WEEKLY_MAX
  return { from, to, weekNumber: isoWeekNumber(date), worked, target, max, toTarget: target - worked, toMax: max - worked }
}

/** Ein Tag im Wochenbalken: gestempelt (blau) und noch geplant (hellgrau). */
export interface WeekDayBar {
  date: ISODate
  stamped: Minutes
  planned: Minutes
  isToday: boolean
  isFuture: boolean
}

/**
 * Wochenbalken Tag für Tag (Mo–So). Vergangene Tage: nur Gestempeltes (ein
 * vergessener Tag bleibt leer, nicht „geplant“). Heute: Gestempeltes plus der Rest
 * bis „voraussichtlich gehen“ (`expectedEnd`) und die graue Vorlage. Kommende Tage:
 * Eingetragenes bzw. die Vorlage, alles als geplant (Wochenende/ganze Feiertage ohne Vorlage = 0).
 */
export function weekBreakdown(
  days: Day[],
  date: ISODate,
  settings: TargetSettings & Pick<Settings, 'dayTemplate'>,
  today: ISODate,
  nowMinutes: Minutes | null,
  expectedEnd: Minutes | null = null,
): WeekDayBar[] {
  const from = weekStart(date)
  const result: WeekDayBar[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i)
    const stored = days.find((x) => x.date === d)
    const isToday = d === today
    const isFuture = d > today
    if (!isToday && !isFuture) {
      result.push({ date: d, stamped: stored ? (stampedMinutes(stored) ?? 0) : 0, planned: 0, isToday, isFuture })
      continue
    }
    const day = withPlannedBlocks(stored ?? emptyDay(d), settings)
    if (isToday) {
      const stamped = stampedMinutes(day, nowMinutes) ?? 0
      const withPlan = workedMinutes(day, expectedEnd ?? nowMinutes) ?? 0
      result.push({ date: d, stamped, planned: Math.max(0, withPlan - stamped), isToday, isFuture })
    } else {
      // Kommendes ist immer Plan – auch schon eingetragene Zeiten (z.B. Gesamtzeit 0:00 für Urlaub)
      result.push({ date: d, stamped: 0, planned: workedMinutes(day) ?? 0, isToday, isFuture })
    }
  }
  return result
}
