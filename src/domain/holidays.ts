import type { CustomHoliday, HolidayRegion, ISODate, Settings } from './types'

/**
 * Gesetzliche Feiertage je Arbeitsort – komplett offline berechnet
 * (feste Daten + bewegliche Feiertage ab Ostersonntag).
 */

type Rule = { month: number; day: number } | { easterOffset: number }

export interface HolidayDef {
  /** Stabiler Schlüssel (für Ein/Aus in den Einstellungen). */
  key: string
  name: string
  rule: Rule
  /** 1 = ganzer Tag, 0.5 = halber Tag */
  share?: 1 | 0.5
  /** Optionale Tage (z.B. nur in Teilen des Landes) sind standardmäßig aus. */
  defaultEnabled?: boolean
  note?: string
}

export interface Holiday {
  date: ISODate
  key: string
  name: string
  share: 1 | 0.5
  enabled: boolean
  custom: boolean
  note?: string
}

const fixed = (key: string, name: string, month: number, day: number, extra: Partial<HolidayDef> = {}): HolidayDef => ({
  key,
  name,
  rule: { month, day },
  ...extra,
})
const easter = (key: string, name: string, easterOffset: number, extra: Partial<HolidayDef> = {}): HolidayDef => ({
  key,
  name,
  rule: { easterOffset },
  ...extra,
})

const NEUJAHR = fixed('neujahr', 'Neujahr', 1, 1)
const KARFREITAG = easter('karfreitag', 'Karfreitag', -2)
const OSTERMONTAG = easter('ostermontag', 'Ostermontag', 1)
const TAG_DER_ARBEIT = fixed('tag-der-arbeit', 'Tag der Arbeit', 5, 1)
const PFINGSTMONTAG = easter('pfingstmontag', 'Pfingstmontag', 50)
const WEIHNACHTEN = fixed('weihnachten', 'Weihnachten', 12, 25)
const STEPHANSTAG = fixed('stephanstag', '2. Weihnachtstag', 12, 26)
// Deutschland
const DREIKOENIG = fixed('heilige-drei-koenige', 'Heilige Drei Könige', 1, 6)
const HIMMELFAHRT = easter('himmelfahrt', 'Christi Himmelfahrt', 39)
const FRONLEICHNAM = easter('fronleichnam', 'Fronleichnam', 60)
const EINHEIT = fixed('deutsche-einheit', 'Tag der Deutschen Einheit', 10, 3)
const ALLERHEILIGEN = fixed('allerheiligen', 'Allerheiligen', 11, 1)

export const HOLIDAY_REGIONS: Record<HolidayRegion, { label: string; holidays: HolidayDef[] }> = {
  'CH-BL': {
    label: 'Schweiz – Basel-Landschaft',
    holidays: [
      NEUJAHR,
      fixed('berchtoldstag', 'Berchtoldstag', 1, 2, { defaultEnabled: false, note: 'kein gesetzlicher Feiertag in BL, in vielen Firmen frei' }),
      KARFREITAG,
      OSTERMONTAG,
      TAG_DER_ARBEIT,
      easter('auffahrt', 'Auffahrt', 39),
      PFINGSTMONTAG,
      fixed('bundesfeier', 'Bundesfeier', 8, 1),
      WEIHNACHTEN,
      { ...STEPHANSTAG, name: 'Stephanstag' },
    ],
  },
  'DE-BW': {
    label: 'Deutschland – Baden-Württemberg',
    holidays: [
      NEUJAHR,
      DREIKOENIG,
      KARFREITAG,
      OSTERMONTAG,
      TAG_DER_ARBEIT,
      HIMMELFAHRT,
      PFINGSTMONTAG,
      FRONLEICHNAM,
      EINHEIT,
      ALLERHEILIGEN,
      { ...WEIHNACHTEN, name: '1. Weihnachtstag' },
      STEPHANSTAG,
    ],
  },
  'DE-BY': {
    label: 'Deutschland – Bayern',
    holidays: [
      NEUJAHR,
      DREIKOENIG,
      KARFREITAG,
      OSTERMONTAG,
      TAG_DER_ARBEIT,
      HIMMELFAHRT,
      PFINGSTMONTAG,
      FRONLEICHNAM,
      fixed('friedensfest', 'Augsburger Friedensfest', 8, 8, { defaultEnabled: false, note: 'nur Stadt Augsburg' }),
      fixed('mariae-himmelfahrt', 'Mariä Himmelfahrt', 8, 15, {
        note: 'nur in Gemeinden mit überwiegend katholischer Bevölkerung',
      }),
      EINHEIT,
      ALLERHEILIGEN,
      { ...WEIHNACHTEN, name: '1. Weihnachtstag' },
      STEPHANSTAG,
    ],
  },
  'DE-RP': {
    label: 'Deutschland – Rheinland-Pfalz',
    holidays: [
      NEUJAHR,
      KARFREITAG,
      OSTERMONTAG,
      TAG_DER_ARBEIT,
      HIMMELFAHRT,
      PFINGSTMONTAG,
      FRONLEICHNAM,
      EINHEIT,
      ALLERHEILIGEN,
      { ...WEIHNACHTEN, name: '1. Weihnachtstag' },
      STEPHANSTAG,
    ],
  },
  none: { label: 'Keine Feiertage', holidays: [] },
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Ostersonntag (Gregorianischer Kalender, Gaußsche Osterformel nach Meeus/Jones/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${pad(month)}-${pad(day)}`
}

function resolve(rule: Rule, year: number, easterDate: ISODate): ISODate {
  if ('month' in rule) return `${year}-${pad(rule.month)}-${pad(rule.day)}`
  const [y, m, d] = easterDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + rule.easterOffset))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

type HolidaySettings = Pick<Settings, 'holidayRegion' | 'holidayOverrides' | 'customHolidays'>

/** Alle Feiertage eines Jahres (auch abgeschaltete, für die Einstellungen), nach Datum sortiert. */
export function holidaysInYear(year: number, settings: HolidaySettings): Holiday[] {
  const region = HOLIDAY_REGIONS[settings.holidayRegion] ?? HOLIDAY_REGIONS.none
  const easterDate = easterSunday(year)
  const overrides = settings.holidayOverrides ?? {}
  const fromRegion = region.holidays.map(
    (def): Holiday => ({
      date: resolve(def.rule, year, easterDate),
      key: def.key,
      name: def.name,
      share: def.share ?? 1,
      enabled: overrides[def.key] ?? def.defaultEnabled ?? true,
      custom: false,
      note: def.note,
    }),
  )
  const custom = (settings.customHolidays ?? [])
    .filter((c: CustomHoliday) => c.date.startsWith(`${year}-`))
    .map((c): Holiday => ({ date: c.date, key: `custom:${c.date}`, name: c.name, share: c.share, enabled: true, custom: true }))
  return [...fromRegion, ...custom].sort((a, b) => a.date.localeCompare(b.date))
}

/** Aktive Feiertage eines Jahres; fallen zwei auf denselben Tag, zählt der größere Anteil. */
export function holidayMap(year: number, settings: HolidaySettings): Map<ISODate, Holiday> {
  const map = new Map<ISODate, Holiday>()
  for (const h of holidaysInYear(year, settings)) {
    if (!h.enabled) continue
    const existing = map.get(h.date)
    if (!existing || h.share > existing.share) map.set(h.date, h)
  }
  return map
}

export function holidayOn(date: ISODate, settings: HolidaySettings): Holiday | null {
  return holidayMap(Number(date.slice(0, 4)), settings).get(date) ?? null
}
