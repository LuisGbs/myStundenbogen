import { isFixedMode, type AllocationResult } from './allocation'
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
 * - bound:     Zeile im Modus „Zeitleiste“ (feste Dauer, verschieb- und ziehbar)
 * - blockRest: „Rest im Block“ (wächst/schrumpft mit, verschiebbar)
 * - floating:  gesperrte Zeile (h:mm, %, Rest) an ihrem Platz im Block
 * - spill:     Teil eines Tages-Rests, der in seinem eigenen Block keinen Platz hatte
 * - open:      noch nicht verteilte Zeit
 * - future:    laufender Block nach „jetzt“ bis zum voraussichtlichen Gehen (noch nicht vergangen)
 */
export interface TimelineSegment {
  allocationId: string | null
  kind: 'bound' | 'blockRest' | 'floating' | 'spill' | 'open' | 'future'
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
  /** Echtes Ende (beim laufenden Block: jetzt). */
  end: Minutes
  /** Echte Dauer – nur sie wird verteilt. */
  minutes: Minutes
  /** Angezeigte Dauer: beim laufenden Block bis zum voraussichtlichen Gehen (Bezug für left/width). */
  displayMinutes: Minutes
  label: string
  running: boolean
  /** Aus der Vorlage, noch nicht gestempelt. */
  planned: boolean
  /** Position auf der Achse in %. */
  left: number
  width: number
  segments: TimelineSegment[]
  /** Summe aller festen Zeilen im Block (h:mm, Zeitleiste, %) – ohne Rest und Block-Rest. */
  fixedMinutes: Minutes
}

export interface TimelineLayout {
  mode: 'clock' | 'total'
  axisStart: Minutes
  axisEnd: Minutes
  blocks: TimelineBlock[]
  breaks: { start: Minutes; end: Minutes; left: number; width: number }[]
}

/** Segmentart einer Zeile an ihrem Platz im Block. */
function kindOf(a: Allocation): TimelineSegment['kind'] {
  if (a.mode === 'timeline') return 'bound'
  if (a.mode === 'blockRest') return 'blockRest'
  return 'floating'
}

/**
 * Stempel-Blöcke als Balken. Jede Zeile steht in ihrem Block (result.blockOf) –
 * in der Reihenfolge der Liste. Ein Tages-Rest nimmt den freien Platz an seiner
 * Stelle; was dort nicht hineinpasst, füllt freien Platz anderer Blöcke.
 * `forecast`: Der laufende Block wird bis zum voraussichtlichen Gehen gezeichnet,
 * der Teil nach „jetzt“ als „future“ (verteilt wird nur bis jetzt).
 * Gibt null zurück, solange es nichts darzustellen gibt.
 */
