import { describe, expect, it } from 'vitest'
import {
  applyAmountInput,
  applyDefaultFill,
  changeAllocationMode,
  formatAllocationValue,
  modeForNewAllocation,
  resolveAllocations,
  roundPreservingSum,
} from './allocation'
import type { Allocation, AllocationMode } from './types'

const row = (id: string, mode: AllocationMode, value = 0, projectId = id): Allocation => ({
  id,
  projectId,
  activityTypeId: 'buero',
  mode,
  value,
  note: '',
})

describe('roundPreservingSum', () => {
  it('rundet so, dass die Summe erhalten bleibt', () => {
    expect(roundPreservingSum([166, 166, 166])).toEqual([166, 166, 166])
    expect(roundPreservingSum([498 / 3, 498 / 3, 498 / 3])).toEqual([166, 166, 166])
    expect(roundPreservingSum([100 / 3, 100 / 3, 100 / 3])).toEqual([34, 33, 33])
    expect(roundPreservingSum([60, 10.5, 10.5])).toEqual([60, 11, 10])
  })
})

describe('resolveAllocations', () => {
  it('Beispiel: 50 % + 1:00 + Rest bei 8:18', () => {
    const r = resolveAllocations(
      498,
      [row('a', 'percent', 50), row('b', 'duration', 60), row('c', 'rest')],
      'none',
    )
    expect(r.minutes).toEqual({ a: 249, b: 60, c: 189 })
    expect(r.allocated).toBe(498)
    expect(r.open).toBe(0)
    expect(r.status).toBe('ok')
  })

  it('mehrere Rest-Zeilen teilen sich den Rest, Summe bleibt exakt', () => {
    const r = resolveAllocations(500, [row('a', 'rest'), row('b', 'rest'), row('c', 'rest')], 'none')
    expect(Object.values(r.minutes)).toEqual([167, 167, 166])
    expect(r.allocated).toBe(500)
  })

  it('Prozent-Zeilen mit krummen Anteilen ergeben exakt die Tageszeit', () => {
    const r = resolveAllocations(
      499,
      [row('a', 'percent', 33.3), row('b', 'percent', 33.3), row('c', 'percent', 33.4)],
      'none',
    )
    expect(r.allocated).toBe(499)
    expect(r.status).toBe('ok')
  })

  it('meldet offene Zeit', () => {
    const r = resolveAllocations(498, [row('a', 'duration', 240)], 'none')
    expect(r.open).toBe(258)
    expect(r.status).toBe('open')
  })

  it('meldet Überbuchung, Rest-Zeile bekommt dann 0', () => {
    const r = resolveAllocations(480, [row('a', 'percent', 80), row('b', 'duration', 120), row('c', 'rest')], 'none')
    expect(r.minutes.c).toBe(0)
    expect(r.open).toBe(-24)
    expect(r.status).toBe('over')
  })

  it('verteilt proportional, wenn keine Rest-Zeile existiert', () => {
    const r = resolveAllocations(480, [row('a', 'duration', 120), row('b', 'duration', 240)], 'proportional')
    expect(r.minutes).toEqual({ a: 160, b: 320 })
    expect(r.status).toBe('ok')
  })

  it('Rest-Zeilen haben Vorrang vor proportionalem Auffüllen', () => {
    const r = resolveAllocations(480, [row('a', 'duration', 120), row('b', 'rest')], 'proportional')
    expect(r.minutes).toEqual({ a: 120, b: 360 })
  })

  it('ohne Tageszeit: nur feste Dauern sind berechenbar', () => {
    const r = resolveAllocations(null, [row('a', 'percent', 50), row('b', 'duration', 60), row('c', 'rest')], 'none')
    expect(r.minutes).toEqual({ a: null, b: 60, c: null })
    expect(r.status).toBe('no-total')
  })

  it('gerade eingestempelt (0:00): nichts als „vollständig“ melden', () => {
    expect(resolveAllocations(0, [row('a', 'rest')], 'none').status).toBe('empty')
    expect(resolveAllocations(0, [row('a', 'duration', 30)], 'none').status).toBe('over')
  })

  it('ohne Zeilen ist die ganze Tageszeit offen', () => {
    expect(resolveAllocations(498, [], 'none')).toMatchObject({ open: 498, status: 'open' })
    expect(resolveAllocations(null, [], 'none').status).toBe('empty')
  })
})

