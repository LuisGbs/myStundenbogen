import { workedMinutes } from './dayTotal'
import { clockToMinutes } from './duration'
import type { Day, Minutes, TemplateBlock, TimeBlock } from './types'

/**
 * „Voraussichtlich gehen um …“ für den laufenden Block: selbst eingetragen oder
 * aus der Vorlage (Ende des ersten Vorlage-Blocks, der nach dem Beginn endet –
 * nach der Mittagspause also 16:30, morgens 11:33).
 */
export function defaultExpectedEnd(block: Pick<TimeBlock, 'start'>, template: TemplateBlock[]): Minutes | null {
  const start = clockToMinutes(block.start)
  const match = template.map((t) => clockToMinutes(t.end)).find((end) => end > start)
  return match ?? null
}

export interface ExpectedEnd {
  blockId: string
  /** Wirksames Ende: nie vor „jetzt“ (nach 16:30 wächst der Block einfach mit). */
  end: Minutes
  /** Eingetragenes bzw. Vorlage-Ende (null = keins bekannt). */
  planned: Minutes | null
  /** Selbst eingetragen (sonst Vorlage). */
  custom: boolean
  /** Das geplante Ende liegt schon hinter uns. */
  isPast: boolean
}

/** Voraussichtliches Ende des laufenden (echten) Blocks; null ohne laufenden Block. */
export function expectedEnd(day: Day, template: TemplateBlock[], nowMinutes: Minutes): ExpectedEnd | null {
  if (day.timeMode !== 'blocks') return null
  const block = day.blocks.find((b) => b.end === null && !b.planned)
  if (!block || clockToMinutes(block.start) > nowMinutes) return null
  const planned = block.expectedEnd ? clockToMinutes(block.expectedEnd) : defaultExpectedEnd(block, template)
  return {
    blockId: block.id,
    end: Math.max(planned ?? nowMinutes, nowMinutes),
    planned,
    custom: !!block.expectedEnd,
    isPast: planned !== null && planned <= nowMinutes,
  }
}

/** Gearbeitet am Tag, wenn der laufende Block bis `end` läuft. */
export function forecastWorked(day: Day, end: Minutes): Minutes {
  return workedMinutes(day, end) ?? 0
}
