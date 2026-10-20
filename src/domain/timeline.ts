import type { AllocationResult } from './allocation'
import { dayRanges } from './dayTotal'
import { formatDuration, minutesToClock } from './duration'
import type { Allocation, Day, Minutes } from './types'

export { TOTAL_BLOCK_ID } from './dayTotal'

/** Raster beim Ziehen der Segment-Ränder. */
export const SNAP_MINUTES = 5

/** Kürzestes Segment, das per Ziehen entstehen kann. */
export const MIN_SEGMENT_MINUTES = 5

/**
 * Ein Segment in einem Block; start/end in Minuten (Uhrzeit bzw. ab 0 bei
 * Gesamtzeit), left/width in % des Blocks.
 * - bound:    Zeile ist an diesen Block gebunden (feste Dauer, Rand ziehbar)
 * - blockRest: Zeile bekommt den Rest dieses Blocks (wächst/schrumpft mit)
 * - floating: Zeile aus der Liste ohne Block (Rest, %, …) – füllt freien Platz
 * - open:     noch nicht verteilte Zeit
 */
export interface TimelineSegment {
  allocationId: string | null
  kind: 'bound' | 'blockRest' | 'floating' | 'open'
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
  /** Aus der Vorlage, noch nicht gestempelt. */
  planned: boolean
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

/** Alle Zeilen eines Blocks (feste Dauern und „Rest im Block“) – in ihrer Listen-Reihenfolge. */
export function blockAllocations(allocations: Allocation[], blockId: string): Allocation[] {
  return allocations.filter((a) => a.blockId === blockId && (a.mode === 'duration' || a.mode === 'rest'))
}

/** Summe der festen Dauern in einem Block (ohne die Zeile `exceptId`). */
function boundSum(allocations: Allocation[], blockId: string, exceptId?: string): Minutes {
  return boundAllocations(allocations, blockId)
    .filter((a) => a.id !== exceptId)
    .reduce((s, a) => s + a.value, 0)
}

/**
 * Stempel-Blöcke als Balken. In jedem Block liegen die gebundenen Zeilen lückenlos
 * hintereinander; der freie Rest wird mit den übrigen Zeilen (Rest, %, …) und
 * der offenen Zeit gefüllt. Gibt null zurück, solange es nichts darzustellen gibt.
 */
export function layoutTimeline(day: Day, result: AllocationResult, nowMinutes: Minutes | null = null): TimelineLayout | null {
  const ranges = dayRanges(day, nowMinutes)
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
    const segments: TimelineSegment[] = []
    for (const a of blockAllocations(day.allocations, r.id)) {
      const m = a.mode === 'duration' ? a.value : (result.minutes[a.id] ?? 0)
      if (m <= 0) continue
      const kind = a.mode === 'duration' ? 'bound' : 'blockRest'
      segments.push(segment({ allocationId: a.id, kind, start: cursor, end: cursor + m, minutes: m }))
      cursor += m
    }
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
      planned: r.planned,
      ...axis(r.start, r.end),
      segments,
      boundMinutes: boundSum(day.allocations, r.id),
    }
  })

  // Freien Platz der Blöcke der Reihe nach mit den nicht gebundenen Zeilen und der offenen Zeit füllen.
  const blockIds = new Set(blocks.map((b) => b.id))
  const floating: { allocationId: string | null; minutes: Minutes }[] = day.allocations
    .filter((a) => !isOnTimeline(a, blockIds))
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