export function layoutTimeline(
  day: Day,
  result: AllocationResult,
  nowMinutes: Minutes | null = null,
  forecast: { blockId: string; end: Minutes } | null = null,
): TimelineLayout | null {
  const displayEnd = (r: { id: string; end: Minutes }) =>
    forecast && forecast.blockId === r.id && forecast.end > r.end ? forecast.end : r.end
  const ranges = dayRanges(day, nowMinutes).filter((r) => displayEnd(r) > r.start)
  if (ranges.length === 0) return null

  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const axisStart = sorted[0].start
  const axisEnd = Math.max(...sorted.map(displayEnd))
  const axis = (start: Minutes, end: Minutes) => ({
    left: ((start - axisStart) / (axisEnd - axisStart)) * 100,
    width: ((end - start) / (axisEnd - axisStart)) * 100,
  })
  const minutesOf = (a: Allocation) => result.minutes[a.id] ?? 0

  const restLeft = new Map<string, { minutes: Minutes; blockIndex: number }>()
  const ends: Minutes[] = []

  const blocks: TimelineBlock[] = sorted.map((r, blockIndex) => {
    const minutes = r.end - r.start
    const shown = displayEnd(r) - r.start
    const segment = (s: Omit<TimelineSegment, 'left' | 'width' | 'overflow'>): TimelineSegment => {
      const start = Math.min(s.start, r.end)
      const end = Math.min(s.end, r.end)
      return { ...s, left: ((start - r.start) / shown) * 100, width: ((end - start) / shown) * 100, overflow: s.end > r.end }
    }
    const members = day.allocations.filter((a) => result.blockOf[a.id] === r.id)
    // Platz für Tages-Rest: was neben allen anderen Zeilen des Blocks frei bleibt
    let freeForRest = minutes - members.filter((a) => a.mode !== 'rest').reduce((s, a) => s + minutesOf(a), 0)
    let cursor = r.start
    const segments: TimelineSegment[] = []
    for (const a of members) {
      let m = minutesOf(a)
      if (a.mode === 'rest') {
        const take = Math.max(0, Math.min(m, freeForRest))
        freeForRest -= take
        if (m > take) restLeft.set(a.id, { minutes: m - take, blockIndex })
        m = take
      }
      if (m <= 0) continue
      segments.push(segment({ allocationId: a.id, kind: kindOf(a), start: cursor, end: cursor + m, minutes: m }))
      cursor += m
    }
    ends.push(cursor)
    return {
      id: r.id,
      index: r.index,
      start: r.start,
      end: r.end,
      minutes,
      displayMinutes: shown,
      label:
        day.timeMode === 'total'
          ? `Gesamtzeit ${formatDuration(minutes)}`
          : `${minutesToClock(r.start)}–${r.running ? 'jetzt' : minutesToClock(r.end)}${shown > minutes ? ` (bis ~${minutesToClock(r.start + shown)})` : ''}`,
      running: r.running,
      planned: r.planned,
      ...axis(r.start, displayEnd(r)),
      segments,
      fixedMinutes: members.filter((a) => isFixedMode(a.mode) || a.mode === 'percent').reduce((s, a) => s + minutesOf(a), 0),
    }
  })

  // Übrig gebliebene Tages-Rest-Teile in den freien Platz der anderen Blöcke (erst spätere, dann frühere).
  const piece = (block: TimelineBlock, allocationId: string | null, kind: TimelineSegment['kind'], start: Minutes, m: Minutes) =>
    block.segments.push({
      allocationId,
      kind,
      start,
      end: start + m,
      minutes: m,
      left: ((start - block.start) / block.displayMinutes) * 100,
      width: (m / block.displayMinutes) * 100,
      overflow: false,
    })
  for (const [allocationId, left] of restLeft) {
    let remaining = left.minutes
    const order = [...blocks.keys()].map((k) => (left.blockIndex + 1 + k) % blocks.length).filter((k) => k !== left.blockIndex)
    for (const k of order) {
      const take = Math.min(remaining, blocks[k].end - ends[k])
      if (take <= 0) continue
      piece(blocks[k], allocationId, 'spill', ends[k], take)
      ends[k] += take
      remaining -= take
      if (remaining <= 0) break
    }
  }
  blocks.forEach((b, k) => {
    if (ends[k] < b.end) piece(b, null, 'open', ends[k], b.end - ends[k])
    if (b.displayMinutes > b.minutes) piece(b, null, 'future', b.end, b.displayMinutes - b.minutes)
  })

  const breaks = []
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = displayEnd(sorted[i - 1])
    if (sorted[i].start > prevEnd) {
      breaks.push({ start: prevEnd, end: sorted[i].start, ...axis(prevEnd, sorted[i].start) })
    }
  }

  return { mode: day.timeMode === 'total' ? 'total' : 'clock', axisStart, axisEnd, blocks, breaks }
}

