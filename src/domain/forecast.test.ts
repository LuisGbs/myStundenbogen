import { describe, expect, it } from 'vitest'
import { emptyDay, summarizeDay } from './day'
import { defaultExpectedEnd, expectedEnd, forecastWorked } from './forecast'
import { startWorkingOn } from './nowWorking'
import { editBlock, TEMPLATE_9H } from './plan'
import { layoutTimeline } from './timeline'
import type { Day } from './types'

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

// Vormittag gestempelt, seit 12:07 wieder eingestempelt
const day: Day = {
  ...emptyDay('2026-10-20'),
  blocks: [
    { id: 'am', start: '07:06', end: '11:33' },
    { id: 'pm', start: '12:07', end: null },
  ],
}

describe('voraussichtlich gehen um …', () => {
  it('Standard aus der Vorlage: nach der Mittagspause 16:30, morgens 11:33, abends keins', () => {
    expect(defaultExpectedEnd({ start: '12:07' }, TEMPLATE_9H)).toBe(at('16:30'))
    expect(defaultExpectedEnd({ start: '07:06' }, TEMPLATE_9H)).toBe(at('11:33'))
    expect(defaultExpectedEnd({ start: '17:00' }, TEMPLATE_9H)).toBeNull()
  })

  it('wirksames Ende: eigenes vor Vorlage, nie vor jetzt', () => {
    expect(expectedEnd(day, TEMPLATE_9H, at('13:07'))).toEqual({
      blockId: 'pm',
      end: at('16:30'),
      planned: at('16:30'),
      custom: false,
      isPast: false,
    })
    const train = { ...day, blocks: [day.blocks[0], { ...day.blocks[1], expectedEnd: '16:52' }] }
    expect(expectedEnd(train, TEMPLATE_9H, at('13:07'))).toMatchObject({ end: at('16:52'), custom: true })
    // nach 16:30 wächst der Block einfach mit
    expect(expectedEnd(day, TEMPLATE_9H, at('17:10'))).toMatchObject({ end: at('17:10'), isPast: true })
    // ohne laufenden Block keine Vorhersage
    expect(expectedEnd({ ...day, blocks: [day.blocks[0]] }, TEMPLATE_9H, at('13:07'))).toBeNull()
  })

  it('voraussichtlich gearbeitet: 4:27 + 12:07–16:30 = 8:50', () => {
    expect(forecastWorked(day, at('16:30'))).toBe(at('08:50'))
    expect(forecastWorked(day, at('16:52'))).toBe(at('09:12'))
  })

  it('Ende eintragen/ausstempeln entfernt „voraussichtlich“', () => {
    const block = { id: 'pm', start: '12:07', end: null, expectedEnd: '16:52' }
    expect(editBlock(block, { start: '12:10' })).toEqual({ ...block, start: '12:10' })
    expect(editBlock(block, { end: '16:40' })).toEqual({ id: 'pm', start: '12:07', end: '16:40' })
  })
})

describe('Zeitleiste mit voraussichtlichem Ende', () => {
  it('der laufende Block reicht bis 16:30, nach jetzt grau; verteilt wird nur bis jetzt', () => {
    const working = startWorkingOn(day, { projectId: 'epis', activityTypeId: 'buero' }, at('12:07'), 'e')
    const now = at('13:07')
    const forecast = expectedEnd(working, TEMPLATE_9H, now)!
    const layout = layoutTimeline(working, summarizeDay(working, now).allocation, now, forecast)!
    const pm = layout.blocks[1]
    expect(layout.axisEnd).toBe(at('16:30'))
    expect(pm).toMatchObject({ minutes: 60, displayMinutes: 263, label: '12:07–jetzt (bis ~16:30)' })
    expect(pm.segments.map((s) => [s.kind, s.allocationId, s.minutes])).toEqual([
      ['blockRest', 'e', 60],
      ['future', null, 203],
    ])
    expect(pm.segments[1].left).toBeCloseTo((60 / 263) * 100)
  })

  it('nach dem voraussichtlichen Ende: kein grauer Teil', () => {
    const now = at('17:00')
    const forecast = expectedEnd(day, TEMPLATE_9H, now)!
    const pm = layoutTimeline(day, summarizeDay(day, now).allocation, now, forecast)!.blocks[1]
    expect(pm.displayMinutes).toBe(pm.minutes)
    expect(pm.segments.some((s) => s.kind === 'future')).toBe(false)
    expect(pm.label).toBe('12:07–jetzt')
  })

  it('eben eingestempelt (0 min): Block schon sichtbar, ganz „future“', () => {
    const fresh: Day = { ...emptyDay('2026-10-20'), blocks: [{ id: 'pm', start: '12:07', end: null }] }
    const now = at('12:07')
    const layout = layoutTimeline(fresh, summarizeDay(fresh, now).allocation, now, expectedEnd(fresh, TEMPLATE_9H, now))!
    expect(layout.blocks[0].segments.map((s) => s.kind)).toEqual(['future'])
  })
})
