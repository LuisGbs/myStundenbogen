import { weekdayIndex } from './date'
import { clockToMinutes, nowClock } from './duration'
import { holidayOn } from './holidays'
import type { ClockTime, Day, Settings, TemplateBlock, TimeBlock } from './types'

/** 07:00–16:30 mit 30 min Mittag = 9:00 (bei 8:18 Soll täglich +0:42 Überstunden). */
export const TEMPLATE_9H: TemplateBlock[] = [
  { start: '07:00', end: '11:33' },
  { start: '12:03', end: '16:30' },
]

/** Vorlage genau auf Soll (8:18) – war kurzzeitig Standard, siehe Datenbank-Update v4/v5. */
export const TEMPLATE_8H18: TemplateBlock[] = [
  { start: '07:00', end: '11:33' },
  { start: '12:03', end: '15:48' },
]

/** Standard-Vorlage für einen normalen Arbeitstag (in den Einstellungen änderbar). */
export const DEFAULT_DAY_TEMPLATE: TemplateBlock[] = TEMPLATE_9H

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

/**
 * Geänderte Uhrzeit → der Block gilt als echt gestempelt. Mit einem Ende ist auch
 * „voraussichtlich gehen um …“ erledigt.
 */
export function editBlock(block: TimeBlock, patch: Partial<Pick<TimeBlock, 'start' | 'end'>>): TimeBlock {
  const { planned: _planned, expectedEnd, ...rest } = block
  const next: TimeBlock = { ...rest, ...patch }
  return next.end === null && expectedEnd ? { ...next, expectedEnd } : next
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
