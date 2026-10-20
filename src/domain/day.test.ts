import { describe, expect, it } from 'vitest'
import { emptyDay, summarizeDay } from './day'
import { blockDurations, TOTAL_BLOCK_ID } from './dayTotal'
import type { Allocation, Day } from './types'

const alloc = (id: string, mode: Allocation['mode'], value: number, blockId?: string): Allocation => ({
  id,
  projectId: id,
  activityTypeId: 'buero',
  mode,
  value,
  note: '',
  ...(blockId ? { blockId } : {}),
})

describe('summarizeDay mit „Rest im Block“', () => {
  const day: Day = {
    ...emptyDay('2026-10-20'),
    blocks: [
      { id: 'am', start: '07:00', end: '11:33' },
      { id: 'pm', start: '12:03', end: null },
    ],
    allocations: [alloc('a', 'duration', 60, 'am'), alloc('r', 'blockRest', 0, 'am'), alloc('n', 'blockRest', 0, 'pm')],
  }

  it('Blockdauern: ungültige/offene Blöcke fehlen, laufender Block bis jetzt, Gesamtzeit mit fester ID', () => {
    expect(blockDurations(day)).toEqual([{ id: 'am', minutes: 273 }])
    expect(blockDurations(day, 14 * 60)).toEqual([
      { id: 'am', minutes: 273 },
      { id: 'pm', minutes: 117 },
    ])
    expect(blockDurations({ ...emptyDay('2026-10-20'), timeMode: 'total', totalMinutes: 498 })).toEqual([
      { id: TOTAL_BLOCK_ID, minutes: 498 },
    ])
  })

  it('laufender Block: sein Blockrest wächst mit der Uhr', () => {
    expect(summarizeDay(day, 14 * 60).allocation.minutes).toEqual({ a: 60, r: 213, n: 117 })
    expect(summarizeDay(day, 15 * 60).allocation.minutes.n).toBe(177)
  })
})
