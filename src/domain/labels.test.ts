import { describe, expect, it } from 'vitest'
import { bookingTarget, hasOfficialInfo, officialLabel, officialName } from './labels'
import { addOfficialName } from './legacy'

describe('Eigener Name, offizieller Name, Nummer', () => {
  it('offizieller Name fällt auf den eigenen zurück', () => {
    expect(officialName({ name: 'Rollen überarbeiten', officialName: ' ' })).toBe('Rollen überarbeiten')
    expect(officialName({ name: 'Rollen überarbeiten', officialName: 'Epis Allg.' })).toBe('Epis Allg.')
    expect(officialLabel({ name: 'Rollen', officialName: 'Epis Allg.', code: '2295/90' })).toBe('Epis Allg. · 2295/90')
    expect(officialLabel({ name: 'Rollen', officialName: '' })).toBe('Rollen')
  })

  it('Hinweis nur, wenn offiziell etwas anderes steht oder es eine Nummer gibt', () => {
    expect(hasOfficialInfo({ name: 'Epis', officialName: 'Epis' })).toBe(false)
    expect(hasOfficialInfo({ name: 'Epis', officialName: '' })).toBe(false)
    expect(hasOfficialInfo({ name: 'Epis', officialName: '', code: '1' })).toBe(true)
    expect(hasOfficialInfo({ name: 'Rollen', officialName: 'Epis' })).toBe(true)
  })

  it('Buchungsziel in der Firmensoftware nur, wenn es etwas Neues sagt', () => {
    const project = { name: 'Rollen überarbeiten', officialName: 'Epis Allg.', code: '2295/90' }
    const activity = { name: 'Konzept', officialName: 'Engineering', code: '10' }
    expect(bookingTarget(project, activity)).toBe('Epis Allg. · 2295/90 / Engineering · 10')
    expect(bookingTarget({ name: 'Epis', officialName: '' }, { name: 'Büro', officialName: 'Büro' })).toBeNull()
    expect(bookingTarget({ name: 'Epis', officialName: '' }, { name: 'Büro', officialName: '', code: '1' })).toBe('Epis / Büro · 1')
  })

  it('Umstellung Stand 9 → 10: bisheriger Name wird offizieller Name, zweimal ändert nichts', () => {
    const once = addOfficialName({ id: 'p', name: 'Epis' })
    expect(once).toEqual({ id: 'p', name: 'Epis', officialName: 'Epis' })
    expect(addOfficialName({ ...once, name: 'Rollen' })).toEqual({ id: 'p', name: 'Rollen', officialName: 'Epis' })
  })
})
