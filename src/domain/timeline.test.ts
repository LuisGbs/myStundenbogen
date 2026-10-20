import { describe, expect, it } from 'vitest'
import { resolveAllocations } from './allocation'
import { emptyDay } from './day'
import { workedMinutes } from './dayTotal'
import { blockShareMinutes, layoutTimeline } from './timeline'
import type { Allocation, Day } from './types'

const alloc = (id: string, mode: Allocation['mode'], value = 0): Allocation => ({
  id,
  projectId: id,
  activityTypeId: 'buero',
  mode,
  value,
  note: '',
})

function layout(day: Day, now: number | null = null) {
  const result = resolveAllocations(workedMinutes(day, now), day.allocations, day.fillStrategy)
  return layoutTimeline(day, result, now)
}

const twoBlocks: Day = {
  ...emptyDay('2026-10-14'),
  blocks: [
    { id: 'b2', start: '12:45', end: '16:48' },
    { id: 'b1', start: '07:45', end: '12:00' },
  ],
}

describe('layoutTimeline', () => {
  it('liefert nichts, solange keine Zeit erfasst ist', () => {
    expect(layout(emptyDay('2026-10-14'))).toBeNull()
    expect(layout({ ...emptyDay('2026-10-14'), blocks: [{ id: 'x', start: '08:00', end: null }] })).toBeNull()
  })

  it('ordnet Blöcke nach Uhrzeit und erkennt die Pause', () => {
    const l = layout(twoBlocks)!
    expect(l.mode).toBe('clock')
    expect([l.axisStart, l.axisEnd]).toEqual([465, 1008])
    expect(l.blocks.map((b) => [b.index, b.label, b.minutes])).toEqual([
      [1, '07:45–12:00', 255],
      [0, '12:45–16:48', 243],
    ])
    expect(l.blocks[0].left).toBe(0)
    expect(l.breaks).toHaveLength(1)
    expect(l.breaks[0]).toMatchObject({ start: 720, end: 765 })
    expect(l.breaks[0].left + l.breaks[0].width + l.blocks[1].width).toBeCloseTo(100)
  })

  it('zeigt die Verteilung als Anteile der Arbeitszeit, Rest = offen', () => {
    const day = { ...twoBlocks, allocations: [alloc('a', 'duration', 200), alloc('b', 'duration', 120)] }
    const l = layout(day)!
    expect(l.segments.map((s) => [s.allocationId, s.start, s.minutes])).toEqual([
      ['a', 0, 200],
      ['b', 200, 120],
      [null, 320, 178],
    ])
    expect(l.segments[1].left).toBeCloseTo((200 / 498) * 100)
    expect(l.segments.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100)
  })

  it('überbucht: Balken wird auf die gebuchte Summe skaliert', () => {
    const day = { ...twoBlocks, allocations: [alloc('a', 'duration', 600)] }
    const l = layout(day)!
    expect(l.segments).toEqual([expect.objectContaining({ allocationId: 'a', width: 100 })])
  })

  it('zeigt bei Gesamtzeit einen einzigen Balken', () => {
    const day: Day = { ...emptyDay('2026-10-14'), timeMode: 'total', totalMinutes: 498, allocations: [alloc('a', 'rest')] }
    const l = layout(day)!
    expect(l.mode).toBe('total')
    expect(l.blocks).toEqual([expect.objectContaining({ index: 0, minutes: 498, label: 'Gesamtzeit 8:18' })])
    expect(l.segments).toEqual([expect.objectContaining({ allocationId: 'a', minutes: 498, left: 0, width: 100 })])
  })

  it('zählt einen laufenden Block bis jetzt', () => {
    const day: Day = { ...emptyDay('2026-10-14'), blocks: [{ id: 'x', start: '08:00', end: null }] }
    const l = layout(day, 9 * 60)!
    expect(l.blocks[0]).toMatchObject({ minutes: 60, running: true, label: '08:00–jetzt' })
  })
})

describe('blockShareMinutes', () => {
  it('rechnet den Anteil in ganze Minuten um', () => {
    expect(blockShareMinutes(255, 50)).toBe(128) // ½ von 4:15 = 2:08
    expect(blockShareMinutes(255, 25)).toBe(64)
    expect(blockShareMinutes(255, 100)).toBe(255)
  })
})
