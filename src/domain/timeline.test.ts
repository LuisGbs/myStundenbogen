import { describe, expect, it } from 'vitest'
import { changeAllocationMode } from './allocation'
import { emptyDay, summarizeDay } from './day'
import {
  chronologicalOrder,
  insertionBefore,
  insertSegment,
  layoutTimeline,
  maxSegmentMinutes,
  moveAllocation,
  resizeSegment,
  snapMinutes,
  TOTAL_BLOCK_ID,
  type PlacementContext,
} from './timeline'
import type { Allocation, Day } from './types'

const alloc = (id: string, mode: Allocation['mode'], value = 0, blockId?: string): Allocation => ({
  id,
  projectId: id,
  activityTypeId: 'buero',
  mode,
  value,
  note: '',
  ...(blockId ? { blockId } : {}),
})

function layout(day: Day, now: number | null = null) {
  return layoutTimeline(day, summarizeDay(day, now).allocation, now)
}

/** Kontext für Verschieben/Einfügen aus dem aktuellen Stand des Tages. */
function ctxOf(day: Day): PlacementContext {
  return { blockOf: summarizeDay(day).allocation.blockOf, blocks: layout(day)!.blocks }
}

const segs = (day: Day, i: number) => layout(day)!.blocks[i].segments.map((s) => [s.kind, s.allocationId, s.minutes])

// Vormittag 07:45–12:00 (255 min), Nachmittag 12:45–16:48 (243 min)
const twoBlocks: Day = {
  ...emptyDay('2026-10-14'),
  blocks: [
    { id: 'pm', start: '12:45', end: '16:48' },
    { id: 'am', start: '07:45', end: '12:00' },
  ],
}
const withRows = (allocations: Allocation[]): Day => ({ ...twoBlocks, allocations })

describe('layoutTimeline', () => {
  it('liefert nichts, solange keine Zeit erfasst ist', () => {
    expect(layout(emptyDay('2026-10-14'))).toBeNull()
    expect(layout({ ...emptyDay('2026-10-14'), blocks: [{ id: 'x', start: '08:00', end: null }] })).toBeNull()
  })

  it('ordnet Blöcke nach Uhrzeit und erkennt die Pause', () => {
    const l = layout(twoBlocks)!
    expect([l.axisStart, l.axisEnd]).toEqual([465, 1008])
    expect(l.blocks.map((b) => [b.id, b.index, b.label, b.minutes])).toEqual([
      ['am', 1, '07:45–12:00', 255],
      ['pm', 0, '12:45–16:48', 243],
    ])
    expect(l.breaks).toEqual([expect.objectContaining({ start: 720, end: 765 })])
  })

  it('jede Zeile steht an ihrem Listenplatz im Block – egal welcher Modus', () => {
    const day = withRows([
      alloc('h', 'duration', 60, 'am'),
      alloc('z', 'timeline', 90, 'am'),
      alloc('p', 'percent', 10, 'am'), // 10 % von 8:18 = 50 min
      alloc('n', 'timeline', 30, 'pm'),
    ])
    const [am, pm] = layout(day)!.blocks
    expect(am.segments.map((s) => [s.kind, s.allocationId, s.start, s.minutes])).toEqual([
      ['floating', 'h', 465, 60],
      ['bound', 'z', 525, 90],
      ['floating', 'p', 615, 50],
      ['open', null, 665, 55],
    ])
    expect(am.fixedMinutes).toBe(200)
    expect(am.segments[1].left).toBeCloseTo((60 / 255) * 100)
    expect(pm.segments[0]).toMatchObject({ allocationId: 'n', start: 765, end: 795 })
  })

  it('Zeilen ohne Block fließen: in den Block mit Platz, ist er voll, in den nächsten', () => {
    const day = withRows([alloc('a', 'duration', 200), alloc('b', 'duration', 100), alloc('c', 'duration', 30)])
    expect(segs(day, 0)).toEqual([
      ['floating', 'a', 200],
      ['floating', 'b', 100], // ragt über das Blockende – b beginnt aber im Vormittag
    ])
    expect(layout(day)!.blocks[0].segments[1].overflow).toBe(true)
    expect(segs(day, 1)).toEqual([
      ['floating', 'c', 30],
      ['open', null, 213],
    ])
  })

  it('gelöschter Block → Zeile fließt wieder', () => {
    const day = withRows([alloc('a', 'timeline', 60, 'geloescht')])
    expect(segs(day, 0)).toEqual([
      ['bound', 'a', 60],
      ['open', null, 195],
    ])
  })

  it('Tages-Rest nimmt den Platz an seiner Stelle, der Rest geht in freien Platz anderer Blöcke', () => {
    const day = withRows([
      alloc('a', 'duration', 60, 'am'),
      alloc('r', 'rest', 0, 'am'),
      alloc('b', 'timeline', 30, 'am'),
      alloc('n', 'timeline', 43, 'pm'),
    ])
    // r = 498 − 60 − 30 − 43 = 365: 165 im Vormittag (zwischen a und b), 200 am Nachmittag
    expect(segs(day, 0)).toEqual([
      ['floating', 'a', 60],
      ['floating', 'r', 165],
      ['bound', 'b', 30],
    ])
    expect(segs(day, 1)).toEqual([
      ['bound', 'n', 43],
      ['spill', 'r', 200],
    ])
  })

  it('Gesamtzeit: ein Block mit fester ID, Zeilen mit alten Block-IDs fließen hinein', () => {
    const day: Day = {
      ...emptyDay('2026-10-14'),
      timeMode: 'total',
      totalMinutes: 498,
      allocations: [alloc('a', 'timeline', 120, 'am'), alloc('b', 'duration', 60)],
    }
    const [block] = layout(day)!.blocks
    expect(block).toMatchObject({ id: TOTAL_BLOCK_ID, label: 'Gesamtzeit 8:18' })
    expect(block.segments.map((s) => [s.kind, s.minutes])).toEqual([
      ['bound', 120],
      ['floating', 60],
      ['open', 318],
    ])
  })
})

