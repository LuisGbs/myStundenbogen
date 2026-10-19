import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { analyzeBlocks, workedMinutes } from './dayTotal'
import type { TimeBlock } from './types'

const block = (id: string, start: string, end: string | null): TimeBlock => ({ id, start, end })

describe('analyzeBlocks', () => {
  it('summiert mehrere Blöcke, Lücken sind Pausen', () => {
    const r = analyzeBlocks([block('a', '07:45', '12:00'), block('b', '12:45', '16:48')])
    expect(r.perBlock).toEqual([255, 243])
    expect(r.total).toBe(498)
    expect(r.issues).toEqual([])
  })

  it('meldet Ende vor Beginn', () => {
    const r = analyzeBlocks([block('a', '12:00', '08:00')])
    expect(r.total).toBe(0)
    expect(r.issues).toEqual([{ kind: 'end-before-start', blockId: 'a' }])
  })

  it('meldet Überschneidungen', () => {
    const r = analyzeBlocks([block('a', '08:00', '12:00'), block('b', '11:30', '13:00')])
    expect(r.issues).toEqual([{ kind: 'overlap', blockIds: ['a', 'b'] }])
  })

  it('zählt einen laufenden Block bis jetzt, wenn „jetzt“ bekannt ist', () => {
    const r = analyzeBlocks([block('a', '08:00', null)], 10 * 60 + 30)
    expect(r.total).toBe(150)
    expect(r.running).toBe(true)
  })

  it('markiert einen offenen Block an einem vergangenen Tag', () => {
    const r = analyzeBlocks([block('a', '08:00', null)])
    expect(r.total).toBe(0)
    expect(r.issues).toEqual([{ kind: 'open', blockId: 'a' }])
  })
})

describe('workedMinutes', () => {
  it('ist null, solange nichts eingetragen ist', () => {
    expect(workedMinutes(emptyDay('2026-10-19'))).toBeNull()
    expect(workedMinutes({ ...emptyDay('2026-10-19'), timeMode: 'total' })).toBeNull()
  })

  it('nutzt je nach Modus Blöcke oder Gesamtzeit', () => {
    const day = {
      ...emptyDay('2026-10-19'),
      blocks: [block('a', '08:00', '12:00')],
      totalMinutes: 498,
    }
    expect(workedMinutes(day)).toBe(240)
    expect(workedMinutes({ ...day, timeMode: 'total' })).toBe(498)
  })
})
