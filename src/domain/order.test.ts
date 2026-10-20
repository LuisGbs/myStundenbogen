import { describe, expect, it } from 'vitest'
import { reorderIds } from './order'

describe('reorderIds (Ziehen in der Projektliste)', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('vor einem Eintrag ablegen', () => {
    expect(reorderIds(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
    expect(reorderIds(ids, 'a', 'c')).toEqual(['b', 'a', 'c', 'd'])
  })

  it('ans Ende ablegen; auf sich selbst → unverändert', () => {
    expect(reorderIds(ids, 'a', null)).toEqual(['b', 'c', 'd', 'a'])
    expect(reorderIds(ids, 'b', 'b')).toEqual(ids)
    expect(reorderIds(ids, 'x', 'a')).toEqual(ids)
  })

  it('ausgeblendete (inaktive) Einträge bleiben an ihrem Platz', () => {
    // d ist ausgeblendet; „ans Ende“ = hinter den letzten sichtbaren (c), d bleibt hinten
    const visible = (id: string) => id !== 'd'
    expect(reorderIds(ids, 'a', null, visible)).toEqual(['b', 'c', 'a', 'd'])
  })
})
