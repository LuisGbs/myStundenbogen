import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { endTimes, templateMinutes } from './endTimes'
import { TEMPLATE_9H } from './plan'
import type { Day, TimeBlock } from './types'

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const day = (blocks: TimeBlock[]): Day => ({ ...emptyDay('2026-10-20'), blocks })
const SOLL = 498
const ZIEL = 540

describe('Bis wann arbeiten (Soll/Ziel, mit 30 min Pause)', () => {
  it('Ziel aus der Vorlage: 9:00', () => {
    expect(templateMinutes(TEMPLATE_9H)).toBe(540)
  })

  it('nach der Mittagspause eingestempelt: Pause ist genommen', () => {
    const d = day([
      { id: 'am', start: '07:06', end: '11:33' },
      { id: 'pm', start: '12:07', end: null },
    ])
    const e = endTimes(d, at('13:07'))!
    expect(e).toMatchObject({ state: 'running', worked: 327, breakDone: true, breakAdded: 0 })
    // 8:18 − 5:27 = 2:51 → 15:58; 9:00 − 5:27 = 3:33 → 16:40
    expect(e.at(SOLL)).toBe(at('15:58'))
    expect(e.at(ZIEL)).toBe(at('16:40'))
  })

  it('durchgehend seit 07:00, noch keine Pause → 30 min eingerechnet', () => {
    const e = endTimes(day([{ id: 'b', start: '07:00', end: null }]), at('10:00'))!
    expect(e).toMatchObject({ breakDone: false, breakAdded: 30 })
    expect(e.at(SOLL)).toBe(at('15:48'))
    expect(e.at(ZIEL)).toBe(at('16:30'))
  })

  it('kurze Pausen (< 30 min) zählen nicht als die vorgeschriebene Pause', () => {
    const d = day([
      { id: 'a', start: '07:00', end: '09:00' },
      { id: 'b', start: '09:15', end: null },
    ])
    expect(endTimes(d, at('10:00'))!.breakAdded).toBe(30)
  })

  it('gerade in der Pause: frühestens 30 min nach dem Ausstempeln weiter', () => {
    const d = day([{ id: 'am', start: '07:00', end: '11:30' }])
    const e = endTimes(d, at('11:40'))!
    expect(e).toMatchObject({ state: 'break', resume: at('12:00'), breakDone: false, breakAdded: 0 })
    expect(e.at(SOLL)).toBe(at('15:48')) // 12:00 + 3:48
    // nach 45 min Pause: ab jetzt
    expect(endTimes(d, at('12:15'))).toMatchObject({ resume: at('12:15'), breakDone: true })
  })

  it('noch nicht gekommen: „wenn du jetzt kommst“ mit Pause', () => {
    const e = endTimes(day([]), at('07:00'))!
    expect(e.state).toBe('not-started')
    expect(e.at(ZIEL)).toBe(at('16:30'))
  })

  it('schon erreicht → null; geplante Blöcke zählen nicht', () => {
    const d = day([
      { id: 'am', start: '07:00', end: '11:30' },
      { id: 'pm', start: '12:00', end: null },
      { id: 'plan', start: '17:00', end: '18:00', planned: true },
    ])
    expect(endTimes(d, at('17:00'))!.at(SOLL)).toBeNull()
    expect(endTimes(d, at('13:00'))!.worked).toBe(330)
  })

  it('Gesamtzeit-Tag → keine Anzeige', () => {
    expect(endTimes({ ...emptyDay('2026-10-20'), timeMode: 'total', totalMinutes: 300 }, at('12:00'))).toBeNull()
  })
})
