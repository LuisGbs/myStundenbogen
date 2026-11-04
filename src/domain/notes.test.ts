import { describe, expect, it } from 'vitest'
import { appendNote, noteContains } from './notes'

describe('Notiz der laufenden Buchung', () => {
  it('hängt mit „ · “ an, ohne Doppelte und ohne leere Punkte', () => {
    expect(appendNote('', 'Pläne prüfen')).toBe('Pläne prüfen')
    expect(appendNote('Telefonat Bauherr', ' Pläne prüfen ')).toBe('Telefonat Bauherr · Pläne prüfen')
    expect(appendNote('Telefonat Bauherr · Pläne prüfen', 'pläne  PRÜFEN')).toBe('Telefonat Bauherr · Pläne prüfen')
    expect(appendNote('Telefonat', '  ')).toBe('Telefonat')
  })

  it('erkennt nur ganze Punkte', () => {
    expect(noteContains('Telefonat Bauherr · Pläne prüfen', 'Pläne prüfen')).toBe(true)
    expect(noteContains('Pläne prüfen EG', 'Pläne prüfen')).toBe(false)
    expect(noteContains('', '')).toBe(false)
  })
})
