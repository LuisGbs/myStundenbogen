import type { ClockTime, Minutes } from './types'

/** 498 → '8:18', -90 → '−1:30' */
export function formatDuration(minutes: Minutes): string {
  const sign = minutes < 0 ? '−' : ''
  const abs = Math.abs(Math.round(minutes))
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

/** Wie formatDuration, aber immer mit Vorzeichen: '+4:12', '−0:30', '±0:00'. */
export function formatSignedDuration(minutes: Minutes): string {
  if (Math.round(minutes) === 0) return '±0:00'
  return minutes > 0 ? `+${formatDuration(minutes)}` : formatDuration(minutes)
}

export type ParsedAmount =
  | { kind: 'duration'; minutes: Minutes }
  | { kind: 'percent'; percent: number }
  | { kind: 'rest' }

function toNumber(s: string): number {
  return Number(s.replace(',', '.'))
}

/**
 * Versteht die üblichen Schreibweisen für Dauern:
 *   '8:18', ':30', '8,3' / '8.3' (Dezimalstunden), '8' (Stunden),
 *   '8h', '8h18', '8h 18m', '90m', '90 min', '50%', 'rest'.
 * Gibt null zurück, wenn die Eingabe nicht verstanden wird.
 */
export function parseAmount(input: string): ParsedAmount | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ')
  if (s === '') return null
  if (s === 'rest' || s === 'r') return { kind: 'rest' }

  let m = /^(\d+(?:[.,]\d+)?) ?%$/.exec(s)
  if (m) {
    const percent = toNumber(m[1])
    return percent <= 1000 ? { kind: 'percent', percent } : null
  }

  // 8:18 oder :30
  m = /^(\d*):(\d{1,2})$/.exec(s)
  if (m) {
    const minutes = Number(m[2])
    if (minutes >= 60) return null
    return { kind: 'duration', minutes: Number(m[1] || 0) * 60 + minutes }
  }

  // 8h, 8h18, 8h 18m, 8 h 18 min, 8 std
  m = /^(\d+(?:[.,]\d+)?) ?(?:h|std\.?) ?(?:(\d{1,2}) ?(?:m|min)?)?$/.exec(s)
  if (m) {
    const extra = m[2] ? Number(m[2]) : 0
    if (extra >= 60) return null
    return { kind: 'duration', minutes: Math.round(toNumber(m[1]) * 60) + extra }
  }

  // 90m, 90 min
  m = /^(\d+) ?(?:m|min)$/.exec(s)
  if (m) return { kind: 'duration', minutes: Number(m[1]) }

  // 8 / 8,3 / 8.25 → Dezimalstunden
  m = /^(\d+(?:[.,]\d+)?)$/.exec(s)
  if (m) return { kind: 'duration', minutes: Math.round(toNumber(m[1]) * 60) }

  return null
}

/** Wie parseAmount, akzeptiert aber nur Dauern. */
export function parseDuration(input: string): Minutes | null {
  const parsed = parseAmount(input)
  return parsed?.kind === 'duration' ? parsed.minutes : null
}

/** '07:45' → 465 */
export function clockToMinutes(t: ClockTime): Minutes {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 465 → '07:45' */
export function minutesToClock(minutes: Minutes): ClockTime {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isClockTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

/** Aktuelle Uhrzeit, auf die Minute abgeschnitten. */
export function nowClock(now: Date = new Date()): ClockTime {
  return minutesToClock(now.getHours() * 60 + now.getMinutes())
}

/** Prozentwert hübsch formatiert: 50 → '50 %', 33.3 → '33,3 %' */
export function formatPercent(percent: number): string {
  const rounded = Math.round(percent * 10) / 10
  return `${String(rounded).replace('.', ',')} %`
}