/** Auf das Zieh-Raster runden. */
export function snapMinutes(minutes: Minutes): Minutes {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/**
 * Längste erlaubte Dauer für ein Zeitleisten-Segment: Die übrigen festen Zeilen
 * des Blocks (auch gesperrte h:mm/%) rücken nach, dürfen aber nicht über das
 * Blockende hinaus. Rest und Block-Rest zählen nicht – sie schrumpfen mit.
 */
export function maxSegmentMinutes(block: Pick<TimelineBlock, 'minutes' | 'fixedMinutes'>, allocation: Allocation): Minutes {
  const own = isFixedMode(allocation.mode) ? allocation.value : 0
  return Math.max(block.minutes - (block.fixedMinutes - own), MIN_SEGMENT_MINUTES)
}

/** Neue Dauer eines Segments, begrenzt auf [MIN, max]. */
export function resizeSegment(allocations: Allocation[], allocationId: string, minutes: Minutes, maxMinutes: Minutes): Allocation[] {
  const value = Math.min(Math.max(Math.round(minutes), MIN_SEGMENT_MINUTES), maxMinutes)
  return allocations.map((a) => (a.id === allocationId ? { ...a, value } : a))
}

/**
 * Vor welcher Zeile landet etwas, das bei `dropMinute` in einen Block gezogen wird?
 * Vor der ersten Zeile des Blocks, deren Mitte hinter dem Ablegepunkt liegt;
 * null = ans Ende des Blocks. Die Zeile `selfId` (die gerade gezogen wird) zählt nicht.
 */
export function insertionBefore(
  segments: Pick<TimelineSegment, 'allocationId' | 'kind' | 'start' | 'end'>[],
  dropMinute: Minutes,
  selfId: string | null = null,
): string | null {
  const hit = segments.find(
    (s) =>
      (s.kind === 'bound' || s.kind === 'blockRest' || s.kind === 'floating') &&
      s.allocationId !== selfId &&
      dropMinute < (s.start + s.end) / 2,
  )
  return hit?.allocationId ?? null
}

/** Was Verschieben und Einfügen über die aktuelle Aufteilung wissen müssen. */
export interface PlacementContext {
  /** Block je Zeile (AllocationResult.blockOf). */
  blockOf: Record<string, string | null>
  /** Blöcke in zeitlicher Reihenfolge (TimelineLayout.blocks). */
  blocks: Pick<TimelineBlock, 'id' | 'minutes' | 'fixedMinutes'>[]
}

/** Schreibt den aktuellen Block jeder Zeile fest, damit beim Umsortieren nichts anderes umspringt. */
function withFixedBlocks(allocations: Allocation[], blockOf: Record<string, string | null>): Allocation[] {
  return allocations.map((a) => {
    const blockId = blockOf[a.id]
    return blockId && blockId !== a.blockId ? { ...a, blockId } : a
  })
}

/**
 * Setzt eine Zeile in die Liste: vor `beforeId`, sonst hinter die letzte Zeile ihres
 * Blocks bzw. der früheren Blöcke (das Array bleibt zeitlich sortiert), ohne Blöcke ans Ende.
 */
function place(list: Allocation[], item: Allocation, beforeId: string | null, blockOrder: string[]): Allocation[] {
  let i = beforeId ? list.findIndex((a) => a.id === beforeId) : -1
  if (i < 0 && item.blockId && blockOrder.includes(item.blockId)) {
    const rank = blockOrder.indexOf(item.blockId)
    i = list.findLastIndex((a) => a.blockId !== undefined && blockOrder.indexOf(a.blockId) <= rank && blockOrder.includes(a.blockId)) + 1
  }
  if (i < 0) return [...list, item]
  return [...list.slice(0, i), item, ...list.slice(i)]
}

/**
 * Fügt ein neues Projekt als Zeitleisten-Segment in einen Block ein – vor der Zeile,
 * über deren Mitte abgelegt wurde (sonst ans Ende des Blocks). Dauer = der noch
 * nicht fest belegte Platz im Block; liegt dort ein „Rest im Block“, die Hälfte davon.
 * Gibt null zurück, wenn der Block schon voll belegt ist.
 */
export function insertSegment(
  allocations: Allocation[],
  blockId: string,
  beforeId: string | null,
  newAllocation: Omit<Allocation, 'mode' | 'value' | 'blockId'>,
  ctx: PlacementContext,
): Allocation[] | null {
  const block = ctx.blocks.find((b) => b.id === blockId)
  if (!block) return null
  const free = block.minutes - block.fixedMinutes
  if (free < MIN_SEGMENT_MINUTES) return null
  const hasBlockRest = allocations.some((a) => a.mode === 'blockRest' && ctx.blockOf[a.id] === blockId)
  const value = hasBlockRest ? Math.min(free, Math.max(MIN_SEGMENT_MINUTES, snapMinutes(free / 2))) : free
  const created: Allocation = { ...newAllocation, mode: 'timeline', value, blockId }
  return place(withFixedBlocks(allocations, ctx.blockOf), created, beforeId, ctx.blocks.map((b) => b.id))
}

/** Ziel beim Verschieben: ein Block (null = Tag ohne Blöcke) und die Zeile, vor der es landet. */
export interface MoveTarget {
  blockId: string | null
  beforeId: string | null
}

/**
 * Verschiebt eine Zeile – in der Zeitleiste oder per Griff in der Liste. Modus und
 * Wert bleiben; nur eine Zeitleisten-Zeile wird in einem anderen Block auf den dort
 * freien Platz begrenzt (null, wenn dort kein Platz ist).
 */
export function moveAllocation(
  allocations: Allocation[],
  allocationId: string,
  target: MoveTarget,
  ctx: PlacementContext,
): Allocation[] | null {
  const self = allocations.find((a) => a.id === allocationId)
  if (!self) return null
  if (target.beforeId === allocationId) return allocations
  const fixed = withFixedBlocks(allocations, ctx.blockOf)
  const others = fixed.filter((a) => a.id !== allocationId)
  const order = ctx.blocks.map((b) => b.id)
  let moved = fixed.find((a) => a.id === allocationId)!

  if (target.blockId !== null) {
    const block = ctx.blocks.find((b) => b.id === target.blockId)
    if (!block) return null
    if (moved.mode === 'timeline' && ctx.blockOf[allocationId] !== block.id) {
      const free = block.minutes - block.fixedMinutes
      if (free < MIN_SEGMENT_MINUTES) return null
      moved = { ...moved, value: Math.max(MIN_SEGMENT_MINUTES, Math.min(moved.value, free)) }
    }
    moved = { ...moved, blockId: block.id }
  }
  return place(others, moved, target.beforeId, order)
}

/**
 * Reihenfolge für die Liste: Block für Block in zeitlicher Reihenfolge, im Block
 * in Listen-Reihenfolge (ohne Blöcke: unverändert).
 */
export function chronologicalOrder(
  allocations: Allocation[],
  blockOf: Record<string, string | null>,
  blocks: Pick<TimelineBlock, 'id'>[],
): Allocation[] {
  const rank = new Map(blocks.map((b, i) => [b.id, i]))
  const rankOf = (a: Allocation) => rank.get(blockOf[a.id] ?? '') ?? blocks.length
  return allocations
    .map((a, index) => ({ a, index }))
    .sort((x, y) => rankOf(x.a) - rankOf(y.a) || x.index - y.index)
    .map(({ a }) => a)
}
