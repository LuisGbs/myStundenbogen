import type { AllocationResult } from './allocation'
import { clockToMinutes, formatDuration, minutesToClock } from './duration'
import type { Day, Minutes } from './types'

/** Ein Abschnitt auf der Zeitleiste; left/width in % der Achse. */
export interface TimelineSpan {
  start: Minutes
  end: Minutes
  left: number
  width: number
}

export interface TimelineBlock extends TimelineSpan {
  /** Index in day.blocks (bei Gesamtzeit: 0). */
  index: number
  minutes: Minutes
  label: string
  running: boolean
}

/** Anteil einer Zeile am Tag; start/end in Minuten ab Tagesbeginn der Verteilung, left/width in % der Arbeitszeit. */
export interface TimelineSegment extends TimelineSpan {
  /** null = noch nicht verteilte Zeit */
  allocationId: string | null
  minutes: Minutes
}

export interface TimelineLayout {
  /** clock = Stempelzeiten mit Uhrzeiten, total = nur eine Gesamtdauer */
  mode: 'clock' | 'total'
  axisStart: Minutes
  axisEnd: Minutes
  blocks: TimelineBlock[]
  breaks: TimelineSpan[]
  segments: TimelineSegment[]
}

/**
 * Ordnet die Tageszeit als Balken an: Stempel-Blöcke nach Uhrzeit mit Pausen
 * dazwischen, darunter ein Anteils-Balken mit den verteilten Minuten je Zeile
 * (die Zeilen sind feste Dauern ohne Uhrzeit, daher keine Zeit-Zuordnung).
 * Gibt null zurück, solange es nichts darzustellen gibt.
 */
export function layoutTimeline(day: Day, result: AllocationResult, nowMinutes: Minutes | null = null): TimelineLayout | null {
  const ranges = day.timeMode === 'total' ? totalRange(day) : blockRanges(day, nowMinutes)
  if (ranges.length === 0) return null

  const axisStart = Math.min(...ranges.map((r) => r.start))
  const axisEnd = Math.max(...ranges.map((r) => r.end))
  const length = axisEnd - axisStart
  const span = (start: Minutes, end: Minutes): TimelineSpan => ({
    start,
    end,
    left: ((start - axisStart) / length) * 100,
    width: ((end - start) / length) * 100,
  })

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const blocks: TimelineBlock[] = sorted.map((r) => ({
    ...span(r.start, r.end),
    index: r.index,
    minutes: r.end - r.start,
    label:
      day.timeMode === 'total'
        ? `Gesamtzeit ${formatDuration(r.end - r.start)}`
        : `${minutesToClock(r.start)}–${r.running ? 'jetzt' : minutesToClock(r.end)}`,
    running: r.running,
  }))

  const breaks: TimelineSpan[] = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start > sorted[i - 1].end) breaks.push(span(sorted[i - 1].end, sorted[i].start))
  }

  // Verteilung als eigener Anteils-Balken über die gesamte Arbeitszeit (keine Uhrzeit-Zuordnung).
  const worked = blocks.reduce((sum, b) => sum + b.minutes, 0)
  const pieces: { allocationId: string | null; minutes: Minutes }[] = day.allocations
    .map((a) => ({ allocationId: a.id, minutes: result.minutes[a.id] ?? 0 }))
    .filter((p) => p.minutes > 0)
  if (result.open > 0) pieces.push({ allocationId: null, minutes: result.open })
  const scale = Math.max(worked, pieces.reduce((sum, p) => sum + p.minutes, 0))

  let cursor = 0
  const segments: TimelineSegment[] = pieces.map((p) => {
    const segment = {
      start: cursor,
      end: cursor + p.minutes,
      left: (cursor / scale) * 100,
      width: (p.minutes / scale) * 100,
      allocationId: p.allocationId,
      minutes: p.minutes,
    }
    cursor += p.minutes
    return segment
  })

  return { mode: day.timeMode === 'total' ? 'total' : 'clock', axisStart, axisEnd, blocks, breaks, segments }
}

interface Range {
  index: number
  start: Minutes
  end: Minutes
  running: boolean
}

function blockRanges(day: Day, nowMinutes: Minutes | null): Range[] {
  return day.blocks.flatMap((b, index): Range[] => {
    const start = clockToMinutes(b.start)
    const running = b.end === null
    const end = running ? nowMinutes : clockToMinutes(b.end!)
    if (end === null || end <= start) return []
    return [{ index, start, end, running }]
  })
}

function totalRange(day: Day): Range[] {
  return day.totalMinutes ? [{ index: 0, start: 0, end: day.totalMinutes, running: false }] : []
}

/** Anteil eines Blocks in ganzen Minuten: 50 % von 4:15 → 2:08. */
export function blockShareMinutes(blockMinutes: Minutes, sharePercent: number): Minutes {
  return Math.round((blockMinutes * sharePercent) / 100)
}