/** Auf das Zieh-Raster runden. */
export function snapMinutes(minutes: Minutes): Minutes {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/**
 * Längste erlaubte Dauer für ein gebundenes Segment: Die folgenden Segmente
 * rücken nach, dürfen aber nicht über das Blockende hinaus. Ein „Rest im Block“
 * zählt nicht – er schrumpft einfach mit.
 */
export function maxSegmentMinutes(allocations: Allocation[], allocationId: string, blockMinutes: Minutes): Minutes {
  const self = allocations.find((a) => a.id === allocationId)
  if (!self?.blockId) return blockMinutes
  return Math.max(blockMinutes - boundSum(allocations, self.blockId, allocationId), MIN_SEGMENT_MINUTES)
}

/** Neue Dauer eines Segments, begrenzt auf [MIN, max]. */
export function resizeSegment(allocations: Allocation[], allocationId: string, minutes: Minutes, blockMinutes: Minutes): Allocation[] {
  const max = maxSegmentMinutes(allocations, allocationId, blockMinutes)
  const value = Math.min(Math.max(Math.round(minutes), MIN_SEGMENT_MINUTES), max)
  return allocations.map((a) => (a.id === allocationId ? { ...a, value } : a))
}

/**
 * Vor welcher Zeile landet etwas, das bei `dropMinute` in einen Block gezogen wird?
 * Vor dem ersten Segment (fest oder Blockrest), dessen Mitte hinter dem Ablegepunkt
 * liegt; null = ans Ende des Blocks. Die Zeile `selfId` (die gerade gezogen wird) zählt nicht.
 */
export function insertionBefore(
  segments: Pick<TimelineSegment, 'allocationId' | 'kind' | 'start' | 'end'>[],
  dropMinute: Minutes,
  selfId: string | null = null,
): string | null {
  const hit = segments.find(
    (s) => (s.kind === 'bound' || s.kind === 'blockRest') && s.allocationId !== selfId && dropMinute < (s.start + s.end) / 2,
  )
  return hit?.allocationId ?? null
}

/**
 * Setzt eine Zeile in die Liste: vor `beforeId`, sonst hinter die letzte Zeile des
 * Blocks `blockId`, sonst ans Ende. Die Reihenfolge im Array ist die Reihenfolge im Block.
 */
function place(list: Allocation[], item: Allocation, blockId: string | null, beforeId: string | null): Allocation[] {
  let i = beforeId ? list.findIndex((a) => a.id === beforeId) : -1
  if (i < 0 && blockId) {
    const last = list.findLastIndex((a) => a.blockId === blockId && (a.mode === 'duration' || a.mode === 'rest'))
    if (last >= 0) i = last + 1
  }
  if (i < 0) return [...list, item]
  return [...list.slice(0, i), item, ...list.slice(i)]
}

/**
 * Fügt eine Zeile als gebundenes Segment in einen Block ein – vor dem Segment,
 * über dessen Mitte abgelegt wurde (sonst ans Ende des Blocks). Dauer = der
 * noch nicht fest belegte Platz im Block; liegt dort ein „Rest im Block“,
 * bekommt das neue Segment die Hälfte davon.
 * Gibt null zurück, wenn der Block schon voll belegt ist.
 */
export function insertSegment(
  allocations: Allocation[],
  block: Pick<TimelineBlock, 'id' | 'start' | 'minutes'> & Partial<Pick<TimelineBlock, 'segments'>>,
  dropMinute: Minutes,
  newAllocation: Omit<Allocation, 'mode' | 'value' | 'blockId'>,
): Allocation[] | null {
  const free = block.minutes - boundSum(allocations, block.id)
  if (free < MIN_SEGMENT_MINUTES) return null
  const hasRest = blockAllocations(allocations, block.id).some((a) => a.mode === 'rest')
  const value = hasRest ? Math.min(free, Math.max(MIN_SEGMENT_MINUTES, snapMinutes(free / 2))) : free
  const segments =
    block.segments ??
    (() => {
      // Ohne Layout: Positionen aus den festen Dauern (Blockrest zählt hier mit 0).
      let cursor = block.start
      return blockAllocations(allocations, block.id).map((a) => {
        const m = a.mode === 'duration' ? a.value : 0
        const s = { allocationId: a.id, kind: 'bound' as const, start: cursor, end: cursor + m }
        cursor += m
        return s
      })
    })()
  const created: Allocation = { ...newAllocation, mode: 'duration', value, blockId: block.id }
  return place(allocations, created, block.id, insertionBefore(segments, dropMinute))
}

/** Liegt die Zeile auf der Zeitleiste (feste Dauer oder „Rest im Block“ in einem vorhandenen Block)? */
export function isOnTimeline(allocation: Allocation, blockIds: ReadonlySet<string>): boolean {
  return (
    (allocation.mode === 'duration' || allocation.mode === 'rest') && !!allocation.blockId && blockIds.has(allocation.blockId)
  )
}

/** Löst eine Zeile von der Zeitleiste (Dauer bleibt, Zeile ist danach fest/gesperrt; Blockrest wird Tages-Rest). */
export function detachFromTimeline(allocation: Allocation): Allocation {
  const { blockId: _removed, ...rest } = allocation
  return rest
}

/** Macht aus einer Zeile „Rest im Block“ des Blocks `blockId`. */
export function toBlockRest(allocation: Allocation, blockId: string): Allocation {
  return { ...allocation, mode: 'rest', value: 0, blockId }
}

/** Ziel beim Verschieben: ein Block (oder null = „Ohne Zeitleiste“) und die Zeile, vor der es landet. */
export interface MoveTarget {
  blockId: string | null
  beforeId: string | null
}

/**
 * Verschiebt eine Zeile – in der Zeitleiste oder per Griff in der Liste.
 * - In einen Block: Feste Dauer behält ihren Wert (in einem anderen Block höchstens
 *   der dort freie Platz), „Rest im Block“ wechselt nur den Block, eine gesperrte
 *   Zeile (h:mm, %, Rest) wird zur festen Dauer mit `resolvedMinutes`.
 * - Nach „Ohne Zeitleiste“ (blockId null): Zeile wird gelöst.
 * Gibt null zurück, wenn im Zielblock kein Platz ist.
 */
export function moveAllocation(
  allocations: Allocation[],
  allocationId: string,
  target: MoveTarget,
  blocks: Pick<TimelineBlock, 'id' | 'minutes'>[],
  resolvedMinutes: Minutes | null,
): Allocation[] | null {
  const self = allocations.find((a) => a.id === allocationId)
  if (!self) return null
  if (target.beforeId === allocationId) return allocations
  const others = allocations.filter((a) => a.id !== allocationId)
  const blockIds = new Set(blocks.map((b) => b.id))

  if (target.blockId === null) {
    return place(others, isOnTimeline(self, blockIds) ? detachFromTimeline(self) : self, null, target.beforeId)
  }
  const block = blocks.find((b) => b.id === target.blockId)
  if (!block) return null

  let moved: Allocation
  if (self.mode === 'rest' && isOnTimeline(self, blockIds)) {
    moved = { ...self, blockId: block.id }
  } else if (self.mode === 'duration' && self.blockId === block.id) {
    moved = self
  } else {
    const free = block.minutes - boundSum(others, block.id)
    if (free < MIN_SEGMENT_MINUTES) return null
    const wanted = isOnTimeline(self, blockIds) ? self.value : Math.round(resolvedMinutes ?? 0)
    moved = { ...self, mode: 'duration', value: Math.max(MIN_SEGMENT_MINUTES, Math.min(wanted || free, free)), blockId: block.id }
  }
  return place(others, moved, block.id, target.beforeId)
}

/**
 * Hängt eine vorhandene Zeile hinten an einen Block an (Modus „Zeitleiste“).
 * Dauer = gewünschte Minuten, höchstens der freie Platz im Block.
 * Gibt null zurück, wenn im Block kein Platz ist.
 */
export function attachToBlock(
  allocations: Allocation[],
  allocationId: string,
  block: Pick<TimelineBlock, 'id' | 'minutes'>,
  wantedMinutes: Minutes,
): Allocation[] | null {
  return moveAllocation(allocations, allocationId, { blockId: block.id, beforeId: null }, [block], wantedMinutes)
}

/**
 * Reihenfolge für die Liste: erst die Zeilen auf der Zeitleiste in zeitlicher
 * Reihenfolge (Block für Block, im Block von links nach rechts), dann die übrigen.
 */
export function chronologicalOrder(allocations: Allocation[], blocks: Pick<TimelineBlock, 'id' | 'start'>[]): Allocation[] {
  const blockStart = new Map(blocks.map((b) => [b.id, b.start]))
  const ids = new Set(blockStart.keys())
  const onTimeline = allocations
    .map((a, index) => ({ a, index }))
    .filter(({ a }) => isOnTimeline(a, ids))
    .sort((x, y) => blockStart.get(x.a.blockId!)! - blockStart.get(y.a.blockId!)! || x.index - y.index)
    .map(({ a }) => a)
  return [...onTimeline, ...allocations.filter((a) => !isOnTimeline(a, ids))]
}