describe('Screenshot-Fall: alles auf h:mm, dann umstellen', () => {
  // Vormittag 07:06–11:33 = 267 min, Nachmittag 12:07–16:30 = 263 min
  const day: Day = {
    ...emptyDay('2026-10-20'),
    blocks: [
      { id: 'am', start: '07:06', end: '11:33' },
      { id: 'pm', start: '12:07', end: '16:30' },
    ],
    allocations: [
      alloc('reinigung', 'duration', 90),
      alloc('epis', 'duration', 45),
      alloc('revit', 'duration', 90),
      alloc('epis2', 'percent', 6), // 6 % von 8:50 = 31,8 → 32 min
    ],
  }

  it('h:mm → Zeitleiste: Zeile bleibt an ihrem Platz und behält ihre Dauer', () => {
    const switched = {
      ...day,
      allocations: day.allocations.map((a) => (a.id === 'revit' ? changeAllocationMode(a, 'timeline', 90, 530) : a)),
    }
    expect(segs(switched, 0)).toEqual([
      ['floating', 'reinigung', 90],
      ['floating', 'epis', 45],
      ['bound', 'revit', 90],
      ['floating', 'epis2', 32],
      ['open', null, 10],
    ])
    const ctx = ctxOf(switched)
    expect(chronologicalOrder(switched.allocations, ctx.blockOf, ctx.blocks).map((a) => a.id)).toEqual([
      'reinigung',
      'epis',
      'revit',
      'epis2',
    ])
  })

  it('Block-Rest am Ende bekommt nur, was neben h:mm und % frei ist', () => {
    const withRest = { ...day, allocations: [...day.allocations, alloc('br', 'blockRest', 0, 'am')] }
    expect(summarizeDay(withRest).allocation.minutes.br).toBe(267 - 90 - 45 - 90 - 32)
    // h:mm-Zeile länger → Block-Rest schrumpft
    const longer = { ...withRest, allocations: withRest.allocations.map((a) => (a.id === 'epis' ? { ...a, value: 50 } : a)) }
    expect(summarizeDay(longer).allocation.minutes.br).toBe(5)
  })
})

describe('Segmente ziehen', () => {
  const day = withRows([
    alloc('orange', 'timeline', 60, 'am'),
    alloc('fest', 'duration', 40, 'am'),
    alloc('violett', 'timeline', 90, 'am'),
    alloc('x', 'rest'),
  ])
  const am = () => layout(day)!.blocks[0]

  it('Länger ziehen geht nur, bis die übrigen festen Zeilen ans Blockende stoßen (auch gesperrte)', () => {
    const orange = day.allocations[0]
    expect(maxSegmentMinutes(am(), orange)).toBe(255 - 40 - 90)
    expect(resizeSegment(day.allocations, 'orange', 400, maxSegmentMinutes(am(), orange))[0].value).toBe(125)
  })

  it('Kürzer ziehen: nicht unter 5 Minuten', () => {
    expect(resizeSegment(day.allocations, 'orange', 2, 125)[0].value).toBe(5)
    expect(resizeSegment(day.allocations, 'orange', 30, 125)[0].value).toBe(30)
  })

  it('rastet auf 5 Minuten ein', () => {
    expect(snapMinutes(62)).toBe(60)
    expect(snapMinutes(63)).toBe(65)
  })
})

