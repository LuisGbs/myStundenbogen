import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { holidayOn } from './holidays'
import { targetMinutes, weeklyTarget, weekSummary } from './target'
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

  it('Feiertage senken das Wochen-Soll, Überschreitung wird negativ', () => {
    const days = ['2026-05-11', '2026-05-12', '2026-05-13', '2026-05-15', '2026-05-16'].map((d) => worked(d, 600))
    const w = weekSummary(days, '2026-05-14', week, '2026-05-20') // Auffahrt am Do
    expect(w.target).toBe(4 * 498)
    expect(w.toMax).toBe(2700 - 3000)
  })
})
