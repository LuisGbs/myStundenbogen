import { describe, expect, it } from 'vitest'
import { emptyDay, summarizeDay } from './day'
import {
  attachToBlock,
  chronologicalOrder,
  detachFromTimeline,
  insertionBefore,
  insertSegment,
  isOnTimeline,
  layoutTimeline,
  maxSegmentMinutes,
  moveAllocation,
  resizeSegment,
  snapMinutes,
  toBlockRest,
  TOTAL_BLOCK_ID,
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

// Vormittag 07:45–12:00 (255 min), Nachmittag 12:45–16:48 (243 min)
const twoBlocks: Day = {
  ...emptyDay('2026-10-14'),
  blocks: [
    { id: 'pm', start: '12:45', end: '16:48' },
    { id: 'am', start: '07:45', end: '12:00' },
  ],
}

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

  it('legt gebundene Segmente lückenlos hintereinander in ihren Block', () => {
    const day = {
      ...twoBlocks,
      allocations: [alloc('orange', 'duration', 60, 'am'), alloc('violett', 'duration', 90, 'am'), alloc('nm', 'duration', 30, 'pm')],
    }
    const [am, pm] = layout(day)!.blocks
    expect(am.segments.filter((s) => s.kind === 'bound').map((s) => [s.allocationId, s.start, s.end])).toEqual([
      ['orange', 465, 525],
      ['violett', 525, 615],
    ])
    expect(am.boundMinutes).toBe(150)
    expect(am.segments[1].left).toBeCloseTo((60 / 255) * 100)
    expect(pm.segments[0]).toMatchObject({ allocationId: 'nm', start: 765, end: 795 })
  })

  it('füllt freien Platz mit Rest-/%-Zeilen und offener Zeit', () => {
    const day = { ...twoBlocks, allocations: [alloc('a', 'duration', 60, 'am'), alloc('r', 'percent', 50)] }
    const [am, pm] = layout(day)!.blocks
    // r = 50 % von 8:18 = 249 min: 195 im freien Vormittag, 54 am Nachmittag; Rest offen
    expect(am.segments.map((s) => [s.kind, s.allocationId, s.minutes])).toEqual([
      ['bound', 'a', 60],
      ['floating', 'r', 195],
    ])
    expect(pm.segments.map((s) => [s.kind, s.allocationId, s.minutes])).toEqual([
      ['floating', 'r', 54],
      ['open', null, 189],
    ])
  })

  it('markiert Segmente, die nach dem Kürzen des Blocks nicht mehr hineinpassen', () => {
    const day = { ...twoBlocks, allocations: [alloc('a', 'duration', 200, 'am'), alloc('b', 'duration', 100, 'am')] }
    const am = layout(day)!.blocks[0]
    expect(am.segments.map((s) => s.overflow)).toEqual([false, true])
    expect(am.segments[1].left + am.segments[1].width).toBeCloseTo(100)
  })

  it('Zeilen mit unbekanntem Block oder anderem Modus gelten als frei verteilt', () => {
    const day = {
      ...twoBlocks,
      allocations: [alloc('a', 'duration', 60, 'geloescht'), alloc('b', 'rest', 0, 'geloescht'), alloc('c', 'percent', 10, 'am')],
    }
    const am = layout(day)!.blocks[0]
    expect(am.segments.map((s) => [s.kind, s.allocationId])).toEqual([
      ['floating', 'a'],
      ['floating', 'b'],
    ])
  })

  it('„Rest im Block“ füllt seinen Block an seiner Position und wächst/schrumpft mit', () => {
    const day = {
      ...twoBlocks,
      allocations: [
        alloc('a', 'duration', 60, 'am'),
        alloc('rest', 'rest', 0, 'am'),
        alloc('b', 'duration', 30, 'am'),
        alloc('tag', 'rest'),
      ],
    }
    const [am, pm] = layout(day)!.blocks
    expect(am.segments.map((s) => [s.kind, s.allocationId, s.start, s.minutes])).toEqual([
      ['bound', 'a', 465, 60],
      ['blockRest', 'rest', 525, 165],
      ['bound', 'b', 690, 30],
    ])
    expect(am.boundMinutes).toBe(90)
    // Der Tages-Rest bekommt den ganzen Nachmittag
    expect(pm.segments.map((s) => [s.kind, s.allocationId, s.minutes])).toEqual([['floating', 'tag', 243]])
    // Segment davor verlängern → Blockrest schrumpft um genau den Betrag
    const longer = { ...day, allocations: resizeSegment(day.allocations, 'a', 100, 255) }
    expect(layout(longer)!.blocks[0].segments[1].minutes).toBe(125)
  })

  it('Gesamtzeit: ein Block mit fester ID', () => {
    const day: Day = {
      ...emptyDay('2026-10-14'),
      timeMode: 'total',
      totalMinutes: 498,
      allocations: [alloc('a', 'duration', 120, TOTAL_BLOCK_ID)],
    }
    const [block] = layout(day)!.blocks
    expect(block).toMatchObject({ id: TOTAL_BLOCK_ID, label: 'Gesamtzeit 8:18' })
    expect(block.segments.map((s) => [s.kind, s.minutes])).toEqual([
      ['bound', 120],
      ['open', 378],
    ])
  })
})

