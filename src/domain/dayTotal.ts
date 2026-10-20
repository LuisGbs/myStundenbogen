import { clockToMinutes } from './duration'
import type { Day, Minutes, TimeBlock } from './types'

export type BlockIssue =
  | { kind: 'end-before-start'; blockId: string }
  | { kind: 'overlap'; blockIds: [string, string] }
  | { kind: 'open'; blockId: string }

export interface BlockAnalysis {
  total: Minutes
  /** Dauer je Block (gleiche Reihenfolge wie die Eingabe); null = ungültig/offen. */
  perBlock: (Minutes | null)[]
  /** Gibt es einen laufenden Block, der bis „jetzt“ gezählt wird? */
  running: boolean
  issues: BlockIssue[]
}

/**
 * Rechnet Stempel-Blöcke zusammen.
 * @param nowMinutes Minuten seit Mitternacht, nur für den heutigen Tag übergeben:
 *   Dann zählt ein offener Block bis jetzt. Sonst gilt ein offener Block als Fehler.
 */
export function analyzeBlocks(blocks: TimeBlock[], nowMinutes: Minutes | null = null): BlockAnalysis {
  const issues: BlockIssue[] = []
  let running = false
  const ranges: { id: string; start: Minutes; end: Minutes }[] = []

  const perBlock = blocks.map((b): Minutes | null => {
    const start = clockToMinutes(b.start)
    if (b.end === null) {
      if (nowMinutes !== null && nowMinutes >= start) {
        running = true
        ranges.push({ id: b.id, start, end: nowMinutes })
        return nowMinutes - start
      }
      issues.push({ kind: 'open', blockId: b.id })
      return null
    }
    const end = clockToMinutes(b.end)
    if (end < start) {
      issues.push({ kind: 'end-before-start', blockId: b.id })
      return null
    }
    ranges.push({ id: b.id, start, end })
    return end - start
  })

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) {
      issues.push({ kind: 'overlap', blockIds: [sorted[i - 1].id, sorted[i].id] })
    }
  }

  const total = perBlock.reduce<number>((sum, m) => sum + (m ?? 0), 0)
  return { total, perBlock, running, issues }
}

/**
 * Gearbeitete Zeit eines Tages, oder null, wenn noch nichts eingetragen ist.
 */
export function workedMinutes(day: Day, nowMinutes: Minutes | null = null): Minutes | null {
  if (day.timeMode === 'total') return day.totalMinutes
  if (day.blocks.length === 0) return null
  return analyzeBlocks(day.blocks, nowMinutes).total
}

/** Block-ID, wenn der Tag nur eine Gesamtzeit hat (ein einziger Block ohne Uhrzeit). */
export const TOTAL_BLOCK_ID = 'gesamt'

/** Ein gültiger Zeitraum des Tages (Stempel-Block oder Gesamtzeit ab 0). */
export interface DayRange {
  id: string
  /** Index in day.blocks (bei Gesamtzeit: 0). */
  index: number
  start: Minutes
  end: Minutes
  running: boolean
  planned: boolean
}

/**
 * Gültige Zeiträume eines Tages in Eingabe-Reihenfolge: Stempel-Blöcke mit Ende
 * nach Beginn (ein laufender Block zählt bis `nowMinutes`), bei Gesamtzeit ein
 * Block mit fester ID.
 */
export function dayRanges(day: Day, nowMinutes: Minutes | null = null): DayRange[] {
  if (day.timeMode === 'total') {
    return day.totalMinutes
      ? [{ id: TOTAL_BLOCK_ID, index: 0, start: 0, end: day.totalMinutes, running: false, planned: false }]
      : []
  }
  return day.blocks.flatMap((b, index): DayRange[] => {
    const start = clockToMinutes(b.start)
    const running = b.end === null
    const end = running ? nowMinutes : clockToMinutes(b.end!)
    if (end === null || end <= start) return []
    return [{ id: b.id, index, start, end, running, planned: !!b.planned }]
  })
}

/** Dauer je gültigem Block in zeitlicher Reihenfolge – für Blockzuordnung und „Rest im Block“. */
export function blockDurations(day: Day, nowMinutes: Minutes | null = null): { id: string; minutes: Minutes }[] {
  return dayRanges(day, nowMinutes)
    .sort((a, b) => a.start - b.start)
    .map((r) => ({ id: r.id, minutes: r.end - r.start }))
}
