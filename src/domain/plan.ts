import { weekdayIndex } from './date'
import { clockToMinutes, nowClock } from './duration'
import { holidayOn } from './holidays'
import type { ClockTime, Day, Settings, TemplateBlock, TimeBlock } from './types'

/** Standard-Vorlage für einen normalen Arbeitstag (in den Einstellungen änderbar). */
export const DEFAULT_DAY_TEMPLATE: TemplateBlock[] = [
  { start: '07:00', end: '11:33' },
  { start: '12:03', end: '15:48' }, // zusammen 8:18 = Soll bei 41,5 h/Woche
]

/** Frühere Standard-Vorlage (9:00) – wird beim Update auf die neue umgestellt, falls unverändert. */
export const OLD_DEFAULT_DAY_TEMPLATE: TemplateBlock[] = [
  { start: '07:00', end: '11:33' },
  { start: '12:03', end: '16:30' },
]

/** Feste IDs, damit Projekte, die man schon auf den Plan zieht, am Block hängen bleiben. */
export const plannedBlockId = (index: number) => `plan-${index}`

export function isValidTemplate(template: TemplateBlock[]): boolean {
  return template.every((b) => clockToMinutes(b.end) > clockToMinutes(b.start))
}

/**
 * Noch nichts gestempelt (Modus Stempelzeiten, keine Blöcke) an einem Tag mit
 * Soll-Zeit → die Vorlage wird als „geplant“ vorbelegt (nur Anzeige, bis man etwas ändert).
 */
export function withPlannedBlocks(
  day: Day,
  settings: Pick<Settings, 'dayTemplate' | 'weekdayTargets' | 'holidayRegion' | 'holidayOverrides' | 'customHolidays'>,
): Day {
  const template = settings.dayTemplate ?? []
  if (day.timeMode !== 'blocks' || day.blocks.length > 0 || template.length === 0) return day
  if (!(settings.weekdayTargets[weekdayIndex(day.date)] > 0)) return day
  // An ganzen Feiertagen wird nicht gearbeitet → keine Vorlage.
  if ((holidayOn(day.date, settings)?.share ?? 0) >= 1) return day
  return {
    ...day,
    blocks: template.map((b, i) => ({ id: plannedBlockId(i), start: b.start, end: b.end, planned: true })),
  }
}

export function hasPlannedBlocks(day: Day): boolean {
  return day.blocks.some((b) => b.planned)
}

/** Geänderte Uhrzeit → der Block gilt als echt gestempelt. */
export function editBlock(block: TimeBlock, patch: Partial<Pick<TimeBlock, 'start' | 'end'>>): TimeBlock {
  const { planned: _planned, ...rest } = block
  return { ...rest, ...patch }
}

/** Den ganzen Plan als gestempelt übernehmen. */
export function confirmPlan(day: Day): Day {
  return { ...day, blocks: day.blocks.map((b) => (b.planned ? editBlock(b, {}) : b)) }
}

/**
 * „Kommen (jetzt)“: Gibt es noch einen geplanten Block, wird der erste davon
 * zum laufenden echten Block (Beginn = jetzt). Sonst neuer Block.
 */
export function clockIn(day: Day, newId: string, now: ClockTime = nowClock()): Day {
  const firstPlanned = day.blocks.findIndex((b) => b.planned)
  if (firstPlanned >= 0) {
    return {
      ...day,
      blocks: day.blocks.map((b, i) => (i === firstPlanned ? { ...editBlock(b, { start: now }), end: null } : b)),
    }
  }
  return { ...day, blocks: [...day.blocks, { id: newId, start: now, end: null }] }
}