describe('Rest im Block', () => {
  const inBlock = (a: Allocation, blockId: string): Allocation => ({ ...a, blockId })
  const blocks = [
    { id: 'am', minutes: 267 },
    { id: 'pm', minutes: 267 },
  ]

  it('bekommt den freien Platz seines Blocks, der Tages-Rest den Rest des Tages', () => {
    const r = resolveAllocations(
      534,
      [inBlock(row('a', 'duration', 120), 'am'), inBlock(row('br', 'blockRest'), 'am'), row('p', 'percent', 10), row('tag', 'rest')],
      'none',
      blocks,
    )
    // br = 267 − 120 = 147; p = 53,4; tag = 534 − 120 − 147 − 53,4 = 213,6
    expect(r.minutes).toEqual({ a: 120, br: 147, p: 53, tag: 214 })
    expect(r.status).toBe('ok')
  })

  it('zwei Blockreste teilen sich den Block; überbuchter Block → 0', () => {
    const r = resolveAllocations(
      534,
      [
        inBlock(row('x', 'blockRest'), 'am'),
        inBlock(row('y', 'blockRest'), 'am'),
        inBlock(row('a', 'duration', 300), 'pm'),
        inBlock(row('z', 'blockRest'), 'pm'),
      ],
      'none',
      blocks,
    )
    expect(r.minutes).toEqual({ x: 134, y: 133, a: 300, z: 0 })
  })

  it('zieht alle festen Zeilen seines Blocks ab – auch h:mm und % ohne Blockangabe', () => {
    // a und p fließen in den Vormittag (dort ist Platz), br steht dahinter
    const r = resolveAllocations(534, [row('a', 'duration', 90), row('p', 'percent', 10), inBlock(row('br', 'blockRest'), 'am')], 'none', blocks)
    expect(r.blockOf).toEqual({ a: 'am', p: 'am', br: 'am' })
    expect(r.minutes.br).toBe(267 - 90 - 53)
  })

  it('unbekannter Block (z.B. gelöscht) → fließt in den Block mit Platz; ohne Blöcke wie Tages-Rest', () => {
    const r = resolveAllocations(534, [inBlock(row('a', 'duration', 34), 'am'), inBlock(row('r', 'blockRest'), 'weg')], 'none', blocks)
    expect(r.minutes.r).toBe(233)
    expect(resolveAllocations(534, [row('a', 'duration', 34), row('r', 'blockRest')], 'none').minutes.r).toBe(500)
  })
})

describe('changeAllocationMode', () => {
  it('behält beim Umschalten die berechnete Zeit bei', () => {
    const a = row('a', 'rest')
    expect(changeAllocationMode(a, 'duration', 249, 498)).toMatchObject({ mode: 'duration', value: 249 })
    expect(changeAllocationMode(a, 'percent', 249, 498)).toMatchObject({ mode: 'percent', value: 50 })
    expect(changeAllocationMode(row('b', 'duration', 60), 'rest', 60, 498)).toMatchObject({ mode: 'rest', value: 0 })
  })

  it('h:mm ↔ Zeitleiste behält Wert und Block; Block-Rest startet bei 0', () => {
    const fixed = { ...row('a', 'duration', 90), blockId: 'am' }
    expect(changeAllocationMode(fixed, 'timeline', 90, 498)).toEqual({ ...fixed, mode: 'timeline' })
    expect(changeAllocationMode({ ...fixed, mode: 'timeline' }, 'duration', 90, 498)).toEqual(fixed)
    expect(changeAllocationMode(row('p', 'percent', 10), 'timeline', 50, 498)).toMatchObject({ mode: 'timeline', value: 50 })
    expect(changeAllocationMode(fixed, 'blockRest', 90, 498)).toEqual({ ...fixed, mode: 'blockRest', value: 0 })
  })

  it('ohne Tageszeit wird Prozent mit 0 begonnen', () => {
    expect(changeAllocationMode(row('a', 'duration', 60), 'percent', 60, null)).toMatchObject({ value: 0 })
  })
})

