import type { AllocationResult } from './allocation'
import { clockToMinutes, formatDuration, minutesToClock } from './duration'
import type { Allocation, Day, Minutes } from './types'

/** Block-ID, wenn der Tag nur eine Gesamtzeit hat (ein einziger Block ohne Uhrzeit). */
export const TOTAL_BLOCK_ID = 'gesamt'

/** Raster beim Ziehen der Segment-Ränder. */
export const SNAP_MINUTES = 5

/** Kürzestes Segment, das per Ziehen entstehen kann. */
export const MIN_SEGMENT_MINUTES = 5

/**
 * Ein Segment in einem Block; start/end in Minuten (Uhrzeit bzw. ab 0 bei
 * Gesamtzeit), left/width in % des Blocks.
 * - bound:    Zeile ist an diesen Block gebunden (feste Dauer, Rand ziehbar)
 * - floating: Zeile aus der Liste ohne Block (Rest, %, …) – füllt freien Platz
 * - open:     noch nicht verteilte Zeit
 */
export interface TimelineSegment {
  allocationId: string | null
  kind: 'bound' | 'floating' | 'open'
  start: Minutes
  end: Minutes
  minutes: Minutes
  left: number
  width: number
  /** Ragt über das Blockende hinaus (z.B. nachdem der Block gekürzt wurde). */
  overflow: boolean
}

export interface TimelineBlock {
  id: string
  /** Index in day.blocks (bei Gesamtzeit: 0). */
  index: number
  start: Minutes
  end: Minutes
  minutes: Minutes
  label: string
  running: boolean
  /** Position auf der Achse in %. */
  left: number
  width: number
  segments: TimelineSegment[]
  /** Summe der fest gebundenen Segmente. */
  boundMinutes: Minutes
}

export interface TimelineLayout {
  mode: 'clock' | 'total'
  axisStart: Minutes
  axisEnd: Minutes
  blocks: TimelineBlock[]
  breaks: { start: Minutes; end: Minutes; left: number; width: number }[]
}

/** Zeilen, die fest in einem Block liegen – in ihrer Listen-Reihenfolge. */
export function boundAllocations(allocations: Allocation[], blockId: string): Allocation[] {
  return allocations.filter((a) => a.blockId === blockId && a.mode === 'duration')
}

/**
 * Stempel-Blöcke als Balken. In jedem Block liegen die gebundenen Zeilen lückenlos
 * hintereinander; der freie Rest wird mit den übrigen Zeilen (Rest, %, …) und
 * der offenen Zeit gefüllt. Gibt null zurück, solange es nichts darzustellen gibt.
 */
export function layoutTimeline(day: Day, result: AllocationResult, nowMinutes: Minutes | null = null): TimelineLayout | null {
  const ranges = day.timeMode === 'total' ? totalRange(day) : blockRanges(day, nowMinutes)
  if (ranges.length === 0) return null

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const axisStart = sorted[0].start
  const axisEnd = Math.max(...sorted.map((r) => r.end))
  const axis = (start: Minutes, end: Minutes) => ({
    left: ((start - axisStart) / (axisEnd - axisStart)) * 100,
    width: ((end - start) / (axisEnd - axisStart)) * 100,
  })

  const blocks: TimelineBlock[] = sorted.map((r) => {
    const minutes = r.end - r.start
    const segment = (s: Omit<TimelineSegment, 'left' | 'width' | 'overflow'>): TimelineSegment => {
      const start = Math.min(s.start, r.end)
      const end = Math.min(s.end, r.end)
      return { ...s, left: ((start - r.start) / minutes) * 100, width: ((end - start) / minutes) * 100, overflow: s.end > r.end }
    }
    let cursor = r.start
    const segments = boundAllocations(day.allocations, r.id).map((a) => {
      const seg = segment({ allocationId: a.id, kind: 'bound', start: cursor, end: cursor + a.value, minutes: a.value })
      cursor += a.value
      return seg
    })
    return {
      id: r.id,
      index: r.index,
      start: r.start,
      end: r.end,
      minutes,
      label:
        day.timeMode === 'total'
          ? `Gesamtzeit ${formatDuration(minutes)}`
          : `${minutesToClock(r.start)}–${r.running ? 'jetzt' : minutesToClock(r.end)}`,
      running: r.running,
      ...axis(r.start, r.end),
      segments,
      boundMinutes: cursor - r.start,
    }
  })

  // Freien Platz der Blöcke der Reihe nach mit den nicht gebundenen Zeilen und der offenen Zeit füllen.
  const blockIds = new Set(blocks.map((b) => b.id))
  const floating: { allocationId: string | null; minutes: Minutes }[] = day.allocations
    .filter((a) => !(a.mode === 'duration' && a.blockId && blockIds.has(a.blockId)))
    .map((a) => ({ allocationId: a.id, minutes: result.minutes[a.id] ?? 0 }))
    .filter((p) => p.minutes > 0)
  if (result.open > 0) floating.push({ allocationId: null, minutes: result.open })

  let blockIndex = 0
  for (const piece of floating) {
    let remaining = piece.minutes
    while (remaining > 0 && blockIndex < blocks.length) {
      const block = blocks[blockIndex]
      const used = block.segments.reduce((s, seg) => Math.max(s, seg.end), block.start)
      const take = Math.min(remaining, block.end - used)
      if (take > 0) {
        block.segments.push({
          allocationId: piece.allocationId,
          kind: piece.allocationId === null ? 'open' : 'floating',
          start: used,
          end: used + take,
          minutes: take,
          left: ((used - block.start) / block.minutes) * 100,
          width: (take / block.minutes) * 100,
          overflow: false,
        })
        remaining -= take
      }
      if (block.end - used - take <= 0) blockIndex += 1
    }
  }

  const breaks = []
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start > sorted[i - 1].end) {
      breaks.push({ start: sorted[i - 1].end, end: sorted[i].start, ...axis(sorted[i - 1].end, sorted[i].start) })
    }
  }

  return { mode: day.timeMode === 'total' ? 'total' : 'clock', axisStart, axisEnd, blocks, breaks }
}

