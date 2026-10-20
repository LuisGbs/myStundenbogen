import { describe, expect, it } from 'vitest'
import { assignBlocks } from './blockAssign'
import { upgradeAllocationV5 } from './legacy'
import type { Allocation } from './types'

const row = (id: string, mode: Allocation['mode'], value = 0, blockId?: string): Allocation => ({
  id,
  projectId: id,
  activityTypeId: 'buero',
  mode,
  value,
  note: '',
  ...(blockId ? { blockId } : {}),
})
const fixed = (a: Allocation) => (a.mode === 'rest' || a.mode === 'blockRest' ? null : a.value)
const blocks = [
  { id: 'am', minutes: 240 },
  { id: 'pm', minutes: 240 },
]

describe('assignBlocks', () => {
  it('ohne Blöcke: alles null', () => {
    expect(assignBlocks([row('a', 'duration', 60)], [], fixed)).toEqual({ a: null })
  })

  it('Zeilen ohne Block fließen in Listen-Reihenfolge, ein voller Block schiebt weiter', () => {
    const r = assignBlocks([row('a', 'duration', 200), row('b', 'duration', 40), row('c', 'duration', 10)], blocks, fixed)
    expect(r).toEqual({ a: 'am', b: 'am', c: 'pm' })
  })

  it('eine spätere Blockangabe setzt den Cursor; frühere Blockangaben bleiben gültig', () => {
    const r = assignBlocks([row('a', 'duration', 10, 'pm'), row('b', 'duration', 10), row('c', 'duration', 10, 'am')], blocks, fixed)
    expect(r).toEqual({ a: 'pm', b: 'pm', c: 'am' })
  })

  it('Rest füllt seinen Block – die nächste Zeile ohne Block kommt in den nächsten', () => {
    const r = assignBlocks([row('a', 'duration', 10), row('r', 'rest'), row('b', 'duration', 10)], blocks, fixed)
    expect(r).toEqual({ a: 'am', r: 'am', b: 'pm' })
  })

  it('unbekannte Block-ID (gelöscht) zählt wie keine; im letzten Block bleibt alles', () => {
    const r = assignBlocks([row('a', 'duration', 300, 'weg'), row('b', 'duration', 300), row('c', 'duration', 10)], blocks, fixed)
    expect(r).toEqual({ a: 'am', b: 'pm', c: 'pm' })
  })
})

describe('Datenstand 4 → 5', () => {
  it('feste Dauer bzw. Rest mit Block werden Zeitleiste bzw. Rest im Block; alles andere bleibt', () => {
    expect(upgradeAllocationV5(row('a', 'duration', 60, 'am'))).toEqual(row('a', 'timeline', 60, 'am'))
    expect(upgradeAllocationV5(row('r', 'rest', 0, 'am'))).toEqual(row('r', 'blockRest', 0, 'am'))
    expect(upgradeAllocationV5(row('h', 'duration', 60))).toEqual(row('h', 'duration', 60))
    expect(upgradeAllocationV5(row('p', 'percent', 10, 'am'))).toEqual(row('p', 'percent', 10, 'am'))
  })
})
