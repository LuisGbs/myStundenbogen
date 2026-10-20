import { describe, expect, it } from 'vitest'
import { resolveAllocations } from './allocation'
import { emptyDay } from './day'
import { workedMinutes } from './dayTotal'
import {
  attachToBlock,
  chronologicalOrder,
  detachFromTimeline,
  insertSegment,
  isOnTimeline,
  layoutTimeline,
  maxSegmentMinutes,
  resizeSegment,
  snapMinutes,
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
  const result = resolveAllocations(workedMinutes(day, now), day.allocations, day.fillStrategy)
  return layoutTimeline(day, result, now)
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
    const day = { ...twoBlocks, allocations: [alloc('a', 'duration', 60, 'geloescht'), alloc('b', 'rest', 0, 'am')] }
    const am = layout(day)!.blocks[0]
    expect(am.segments.map((s) => s.kind)).toEqual(['floating', 'floating'])
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