describe('applyAmountInput', () => {
  it('nackte Zahl im %-Modus ist Prozent, sonst Stunden', () => {
    expect(applyAmountInput(row('a', 'percent', 100), '50')).toMatchObject({ mode: 'percent', value: 50 })
    expect(applyAmountInput(row('a', 'percent', 100), '33,3')).toMatchObject({ mode: 'percent', value: 33.3 })
    expect(applyAmountInput(row('a', 'rest'), '2')).toMatchObject({ mode: 'duration', value: 120 })
  })

  it('wechselt den Modus passend zur Eingabe', () => {
    expect(applyAmountInput(row('a', 'rest'), '50%')).toMatchObject({ mode: 'percent', value: 50 })
    expect(applyAmountInput(row('a', 'percent', 50), '1:30')).toMatchObject({ mode: 'duration', value: 90 })
    expect(applyAmountInput(row('a', 'duration', 60), 'rest')).toMatchObject({ mode: 'rest', value: 0 })
    // Zeitleiste und Block-Rest bleiben auf der Zeitleiste
    expect(applyAmountInput(row('a', 'timeline', 60), '.5')).toMatchObject({ mode: 'timeline', value: 30 })
    expect(applyAmountInput(row('a', 'blockRest'), '1:00')).toMatchObject({ mode: 'timeline', value: 60 })
    expect(applyAmountInput(row('a', 'blockRest'), '')).toMatchObject({ mode: 'blockRest' })
  })

  it('leeres Feld: Rest bleibt Rest, sonst 0', () => {
    expect(applyAmountInput(row('a', 'rest'), ' ')).toMatchObject({ mode: 'rest' })
    expect(applyAmountInput(row('a', 'duration', 60), '')).toMatchObject({ mode: 'duration', value: 0 })
  })

  it('lehnt Unsinn ab', () => {
    expect(applyAmountInput(row('a', 'duration', 60), 'abc')).toBeNull()
  })

  it('formatiert den Feldinhalt je Modus', () => {
    expect(formatAllocationValue(row('a', 'duration', 90))).toBe('1:30')
    expect(formatAllocationValue(row('a', 'percent', 50))).toBe('50 %')
    expect(formatAllocationValue(row('a', 'rest'))).toBe('')
  })
})

describe('Auffüllen-Helfer', () => {
  it('neue Zeile wird Rest-Zeile, solange es keine gibt', () => {
    expect(modeForNewAllocation([])).toBe('rest')
    expect(modeForNewAllocation([row('a', 'percent', 50)])).toBe('rest')
    expect(modeForNewAllocation([row('a', 'rest')])).toBe('duration')
  })

  it('Rest auf Standardprojekt: vorhandene Zeile wird Rest, sonst neue Zeile', () => {
    const target = { projectId: 'p1', activityTypeId: 'buero' }
    const existing = [row('a', 'duration', 60, 'p1')]
    expect(applyDefaultFill(existing, target, 'x')).toEqual([{ ...existing[0], mode: 'rest', value: 0 }])
    const added = applyDefaultFill([row('a', 'duration', 60, 'p2')], target, 'x')
    expect(added).toHaveLength(2)
    expect(added[1]).toMatchObject({ id: 'x', projectId: 'p1', mode: 'rest' })
    // Die Zeile bleibt an ihrem Platz (Block), wird aber Tages-Rest
    const onTimeline = applyDefaultFill([{ ...row('b', 'timeline', 60, 'p1'), blockId: 'am' }], target, 'x')
    expect(onTimeline[0]).toMatchObject({ mode: 'rest', blockId: 'am' })
    expect(modeForNewAllocation([row('r', 'blockRest')])).toBe('rest')
  })
})
