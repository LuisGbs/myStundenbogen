import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  formatDateLong,
  isISODate,
  isoWeekNumber,
  monthDates,
  monthLabel,
  todayISO,
  weekdayIndex,
  weekStart,
} from './date'

describe('Datumshilfen', () => {
  it('rechnet Tage über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    // Zeitumstellung Ende Oktober verschiebt nichts
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
  })

  it('rechnet Monate', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthDates('2026-02')).toHaveLength(28)
    expect(monthDates('2028-02')).toHaveLength(29)
    expect(monthLabel('2026-10')).toBe('Oktober 2026')
  })

  it('kennt die Wochentage (Montag = 0)', () => {
    expect(weekdayIndex('2026-10-19')).toBe(0)
    expect(weekdayIndex('2026-10-25')).toBe(6)
    expect(formatDateLong('2026-10-19')).toBe('Mo, 19.10.2026')
  })

  it('prüft ISO-Daten', () => {
    expect(isISODate('2026-10-19')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('19.10.2026')).toBe(false)
  })

  it('liefert das lokale Datum', () => {
    expect(todayISO(new Date(2026, 9, 19, 23, 59))).toBe('2026-10-19')
  })
})

describe('Kalenderwoche', () => {
  it.each([
    ['2026-10-20', 43],
    ['2026-01-01', 1],
    ['2025-12-29', 1], // gehört schon zu KW 1/2026
    ['2027-01-01', 53], // Freitag → KW 53/2026
    ['2021-01-03', 53],
  ])('%s → KW %i', (date, week) => expect(isoWeekNumber(date)).toBe(week))

  it('Montag der Woche', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
  })
})
