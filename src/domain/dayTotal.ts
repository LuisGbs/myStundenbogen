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
