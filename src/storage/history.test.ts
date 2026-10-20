import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { collectBackup, restoreBackup } from './exportImport'
import { clearHistory, getHistoryState, recordDayChange, redo, undo } from './history'
import { updateDay } from './repo'
import { seedDefaults } from './seed'

const DATE = '2026-10-14'
const total = async () => (await db.days.get(DATE))?.totalMinutes ?? null
const pause = () => new Promise((r) => setTimeout(r, 1100))

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedDefaults()
  clearHistory()
})

describe('Rückgängig / Wiederholen', () => {
  it('stellt Vorher/Nachher exakt her – auch einen zuvor leeren Tag', async () => {
    await updateDay(DATE, (d) => ({ ...d, timeMode: 'total', totalMinutes: 480 }))
    await pause()
    await updateDay(DATE, (d) => ({ ...d, totalMinutes: 498 }))
    expect(await total()).toBe(498)

    expect(await undo()).toBe(DATE)
    expect(await total()).toBe(480)
    await undo()
    expect(await db.days.get(DATE)).toBeUndefined()
    expect(getHistoryState()).toEqual({ canUndo: false, canRedo: true })

    await redo()
    expect(await total()).toBe(480)
    await redo()
    expect(await total()).toBe(498)
    expect(getHistoryState()).toEqual({ canUndo: true, canRedo: false })
  })

  it('fasst schnelle Änderungen am selben Tag zu einem Schritt zusammen', async () => {
    await updateDay(DATE, (d) => ({ ...d, timeMode: 'total', totalMinutes: 480 }))
    await pause()
    for (const m of [485, 490, 495]) await updateDay(DATE, (d) => ({ ...d, totalMinutes: m }))
    await undo()
    expect(await total()).toBe(480)
  })

  it('ein Schritt umfasst höchstens 1 s ab seiner ersten Änderung', async () => {
    const day = (m: number) => ({ date: DATE, totalMinutes: m }) as never
    recordDayChange(DATE, null, day(1), 0)
    recordDayChange(DATE, day(1), day(2), 600)
    recordDayChange(DATE, day(2), day(3), 1200) // > 1 s nach dem Start → neuer Schritt
    recordDayChange(DATE, day(3), day(4), 1300)
    // zwei Schritte: [nichts → 2] und [2 → 4]
    await undo()
    expect(await total()).toBe(2)
    await undo()
    expect(await db.days.get(DATE)).toBeUndefined()
    expect(getHistoryState().canUndo).toBe(false)
  })

  it('zeichnet nichts auf, wenn sich nichts ändert', async () => {
    await updateDay(DATE, (d) => d)
    expect(getHistoryState().canUndo).toBe(false)
  })

  it('verwirft Wiederholen nach einer neuen Änderung', async () => {
    await updateDay(DATE, (d) => ({ ...d, timeMode: 'total', totalMinutes: 480 }))
    await undo()
    await updateDay(DATE, (d) => ({ ...d, timeMode: 'total', totalMinutes: 300 }))
    expect(getHistoryState().canRedo).toBe(false)
  })

  it('merkt sich höchstens 100 Schritte', async () => {
    for (let i = 0; i < 120; i++) recordDayChange(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, null, null, i * 2000)
    let count = 0
    while (getHistoryState().canUndo) {
      await undo()
      count++
    }
    expect(count).toBe(100)
  })

  it('Wiederherstellen einer Sicherung leert den Verlauf', async () => {
    await updateDay(DATE, (d) => ({ ...d, timeMode: 'total', totalMinutes: 480 }))
    await restoreBackup(await collectBackup())
    expect(getHistoryState()).toEqual({ canUndo: false, canRedo: false })
  })
})