describe('insertSegment', () => {
  const base = { id: 'neu', projectId: 'p', activityTypeId: 'buero', note: '' }

  it('bekommt den noch freien Platz des Blocks und landet hinter dessen Zeilen', () => {
    const day = withRows([alloc('a', 'duration', 60, 'am'), alloc('pm', 'timeline', 30, 'pm'), alloc('r', 'rest', 0, 'pm')])
    const next = insertSegment(day.allocations, 'am', null, base, ctxOf(day))!
    expect(next.map((a) => a.id)).toEqual(['a', 'neu', 'pm', 'r'])
    expect(next[1]).toMatchObject({ mode: 'timeline', value: 195, blockId: 'am' })
  })

  it('vor einer Zeile abgelegt → davor; leerer Nachmittag → hinter die Vormittagszeilen', () => {
    const day = withRows([alloc('a', 'timeline', 60, 'am'), alloc('b', 'duration', 60, 'am')])
    expect(insertSegment(day.allocations, 'am', 'a', base, ctxOf(day))!.map((a) => a.id)).toEqual(['neu', 'a', 'b'])
    const pm = insertSegment(day.allocations, 'pm', null, base, ctxOf(day))!
    expect(pm.map((a) => [a.id, a.blockId])).toEqual([
      ['a', 'am'],
      ['b', 'am'],
      ['neu', 'pm'],
    ])
  })

  it('voller Block → null; mit „Rest im Block“ → die Hälfte des freien Platzes', () => {
    const full = withRows([alloc('a', 'duration', 255, 'am')])
    expect(insertSegment(full.allocations, 'am', null, base, ctxOf(full))).toBeNull()
    const withRest = withRows([alloc('a', 'duration', 55, 'am'), alloc('r', 'blockRest', 0, 'am')])
    expect(insertSegment(withRest.allocations, 'am', null, base, ctxOf(withRest))!.at(-1)).toMatchObject({ value: 100 })
  })
})

describe('Verschieben', () => {
  const day = withRows([
    alloc('orange', 'timeline', 120, 'am'),
    alloc('fest', 'duration', 30),
    alloc('violett', 'timeline', 82, 'am'),
    alloc('revit', 'timeline', 60, 'pm'),
    alloc('weiter', 'duration', 50, 'pm'),
  ])
  const ids = (l: Allocation[] | null) => l!.map((a) => a.id)

  it('Ablegepunkt → vor welcher Zeile (offen und Überlauf zählen nicht)', () => {
    const list = [
      { allocationId: 'a', kind: 'floating' as const, start: 0, end: 60 },
      { allocationId: 'r', kind: 'blockRest' as const, start: 60, end: 100 },
      { allocationId: 'x', kind: 'spill' as const, start: 100, end: 150 },
      { allocationId: null, kind: 'open' as const, start: 150, end: 200 },
    ]
    expect(insertionBefore(list, 10)).toBe('a')
    expect(insertionBefore(list, 31)).toBe('r')
    expect(insertionBefore(list, 90)).toBeNull()
    expect(insertionBefore(list, 10, 'a')).toBe('r')
  })

  it('gesperrte Zeile per Griff ans Blockende – Modus und Wert bleiben', () => {
    const next = moveAllocation(day.allocations, 'fest', { blockId: 'am', beforeId: null }, ctxOf(day))!
    expect(ids(next)).toEqual(['orange', 'violett', 'fest', 'revit', 'weiter'])
    expect(next[2]).toMatchObject({ mode: 'duration', value: 30, blockId: 'am' })
  })

  it('im Block umsortieren', () => {
    const next = moveAllocation(day.allocations, 'weiter', { blockId: 'pm', beforeId: 'revit' }, ctxOf(day))
    expect(ids(next)).toEqual(['orange', 'fest', 'violett', 'weiter', 'revit'])
  })

  it('in den anderen Block: Zeitleiste wird auf den freien Platz begrenzt, h:mm bleibt (ggf. überbucht)', () => {
    const big = withRows([alloc('x', 'duration', 200, 'pm'), alloc('o', 'timeline', 120, 'am'), alloc('h', 'duration', 100, 'am')])
    const moved = moveAllocation(big.allocations, 'o', { blockId: 'pm', beforeId: 'x' }, ctxOf(big))!
    expect(moved[0]).toMatchObject({ id: 'o', blockId: 'pm', value: 43 })
    const locked = moveAllocation(big.allocations, 'h', { blockId: 'pm', beforeId: null }, ctxOf(big))!
    expect(locked.find((a) => a.id === 'h')).toMatchObject({ blockId: 'pm', value: 100 })
    const full = withRows([alloc('x', 'duration', 243, 'pm'), alloc('a', 'timeline', 60, 'am')])
    expect(moveAllocation(full.allocations, 'a', { blockId: 'pm', beforeId: null }, ctxOf(full))).toBeNull()
  })

  it('schreibt beim Verschieben die Blöcke fest – nichts anderes springt um', () => {
    // c fließt in den Nachmittag, weil der Vormittag voll ist
    const flow = withRows([alloc('a', 'duration', 255), alloc('c', 'duration', 30), alloc('m', 'timeline', 5, 'am')])
    expect(ctxOf(flow).blockOf).toEqual({ a: 'am', c: 'pm', m: 'am' })
    const next = moveAllocation(flow.allocations, 'm', { blockId: 'pm', beforeId: null }, ctxOf(flow))!
    expect(next.map((a) => [a.id, a.blockId])).toEqual([
      ['a', 'am'],
      ['c', 'pm'],
      ['m', 'pm'],
    ])
  })
})
