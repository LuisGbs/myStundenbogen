import { describe, expect, it } from 'vitest'
import { easterSunday, holidayMap, holidayOn, holidaysInYear } from './holidays'
import type { HolidayRegion } from './types'

const settings = (holidayRegion: HolidayRegion, extra = {}) => ({
  holidayRegion,
  holidayOverrides: {},
  customHolidays: [],
  ...extra,
})
const enabledDates = (region: HolidayRegion, year = 2026) =>
  [...holidayMap(year, settings(region)).values()].map((h) => `${h.date.slice(5)} ${h.name}`)

describe('Ostersonntag', () => {
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2038, '2038-04-25'],
  ])('%i → %s', (year, date) => expect(easterSunday(year)).toBe(date))
})

describe('Feiertage 2026', () => {
  it('Basel-Landschaft', () => {
    expect(enabledDates('CH-BL')).toEqual([
      '01-01 Neujahr',
      '04-03 Karfreitag',
      '04-06 Ostermontag',
      '05-01 Tag der Arbeit',
      '05-14 Auffahrt',
      '05-25 Pfingstmontag',
      '08-01 Bundesfeier',
      '12-25 Weihnachten',
      '12-26 Stephanstag',
    ])
  })

  it('Baden-Württemberg', () => {
    expect(enabledDates('DE-BW')).toEqual([
      '01-01 Neujahr',
      '01-06 Heilige Drei Könige',
      '04-03 Karfreitag',
      '04-06 Ostermontag',
      '05-01 Tag der Arbeit',
      '05-14 Christi Himmelfahrt',
      '05-25 Pfingstmontag',
      '06-04 Fronleichnam',
      '10-03 Tag der Deutschen Einheit',
      '11-01 Allerheiligen',
      '12-25 1. Weihnachtstag',
      '12-26 2. Weihnachtstag',
    ])
  })

  it('Bayern: wie BW plus Mariä Himmelfahrt; Augsburger Friedensfest nur auf Wunsch', () => {
    const by = enabledDates('DE-BY')
    expect(by).toContain('08-15 Mariä Himmelfahrt')
    expect(by).not.toContain('08-08 Augsburger Friedensfest')
    expect(by).toHaveLength(13)
  })

  it('Rheinland-Pfalz: ohne Heilige Drei Könige', () => {
    const rp = enabledDates('DE-RP')
    expect(rp).not.toContain('01-06 Heilige Drei Könige')
    expect(rp).toContain('06-04 Fronleichnam')
    expect(rp).toHaveLength(11)
  })

  it('keine Region → keine Feiertage', () => {
    expect(enabledDates('none')).toEqual([])
  })
})

describe('Anpassungen', () => {
  it('Tage lassen sich ab- und optionale zuschalten', () => {
    const s = settings('CH-BL', { holidayOverrides: { bundesfeier: false, berchtoldstag: true } })
    expect(holidayOn('2026-08-01', s)).toBeNull()
    expect(holidayOn('2026-01-02', s)?.name).toBe('Berchtoldstag')
    // In der Liste für die Einstellungen bleiben abgeschaltete sichtbar
    expect(holidaysInYear(2026, s).find((h) => h.key === 'bundesfeier')?.enabled).toBe(false)
  })

  it('eigene Tage (auch halbe) kommen dazu, größerer Anteil gewinnt', () => {
    const s = settings('CH-BL', {
      customHolidays: [
        { date: '2026-12-24', name: 'Heiligabend', share: 0.5 },
        { date: '2026-12-25', name: 'Firmenfeier', share: 0.5 },
        { date: '2027-01-02', name: 'Brückentag', share: 1 },
      ],
    })
    expect(holidayOn('2026-12-24', s)).toMatchObject({ name: 'Heiligabend', share: 0.5, custom: true })
    expect(holidayOn('2026-12-25', s)).toMatchObject({ name: 'Weihnachten', share: 1 })
    expect(holidayOn('2027-01-02', s)?.name).toBe('Brückentag')
  })
})