describe('Segmente ziehen', () => {
  const allocations = [alloc('orange', 'duration', 60, 'am'), alloc('violett', 'duration', 90, 'am'), alloc('x', 'rest')]

  it('Länger ziehen geht nur, bis das letzte Segment ans Blockende stößt', () => {
    expect(maxSegmentMinutes(allocations, 'orange', 255)).toBe(165)
    expect(resizeSegment(allocations, 'orange', 400, 255)[0].value).toBe(165)
    // violett behält seine Länge
    expect(resizeSegment(allocations, 'orange', 400, 255)[1].value).toBe(90)
  })

  it('Kürzer ziehen: nicht unter 5 Minuten', () => {
    expect(resizeSegment(allocations, 'orange', 2, 255)[0].value).toBe(5)
    expect(resizeSegment(allocations, 'orange', 30, 255)[0].value).toBe(30)
  })

  it('rastet auf 5 Minuten ein', () => {
    expect(snapMinutes(62)).toBe(60)
    expect(snapMinutes(63)).toBe(65)
  })
})

describe('insertSegment', () => {
  const block = { id: 'am', start: 465, minutes: 255 }
  const base = { id: 'neu', projectId: 'p', activityTypeId: 'buero', note: '' }

  it('bekommt den noch freien Platz des Blocks und landet hinter den vorhandenen Segmenten', () => {
    const list = [alloc('a', 'duration', 60, 'am'), alloc('pm', 'duration', 30, 'pm'), alloc('r', 'rest')]
    const next = insertSegment(list, block, 700, base)!
    expect(next.map((a) => a.id)).toEqual(['a', 'neu', 'pm', 'r'])
    expect(next[1]).toMatchObject({ mode: 'duration', value: 195, blockId: 'am' })
  })

  it('vor einem Segment abgelegt → wird davor eingefügt', () => {
    const list = [alloc('a', 'duration', 60, 'am'), alloc('b', 'duration', 60, 'am')]
    const next = insertSegment(list, block, 470, base)!
    expect(next.map((a) => a.id)).toEqual(['neu', 'a', 'b'])
  })

  it('voller Block → null', () => {
    expect(insertSegment([alloc('a', 'duration', 255, 'am')], block, 500, base)).toBeNull()
  })

  it('Block mit „Rest im Block“: neues Segment bekommt die Hälfte des freien Platzes', () => {
    const list = [alloc('a', 'duration', 55, 'am'), alloc('r', 'rest', 0, 'am')]
    const next = insertSegment(list, block, 700, base)!
    expect(next.map((a) => a.id)).toEqual(['a', 'r', 'neu'])
    expect(next[2]).toMatchObject({ value: 100, blockId: 'am' })
  })
})

