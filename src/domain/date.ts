import type { ISODate } from './types'

// Datumsrechnung läuft über UTC, damit Sommer-/Winterzeit nie einen Tag verschiebt.

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return toISO(Date.UTC(y, m - 1, d)) === s
}

function toUTC(iso: ISODate): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function toISO(utcMs: number): ISODate {
  const d = new Date(utcMs)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** Heutiges Datum in der lokalen Zeitzone des Rechners. */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function addDays(iso: ISODate, days: number): ISODate {
  return toISO(toUTC(iso) + days * 86_400_000)
}

/** 0 = Montag … 6 = Sonntag */
export function weekdayIndex(iso: ISODate): number {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7
}

export function isWeekend(iso: ISODate): boolean {
  return weekdayIndex(iso) >= 5
}

export function weekdayShort(iso: ISODate): string {
  return WEEKDAYS_SHORT[weekdayIndex(iso)]
}

export function weekdayName(index: number): string {
  return WEEKDAYS_LONG[index]
}

/** 'YYYY-MM' */
export type YearMonth = string

export function yearMonthOf(iso: ISODate): YearMonth {
  return iso.slice(0, 7)
}

export function isYearMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
}

export function addMonths(ym: YearMonth, months: number): YearMonth {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
}

export function monthDates(ym: YearMonth): ISODate[] {
  const [y, m] = ym.split('-').map(Number)
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => `${ym}-${pad(i + 1)}`)
}

export function monthLabel(ym: YearMonth): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** 'Mo, 19.10.2026' */
export function formatDateLong(iso: ISODate): string {
  const [y, m, d] = iso.split('-')
  return `${weekdayShort(iso)}, ${d}.${m}.${y}`
}

/** '19.10.' */
export function formatDateShort(iso: ISODate): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}.`
}

export function dayOfMonth(iso: ISODate): number {
  return Number(iso.slice(8, 10))
}

/** Montag der Woche, in der `iso` liegt. */
export function weekStart(iso: ISODate): ISODate {
  return addDays(iso, -weekdayIndex(iso))
}

/** Kalenderwoche nach ISO 8601 (Woche mit dem ersten Donnerstag = KW 1). */
export function isoWeekNumber(iso: ISODate): number {
  const thursday = addDays(iso, 3 - weekdayIndex(iso))
  const firstThursdayOfYear = addDays(weekStart(`${thursday.slice(0, 4)}-01-04`), 3)
  return Math.round((toUTC(thursday) - toUTC(firstThursdayOfYear)) / (7 * 86_400_000)) + 1
}
