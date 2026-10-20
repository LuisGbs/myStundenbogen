import { describe, expect, it } from 'vitest'
import { emptyDay } from './day'
import { buildMonthGrid, monthGridToTable, toDelimited } from './month'
import type { ActivityType, Allocation, Day, Project } from './types'

const project = (id: string, sortOrder: number, active = true): Project => ({
  id,
  name: `Projekt ${id}`,
  code: `P-${id}`,
  color: '#000',
  active,
  sortOrder,
  createdAt: '',
})
const activities: ActivityType[] = [
  { id: 'buero', name: 'Büro', active: true, sortOrder: 0 },
  { id: 'meeting', name: 'Meeting', active: true, sortOrder: 1 },
]
const alloc = (id: string, projectId: string, activityTypeId: string, mode: Allocation['mode'], value = 0): Allocation => ({
  id,
  projectId,
  activityTypeId,
  mode,
  value,
  note: '',
})
const day = (date: string, total: number, allocations: Allocation[]): Day => ({
  ...emptyDay(date),
  timeMode: 'total',
  totalMinutes: total,
  allocations,
})

describe('buildMonthGrid', () => {
  const projects = [project('a', 1), project('b', 0), project('c', 2), project('old', 3, false)]
  const days = [
    day('2026-10-01', 498, [
      alloc('1', 'a', 'buero', 'percent', 50),
      alloc('2', 'a', 'meeting', 'duration', 60),
      alloc('3', 'b', 'buero', 'rest'),
    ]),
    day('2026-10-02', 480, [alloc('4', 'old', 'buero', 'duration', 240)]),
  ]

  it('summiert pro Projekt, Tätigkeitsart und Tag', () => {
    const grid = buildMonthGrid('2026-10', days, projects, activities, { includeEmptyActive: false })
    expect(grid.dates).toHaveLength(31)
    // Sortierung nach sortOrder: b, a, old
    expect(grid.groups.map((g) => g.project.id)).toEqual(['b', 'a', 'old'])
    const a = grid.groups[1]
    expect(a.rows.map((r) => r.activityType.name)).toEqual(['Büro', 'Meeting'])
    expect(a.rows[0].perDay[0]).toBe(249)
    expect(a.rows[1].perDay[0]).toBe(60)
    expect(a.perDay[0]).toBe(309)
    expect(grid.groups[0].total).toBe(189)
  })

  it('zeigt inaktive Projekte, wenn sie Stunden haben, und offene Zeit pro Tag', () => {
    const grid = buildMonthGrid('2026-10', days, projects, activities, { includeEmptyActive: false })
    expect(grid.groups.some((g) => g.project.id === 'old')).toBe(true)
    expect(grid.days[1]).toMatchObject({ worked: 480, booked: 240, open: 240, status: 'open' })
    expect(grid.totals).toEqual({ worked: 978, booked: 738, open: 240 })
  })

  it('sammelt Notizen je Projekt, Tätigkeit und Tag (ohne Doppelte)', () => {
    const withNotes = [
      day('2026-10-05', 480, [
        { ...alloc('n1', 'a', 'buero', 'duration', 60), note: 'Ticket 42' },
        { ...alloc('n2', 'a', 'buero', 'duration', 60), note: 'Ticket 42' },
        { ...alloc('n3', 'a', 'buero', 'rest'), note: 'Review' },
      ]),
    ]
    const grid = buildMonthGrid('2026-10', withNotes, projects, activities, { includeEmptyActive: false })
    expect(grid.groups[0].rows[0].notes[4]).toEqual(['Ticket 42', 'Review'])
    expect(grid.groups[0].rows[0].notes[0]).toEqual([])
  })

  it('blendet leere aktive Projekte nur auf Wunsch ein', () => {
    const without = buildMonthGrid('2026-10', days, projects, activities, { includeEmptyActive: false })
    const withEmpty = buildMonthGrid('2026-10', days, projects, activities, { includeEmptyActive: true })
    expect(without.groups.some((g) => g.project.id === 'c')).toBe(false)
    expect(withEmpty.groups.some((g) => g.project.id === 'c')).toBe(true)
  })
})

describe('Export', () => {
  it('erzeugt eine Tabelle mit h:mm-Werten', () => {
    const grid = buildMonthGrid(
      '2026-10',
      [day('2026-10-01', 498, [alloc('1', 'a', 'buero', 'rest')])],
      [project('a', 0)],
      activities,
      { includeEmptyActive: false },
    )
    const table = monthGridToTable(grid)
    expect(table[0].slice(0, 4)).toEqual(['Projekt', 'Nr.', 'Tätigkeit', 'Do 01.10.'])
    expect(table[1].slice(0, 4)).toEqual(['Projekt a', 'P-a', 'Büro', '8:18'])
    expect(table[1].at(-1)).toBe('8:18')
  })

  it('maskiert Trennzeichen und Anführungszeichen', () => {
    expect(toDelimited([['a;b', 'c"d', 'e']], ';')).toBe('"a;b";"c""d";e')
  })
})
