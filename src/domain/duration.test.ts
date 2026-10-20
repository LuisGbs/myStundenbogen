import { describe, expect, it } from 'vitest'
import {
  clockToMinutes,
  formatDuration,
  formatPercent,
  formatSignedDuration,
  minutesToClock,
  parseAmount,
  parseDuration,
  parseSignedDuration,
} from './duration'

describe('formatDuration', () => {
  it('formatiert Minuten als h:mm', () => {
    expect(formatDuration(498)).toBe('8:18')
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(6000)).toBe('100:00')
    expect(formatDuration(-90)).toBe('−1:30')
  })

  it('zeigt Vorzeichen bei Salden', () => {
    expect(formatSignedDuration(252)).toBe('+4:12')
    expect(formatSignedDuration(-606)).toBe('−10:06')
    expect(formatSignedDuration(0)).toBe('±0:00')
  })
})

describe('parseAmount', () => {
  it.each([
    ['8:18', 498],
    ['0:45', 45],
    [':30', 30],
    ['8,3', 498],
    ['8.3', 498],
    ['1,5', 90],
    ['8', 480],
    ['8h', 480],
    ['8h18', 498],
    ['8h 18m', 498],
    ['8 h 18 min', 498],
    ['1,5h', 90],
    ['90m', 90],
    ['90 min', 90],
    [' 2:00 ', 120],
  ])('%s → %i Minuten', (input, minutes) => {
    expect(parseAmount(input)).toEqual({ kind: 'duration', minutes })
  })

  it('erkennt Prozent und Rest', () => {
    expect(parseAmount('50%')).toEqual({ kind: 'percent', percent: 50 })
    expect(parseAmount('33,3 %')).toEqual({ kind: 'percent', percent: 33.3 })
    expect(parseAmount('Rest')).toEqual({ kind: 'rest' })
  })

  it.each(['', 'abc', '8:75', '1:2:3', '-1', '8h75'])('lehnt "%s" ab', (input) => {
    expect(parseAmount(input)).toBeNull()
  })

  it('parseDuration akzeptiert nur Dauern', () => {
    expect(parseDuration('8:18')).toBe(498)
    expect(parseDuration('50%')).toBeNull()
  })
})

describe('Uhrzeiten', () => {
  it('rechnet zwischen HH:MM und Minuten um', () => {
    expect(clockToMinutes('07:45')).toBe(465)
    expect(minutesToClock(465)).toBe('07:45')
    expect(minutesToClock(0)).toBe('00:00')
  })
})

describe('formatPercent', () => {
  it('nutzt Dezimalkomma', () => {
    expect(formatPercent(50)).toBe('50 %')
    expect(formatPercent(33.333)).toBe('33,3 %')
  })
})

describe('parseSignedDuration', () => {
  it('versteht Vorzeichen', () => {
    expect(parseSignedDuration('+3:20')).toBe(200)
    expect(parseSignedDuration('-1:30')).toBe(-90)
    expect(parseSignedDuration('−0:45')).toBe(-45)
    expect(parseSignedDuration('2')).toBe(120)
    expect(parseSignedDuration('x')).toBeNull()
  })
})
