import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { holidayOn } from './holidays'
import { balanceUntil, targetMinutes, weeklyTarget } from './target'
import type { Day } from './types'

const settings = {
  weekdayTargets: [498, 498, 498, 498, 498, 0, 0],
  holidayRegion: 'CH-BL' as const,
  holidayOverrides: {},
  customHolidays: [{ date: '2026-12-24', name: 'Heiligabend', share: 0.5 as const }],
  balanceStart: { date: '2026-10-12', minutes: 60 },
}
const worked = (date: string, minutes: number): Day => ({ ...emptyDay(date), timeMode: 'total', totalMinutes: minutes })

describe('Soll-Zeit', () => {
  it('Wochentag 8:18, Wochenende 0, Feiertag 0, halber Feiertag die Hälfte', () => {
    const t = (d: string) => targetMinutes(d, settings, holidayOn(d, settings))
    expect(t('2026-10-14')).toBe(498)
    expect(t('2026-10-17')).toBe(0)
    expect(t('2026-05-14')).toBe(0) // Auffahrt
    expect(t('2026-12-24')).toBe(249)
    expect(weeklyTarget(settings)).toBe(41 * 60 + 30)
  })
})

describe('Überstunden-Saldo', () => {
  it('Startsaldo + Σ(Ist − Soll) bis einschließlich Stichtag', () => {
    const days = [worked('2026-10-12', 540), worked('2026-10-13', 498), worked('2026-10-14', 450)]
    // +60 Start, +42, ±0, −48
    expect(balanceUntil(days, settings, '2026-10-14', '2026-10-20')).toEqual({ minutes: 54, missingDays: [] })
  })

  it('Wochenende mit Arbeit zählt voll als Plus', () => {
    const days = [worked('2026-10-17', 120)]
    const r = balanceUntil(days, { ...settings, balanceStart: { date: '2026-10-17', minutes: 0 } }, '2026-10-18', '2026-10-20')
    expect(r.minutes).toBe(120)
  })

  it('vergangene Arbeitstage ohne Eintrag zählen mit 0 h und werden gemeldet; heute nicht', () => {
    const r = balanceUntil([worked('2026-10-12', 498)], settings, '2026-10-14', '2026-10-14')
    expect(r.minutes).toBe(60 - 498 - 498)
    expect(r.missingDays).toEqual(['2026-10-13'])
  })

  it('vor dem Startdatum zählt nur der Startsaldo', () => {
    expect(balanceUntil([], settings, '2026-10-01', '2026-10-20')).toEqual({ minutes: 60, missingDays: [] })
  })

  it('heute läuft ein Block bis jetzt mit', () => {
    const today: Day = { ...emptyDay('2026-10-12'), blocks: [{ id: 'b', start: '08:00', end: null }] }
    const r = balanceUntil([today], { ...settings, balanceStart: { date: '2026-10-12', minutes: 0 } }, '2026-10-12', '2026-10-12', 10 * 60)
    expect(r.minutes).toBe(120 - 498)
  })
})
