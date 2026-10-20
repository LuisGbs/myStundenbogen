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
