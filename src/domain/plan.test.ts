import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { workedMinutes } from './dayTotal'
import { clockIn, confirmPlan, DEFAULT_DAY_TEMPLATE, editBlock, hasPlannedBlocks, withPlannedBlocks } from './plan'

const settings = { dayTemplate: DEFAULT_DAY_TEMPLATE, weekdayTargets: [498, 498, 498, 498, 498, 0, 0] }
const WEDNESDAY = '2026-10-14'
const SATURDAY = '2026-10-17'

describe('geplanter Arbeitstag', () => {
  it('belegt einen leeren Werktag mit der Vorlage vor (geplant, feste IDs)', () => {
    const day = withPlannedBlocks(emptyDay(WEDNESDAY), settings)
    expect(day.blocks).toEqual([
      { id: 'plan-0', start: '07:00', end: '11:33', planned: true },
      { id: 'plan-1', start: '12:03', end: '16:30', planned: true },
    ])
    expect(workedMinutes(day)).toBe(273 + 267) // 9:00 geplant
    expect(hasPlannedBlocks(day)).toBe(true)
  })

  it('nicht am Wochenende, nicht bei Gesamtzeit, nicht wenn schon gestempelt', () => {
    expect(withPlannedBlocks(emptyDay(SATURDAY), settings).blocks).toEqual([])
    expect(withPlannedBlocks({ ...emptyDay(WEDNESDAY), timeMode: 'total' }, settings).blocks).toEqual([])
    const stamped = { ...emptyDay(WEDNESDAY), blocks: [{ id: 'x', start: '08:00', end: '12:00' }] }
    expect(withPlannedBlocks(stamped, settings)).toBe(stamped)
    expect(withPlannedBlocks(emptyDay(WEDNESDAY), { ...settings, dayTemplate: [] }).blocks).toEqual([])
  })

  it('eine geänderte Uhrzeit macht den Block zum echten Stempel', () => {
    const block = { id: 'plan-0', start: '07:00', end: '11:33', planned: true }
    expect(editBlock(block, { start: '07:12' })).toEqual({ id: 'plan-0', start: '07:12', end: '11:33' })
  })

  it('Plan übernehmen: alle Blöcke gelten als gestempelt', () => {
    const day = confirmPlan(withPlannedBlocks(emptyDay(WEDNESDAY), settings))
    expect(hasPlannedBlocks(day)).toBe(false)
    expect(day.blocks.map((b) => b.id)).toEqual(['plan-0', 'plan-1'])
  })

  it('Kommen (jetzt) ersetzt den ersten noch geplanten Block, sonst neuer Block', () => {
    const planned = withPlannedBlocks(emptyDay(WEDNESDAY), settings)
    const morning = clockIn(planned, 'neu', '07:05')
    expect(morning.blocks[0]).toEqual({ id: 'plan-0', start: '07:05', end: null })
    expect(morning.blocks[1].planned).toBe(true)

    const afternoon = clockIn({ ...morning, blocks: [{ ...morning.blocks[0], end: '11:40' }, morning.blocks[1]] }, 'neu', '12:10')
    expect(afternoon.blocks[1]).toEqual({ id: 'plan-1', start: '12:10', end: null })

    const extra = clockIn(confirmPlan(planned), 'neu', '18:00')
    expect(extra.blocks.at(-1)).toEqual({ id: 'neu', start: '18:00', end: null })
  })
})