interface Range {
  id: string
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
    return [{ id: b.id, index, start, end, running }]
  })
}

function totalRange(day: Day): Range[] {
  return day.totalMinutes ? [{ id: TOTAL_BLOCK_ID, index: 0, start: 0, end: day.totalMinutes, running: false }] : []
}

/** Auf das Zieh-Raster runden. */
export function snapMinutes(minutes: Minutes): Minutes {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/**
 * Längste erlaubte Dauer für ein gebundenes Segment: Die folgenden Segmente
 * rücken nach, dürfen aber nicht über das Blockende hinaus.
 */
export function maxSegmentMinutes(allocations: Allocation[], allocationId: string, blockMinutes: Minutes): Minutes {
  const self = allocations.find((a) => a.id === allocationId)
  if (!self?.blockId) return blockMinutes
  const others = boundAllocations(allocations, self.blockId)
    .filter((a) => a.id !== allocationId)
    .reduce((s, a) => s + a.value, 0)
  return Math.max(blockMinutes - others, MIN_SEGMENT_MINUTES)
}

/** Neue Dauer eines Segments, begrenzt auf [MIN, max]. */
export function resizeSegment(allocations: Allocation[], allocationId: string, minutes: Minutes, blockMinutes: Minutes): Allocation[] {
  const max = maxSegmentMinutes(allocations, allocationId, blockMinutes)
  const value = Math.min(Math.max(Math.round(minutes), MIN_SEGMENT_MINUTES), max)
  return allocations.map((a) => (a.id === allocationId ? { ...a, value } : a))
}

/**
 * Fügt eine Zeile als gebundenes Segment in einen Block ein – vor dem Segment,
 * über dessen Mitte abgelegt wurde (sonst ans Ende des Blocks). Dauer = der
 * noch nicht fest belegte Platz im Block.
 * Gibt null zurück, wenn der Block schon voll belegt ist.
 */
export function insertSegment(
  allocations: Allocation[],
  block: Pick<TimelineBlock, 'id' | 'start' | 'minutes'>,
  dropMinute: Minutes,
  newAllocation: Omit<Allocation, 'mode' | 'value' | 'blockId'>,
): Allocation[] | null {
  const bound = boundAllocations(allocations, block.id)
  const free = block.minutes - bound.reduce((s, a) => s + a.value, 0)
  if (free < MIN_SEGMENT_MINUTES) return null

  let cursor = block.start
  const before = bound.find((a) => {
    const middle = cursor + a.value / 2
    cursor += a.value
    return dropMinute < middle
  })
  const created: Allocation = { ...newAllocation, mode: 'duration', value: free, blockId: block.id }
  if (!before) {
    // Hinter dem letzten Segment dieses Blocks einsortieren (Listen-Reihenfolge = Zeitleiste).
    const last = bound.at(-1)
    if (!last) return [...allocations, created]
    const i = allocations.indexOf(last)
    return [...allocations.slice(0, i + 1), created, ...allocations.slice(i + 1)]
  }
  const i = allocations.indexOf(before)
  return [...allocations.slice(0, i), created, ...allocations.slice(i)]
}