describe('Segmente verschieben', () => {
  const blocks = [
    { id: 'am', start: 465, minutes: 255 },
    { id: 'pm', start: 765, minutes: 243 },
  ]
  const list = [
    alloc('orange', 'duration', 120, 'am'),
    alloc('violett', 'duration', 82, 'am'),
    alloc('revit', 'duration', 60, 'pm'),
    alloc('weiter', 'duration', 50, 'pm'),
    alloc('fest', 'duration', 30),
  ]
  const ids = (l: Allocation[] | null) => l!.map((a) => a.id)

  it('Ablegepunkt → vor welchem Segment', () => {
    const segs = [
      { allocationId: 'a', kind: 'bound' as const, start: 0, end: 60 },
      { allocationId: 'r', kind: 'blockRest' as const, start: 60, end: 100 },
      { allocationId: null, kind: 'open' as const, start: 100, end: 200 },
    ]
    expect(insertionBefore(segs, 10)).toBe('a')
    expect(insertionBefore(segs, 31)).toBe('r')
    expect(insertionBefore(segs, 90)).toBeNull()
    expect(insertionBefore(segs, 10, 'a')).toBe('r')
  })

  it('im Block umsortieren: Wert bleibt', () => {
    const next = moveAllocation(list, 'weiter', { blockId: 'pm', beforeId: 'revit' }, blocks, null)
    expect(ids(next)).toEqual(['orange', 'violett', 'weiter', 'revit', 'fest'])
    expect(next![2]).toEqual(list[3])
  })

  it('in den anderen Block: ans Ende, Dauer bleibt; zu wenig Platz → begrenzt', () => {
    const next = moveAllocation(list, 'violett', { blockId: 'pm', beforeId: null }, blocks, null)
    expect(ids(next)).toEqual(['orange', 'revit', 'weiter', 'violett', 'fest'])
    expect(next![3]).toMatchObject({ blockId: 'pm', value: 82 })
    const full = [alloc('x', 'duration', 200, 'pm'), ...list.slice(0, 2)]
    expect(moveAllocation(full, 'orange', { blockId: 'pm', beforeId: 'x' }, blocks, null)![0]).toMatchObject({
      id: 'orange',
      blockId: 'pm',
      value: 43,
    })
  })

  it('voller Zielblock → null', () => {
    const full = [alloc('x', 'duration', 243, 'pm'), alloc('a', 'duration', 60, 'am')]
    expect(moveAllocation(full, 'a', { blockId: 'pm', beforeId: null }, blocks, null)).toBeNull()
  })

  it('gesperrte Zeile auf die Zeitleiste holen und wieder lösen', () => {
    const on = moveAllocation(list, 'fest', { blockId: 'am', beforeId: 'violett' }, blocks, 30)!
    expect(ids(on)).toEqual(['orange', 'fest', 'violett', 'revit', 'weiter'])
    expect(on[1]).toMatchObject({ mode: 'duration', value: 30, blockId: 'am' })
    const off = moveAllocation(on, 'fest', { blockId: null, beforeId: null }, blocks, 30)!
    expect(off.at(-1)).toEqual(alloc('fest', 'duration', 30))
    // Prozent-Zeile → feste Dauer mit der berechneten Zeit
    const pct = moveAllocation([alloc('p', 'percent', 10)], 'p', { blockId: 'am', beforeId: null }, blocks, 50)!
    expect(pct[0]).toMatchObject({ mode: 'duration', value: 50, blockId: 'am' })
  })

  it('„Rest im Block“ wechselt nur den Block; gelöst wird es Tages-Rest', () => {
    const withRest = [...list, toBlockRest(alloc('r', 'duration', 10), 'am')]
    const moved = moveAllocation(withRest, 'r', { blockId: 'pm', beforeId: 'revit' }, blocks, 53)!
    expect(ids(moved)).toEqual(['orange', 'violett', 'r', 'revit', 'weiter', 'fest'])
    expect(moved[2]).toMatchObject({ mode: 'rest', value: 0, blockId: 'pm' })
    const off = moveAllocation(moved, 'r', { blockId: null, beforeId: null }, blocks, 53)!
    expect(off.at(-1)).toEqual(alloc('r', 'rest', 0))
  })
})

describe('Modus „Zeitleiste“', () => {
  const blocks = [
    { id: 'pm', start: 765, minutes: 243, end: 1008 },
    { id: 'am', start: 465, minutes: 255, end: 720 },
  ]

  it('sortiert die Liste zeitlich: Vormittag vor Nachmittag, im Block von links nach rechts, Rest danach', () => {
    const list = [
      alloc('revit', 'duration', 60, 'pm'),
      alloc('frei', 'percent', 20),
      alloc('reinigung', 'duration', 120, 'am'),
      alloc('boxer', 'duration', 60, 'am'),
      alloc('weg', 'duration', 30, 'geloescht'),
    ]
    expect(chronologicalOrder(list, blocks).map((a) => a.id)).toEqual(['reinigung', 'boxer', 'revit', 'frei', 'weg'])
  })

  it('lösen behält die Dauer, entfernt nur den Block', () => {
    const detached = detachFromTimeline(alloc('a', 'duration', 60, 'am'))
    expect(detached).toEqual(alloc('a', 'duration', 60))
    expect('blockId' in detached).toBe(false)
    expect(isOnTimeline(detached, new Set(['am']))).toBe(false)
  })

  it('anhängen: hinten in den Block, höchstens freier Platz', () => {
    const list = [alloc('x', 'duration', 200, 'am'), alloc('fest', 'duration', 90), alloc('y', 'duration', 10, 'pm')]
    const next = attachToBlock(list, 'fest', blocks[1], 90)!
    expect(next.map((a) => a.id)).toEqual(['x', 'fest', 'y'])
    expect(next[1]).toMatchObject({ mode: 'duration', blockId: 'am', value: 55 }) // nur 55 frei
    expect(attachToBlock(list, 'fest', blocks[0], 90)![2]).toMatchObject({ blockId: 'pm', value: 90 })
  })

  it('anhängen an vollen Block → null', () => {
    expect(attachToBlock([alloc('x', 'duration', 255, 'am'), alloc('f', 'rest')], 'f', blocks[1], 30)).toBeNull()
  })
})
