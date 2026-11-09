import { describe, expect, it } from 'vitest'
import { emptyDay, summarizeDay } from './day'
import { activeAllocation, runningBlockId, startWorkingOn, stopWorking } from './nowWorking'
import { clockIn } from './plan'
import type { Day } from './types'

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const epis = { projectId: 'epis', activityTypeId: 'buero' }
const revit = { projectId: 'revit', activityTypeId: 'buero' }

// Vormittag fertig gestempelt, Nachmittag läuft seit 12:00
const day: Day = {
  ...emptyDay('2026-10-20'),
  blocks: [
    { id: 'am', start: '07:00', end: '11:30' },
    { id: 'pm', start: '12:00', end: null },
  ],
}

describe('Gerade aktives Projekt', () => {
  it('nur mit laufendem Block', () => {
    expect(runningBlockId(day)).toBe('pm')
    expect(runningBlockId({ ...day, blocks: [day.blocks[0]] })).toBeNull()
    expect(startWorkingOn({ ...day, blocks: [day.blocks[0]] }, epis, at('13:00'), 'x').allocations).toEqual([])
  })

  it('läuft mit der Uhr mit; Wechsel hält das alte mit seiner Zeit an', () => {
    const d1 = startWorkingOn(day, epis, at('12:00'), 'e')
    expect(activeAllocation(d1)?.id).toBe('e')
    expect(summarizeDay(d1, at('13:15')).allocation.minutes.e).toBe(75)

    const d2 = startWorkingOn(d1, revit, at('13:15'), 'r')
    expect(d2.allocations.map((a) => [a.id, a.mode, a.value, a.blockId])).toEqual([
      ['e', 'timeline', 75, 'pm'],
      ['r', 'blockRest', 0, 'pm'],
    ])
    expect(summarizeDay(d2, at('14:00')).allocation.minutes).toEqual({ e: 75, r: 45 })
  })

  it('dasselbe Projekt noch einmal → bleibt aktiv; anhalten → feste Dauer, 0 Minuten → entfällt', () => {
    const d1 = startWorkingOn(day, epis, at('12:00'), 'e')
    expect(startWorkingOn(d1, epis, at('12:30'), 'x')).toBe(d1)
    expect(stopWorking(d1, at('12:40')).allocations[0]).toMatchObject({ mode: 'timeline', value: 40 })
    expect(stopWorking(d1, at('12:00')).allocations).toEqual([])
    expect(activeAllocation(stopWorking(d1, at('12:40')))).toBeNull()
  })

  it('neuer Abschnitt im selben Projekt (split): alter bleibt mit Zeit und Notiz, neuer läuft ohne Notiz', () => {
    const d1 = startWorkingOn(day, epis, at('12:00'), 'e')
    const noted = { ...d1, allocations: d1.allocations.map((a) => ({ ...a, note: 'Pläne prüfen' })) }
    const d2 = startWorkingOn(noted, epis, at('12:30'), 'e2', { split: true })
    expect(d2.allocations.map((a) => [a.id, a.projectId, a.activityTypeId, a.mode, a.value, a.note])).toEqual([
      ['e', 'epis', 'buero', 'timeline', 30, 'Pläne prüfen'],
      ['e2', 'epis', 'buero', 'blockRest', 0, ''],
    ])
    expect(activeAllocation(d2)?.id).toBe('e2')
    expect(summarizeDay(d2, at('13:00')).allocation.minutes).toEqual({ e: 30, e2: 30 })
    // auch mit der ganzen laufenden Zeile als Ziel: neue Id, nichts übernommen außer Projekt + Tätigkeit
    const fromRow = startWorkingOn(noted, activeAllocation(noted)!, at('12:30'), 'neu', { split: true })
    expect(fromRow.allocations.map((a) => [a.id, a.note])).toEqual([
      ['e', 'Pläne prüfen'],
      ['neu', ''],
    ])
    // sofort nochmal (0 Minuten): der leere Abschnitt fällt weg, keine leeren Zeilen
    const d3 = startWorkingOn(d2, epis, at('12:30'), 'e3', { split: true })
    expect(d3.allocations.map((a) => a.id)).toEqual(['e', 'e3'])
  })

  it('Ausstempeln: das aktive Projekt behält genau die Zeit bis zum Gehen', () => {
    const d1 = startWorkingOn(day, epis, at('12:00'), 'e')
    const out = { ...d1, blocks: [day.blocks[0], { ...day.blocks[1], end: '16:30' }] }
    expect(summarizeDay(out).allocation.minutes.e).toBe(270)
    expect(activeAllocation(out)).toBeNull()
  })

  it('„Kommen und loslegen“: zusammen mit dem Einstempeln (auch aus einem geplanten Block)', () => {
    const planned: Day = { ...emptyDay('2026-10-20'), blocks: [{ id: 'plan-0', start: '07:00', end: '11:33', planned: true }] }
    const d = startWorkingOn(clockIn(planned, 'neu', '07:05'), epis, at('07:05'), 'e')
    expect(d.allocations[0]).toMatchObject({ mode: 'blockRest', blockId: 'plan-0' })
    expect(summarizeDay(d, at('08:05')).allocation.minutes.e).toBe(60)
  })
})
