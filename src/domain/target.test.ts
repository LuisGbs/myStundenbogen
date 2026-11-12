import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { holidayOn } from './holidays'
import { targetMinutes, weekBreakdown, weeklyTarget, weekSummary } from './target'
import type { Day } from './types'

const settings = {
  weekdayTargets: [498, 498, 498, 498, 498, 0, 0],
  holidayRegion: 'CH-BL' as const,
  holidayOverrides: {},
  customHolidays: [{ date: '2026-12-24', name: 'Heiligabend', share: 0.5 as const }],
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

describe('Wochenübersicht', () => {
  const week = { ...settings, weeklyMaxMinutes: 45 * 60 }
  it('Woche Mo–So: gearbeitet, noch bis Soll, noch bis Höchstarbeitszeit', () => {
    const days = [worked('2026-10-19', 540), worked('2026-10-20', 540), worked('2026-10-26', 540)]
    const w = weekSummary(days, '2026-10-21', week, '2026-10-21')
    expect(w).toMatchObject({ from: '2026-10-19', to: '2026-10-25', weekNumber: 43, worked: 1080, target: 2490 })
    expect(w.toTarget).toBe(2490 - 1080) // noch 23:30 bis 41:30
    expect(w.toMax).toBe(2700 - 1080) // noch 27:00 bis 45:00
  })

  it('geplante Blöcke zählen nicht als gearbeitet – nur in der Vorhersage', () => {
    const today: Day = {
      ...emptyDay('2026-10-21'),
      blocks: [
        { id: 'a', start: '07:13', end: null },
        { id: 'plan-1', start: '12:03', end: '16:30', planned: true },
      ],
    }
    const days = [worked('2026-10-19', 540), today]
    expect(weekSummary(days, '2026-10-21', week, '2026-10-21', 7 * 60 + 43).worked).toBe(540 + 30)
    expect(weekSummary(days, '2026-10-21', week, '2026-10-21', 11 * 60 + 33, true).worked).toBe(540 + 260 + 267)
  })

  it('Feiertage senken das Wochen-Soll, Überschreitung wird negativ', () => {
    const days = ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15', '2026-05-16'].map((d) => worked(d, 600))
    const w = weekSummary(days, '2026-05-14', week, '2026-05-20') // Auffahrt am Do
    expect(w.target).toBe(4 * 498)
    expect(w.toMax).toBe(2700 - 3000)
  })
})

describe('Wochenbalken Tag für Tag', () => {
  const plan = { ...settings, weeklyMaxMinutes: 45 * 60, dayTemplate: [
    { start: '07:00', end: '11:33' },
    { start: '12:03', end: '16:30' },
  ] }
  // KW 46 2026: Mo 09.11. – So 15.11., heute Do 12.11.
  const thursday: Day = {
    ...emptyDay('2026-11-12'),
    blocks: [
      { id: 'a', start: '07:13', end: null },
      { id: 'plan-1', start: '12:03', end: '16:30', planned: true },
    ],
  }
  const days = [worked('2026-11-09', 540), worked('2026-11-10', 520), thursday]
  const bars = (extra: Day[] = [], s: Parameters<typeof weekBreakdown>[2] = plan) =>
    weekBreakdown([...days, ...extra], '2026-11-12', s, '2026-11-12', 9 * 60 + 20, 11 * 60 + 33)

  it('vergangen gestempelt, vergessener Tag leer, heute Rest bis „Geplant“ + Nachmittag, Fr Vorlage, Wochenende 0', () => {
    expect(bars().map((b) => [b.date.slice(8), b.stamped, b.planned])).toEqual([
      ['09', 540, 0],
      ['10', 520, 0],
      ['11', 0, 0], // Mittwoch vergessen: nicht „geplant“
      ['12', 127, 133 + 267], // 07:13–09:20 gestempelt, bis 11:33 + Nachmittag geplant
      ['13', 0, 540],
      ['14', 0, 0],
      ['15', 0, 0],
    ])
    expect(bars().find((b) => b.isToday)?.date).toBe('2026-11-12')
  })

  it('kommender Tag mit Eintrag (z.B. 0:00 für Urlaub) und Feiertag zählen entsprechend', () => {
    expect(bars([worked('2026-11-13', 0)])[4].planned).toBe(0)
    const withHoliday = { ...plan, customHolidays: [{ date: '2026-11-13', name: 'Brückentag', share: 1 as const }] }
    expect(bars([], withHoliday)[4].planned).toBe(0)
  })
})
