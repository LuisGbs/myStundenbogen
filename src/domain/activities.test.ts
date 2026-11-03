import { describe, expect, it } from 'vitest'
import { activitiesOf, activityLabel, copyTemplate, defaultActivityId, templateActivities, withProject } from './activities'
import { buildMonthGrid } from './month'
import { splitActivitiesPerProject } from './legacy'
import type { ActivityType, Allocation, Day, Project } from './types'

const act = (id: string, projectId: string | null, name: string, sortOrder = 0, active = true): ActivityType => ({
  id,
  projectId,
  name,
  officialName: '',
  code: '',
  active,
  sortOrder,
})

const all = [
  act('t1', null, 'Büro', 0),
  act('t2', null, 'Meeting', 1),
  act('t3', null, 'Alt', 2, false),
  act('e-eng', 'epis', 'Engineering', 0),
  act('e-meet', 'epis', 'Meeting', 1),
  act('e-alt', 'epis', 'Abwicklung', 2, false),
  act('r-meet', 'revit', 'Meeting', 0),
]

describe('Tätigkeiten je Projekt', () => {
  it('Projekt-Tätigkeiten: aktive sortiert, die gewählte inaktive bleibt sichtbar', () => {
    expect(activitiesOf('epis', all).map((a) => a.id)).toEqual(['e-eng', 'e-meet'])
    expect(activitiesOf('epis', all, 'e-alt').map((a) => a.id)).toEqual(['e-eng', 'e-meet', 'e-alt'])
    expect(templateActivities(all).map((a) => a.id)).toEqual(['t1', 't2', 't3'])
  })

  it('Projektwechsel: gleicher Name, sonst erste aktive, sonst leer', () => {
    expect(defaultActivityId('revit', all, 'meeting')).toBe('r-meet')
    expect(defaultActivityId('epis', all, 'Meeting')).toBe('e-meet')
    expect(defaultActivityId('epis', all, 'Abwicklung')).toBe('e-eng')
    expect(defaultActivityId('epis', all)).toBe('e-eng')
    expect(defaultActivityId('neu', all)).toBe('')
    const row = { id: 'z', projectId: 'epis', activityTypeId: 'e-meet' }
    expect(withProject(row, 'revit', all)).toEqual({ id: 'z', projectId: 'revit', activityTypeId: 'r-meet' })
    expect(withProject({ ...row, activityTypeId: 'e-eng' }, 'revit', all).activityTypeId).toBe('r-meet')
    expect(withProject(row, 'epis', all)).toEqual(row)
  })

  it('neues Projekt kopiert die aktiven Einträge der Standardliste', () => {
    let n = 0
    const copy = copyTemplate('neu', [...all, { ...act('t0', null, 'Reise', 5), code: 'R' }], () => `id${n++}`)
    expect(copy.map((a) => [a.name, a.code, a.projectId, a.sortOrder])).toEqual([
      ['Büro', '', 'neu', 0],
      ['Meeting', '', 'neu', 1],
      ['Reise', 'R', 'neu', 2],
    ])
    expect(activityLabel({ name: 'Engineering', code: '10' })).toBe('Engineering (10)')
  })
})

describe('Umstellung Stand 8 → 9 (Tätigkeiten je Projekt)', () => {
  const project = (id: string): Project => ({ id, name: id, officialName: '', code: '', color: '#000', active: true, sortOrder: 0, createdAt: '' })
  const alloc = (id: string, projectId: string, activityTypeId: string, value: number): Allocation => ({
    id,
    projectId,
    activityTypeId,
    mode: 'duration',
    value,
    note: '',
  })
  const day = (date: string, allocations: Allocation[]): Day => ({
    date,
    timeMode: 'total',
    blocks: [],
    totalMinutes: 480,
    allocations,
    fillStrategy: 'none',
    absence: null,
    note: '',
    updatedAt: '',
  })
  const old = {
    projects: [project('epis'), project('revit'), project('nie')],
    activityTypes: [
      { id: 'buero', name: 'Büro', active: true, sortOrder: 0 },
      { id: 'meeting', name: 'Meeting', active: true, sortOrder: 1 },
      { id: 'alt', name: 'Alt', active: false, sortOrder: 2 },
    ] as ActivityType[],
    days: [
      day('2026-10-01', [alloc('1', 'epis', 'buero', 120), alloc('2', 'epis', 'meeting', 60), alloc('3', 'revit', 'alt', 30)]),
      day('2026-10-02', [alloc('4', 'epis', 'buero', 90), alloc('5', 'revit', 'weg', 15)]),
    ],
    settings: { defaultFill: { projectId: 'revit', activityTypeId: 'buero' } },
  }
  let n = 0
  const result = splitActivitiesPerProject(old, () => `neu${n++}`)
  const of = (projectId: string | null) =>
    result.activityTypes.filter((a) => a.projectId === projectId).map((a) => [a.name, a.active])

  it('Standardliste = alte Arten; Projekte bekommen nur Benutztes, nie gebuchte die aktive Standardliste', () => {
    expect(of(null)).toEqual([
      ['Büro', true],
      ['Meeting', true],
      ['Alt', false],
    ])
    expect(of('epis')).toEqual([
      ['Büro', true],
      ['Meeting', true],
    ])
    // revit: Alt (inaktiv, gebucht), unbekannte Art, Büro (Standard-Auffüllziel)
    expect(of('revit')).toEqual([
      ['Alt', false],
      ['Tätigkeit', true],
      ['Büro', true],
    ])
    expect(of('nie')).toEqual([
      ['Büro', true],
      ['Meeting', true],
    ])
  })

  it('Buchungen und Auffüllziel zeigen auf die Kopien – gleiche Kopie für gleiche Kombination', () => {
    const [d1, d2] = result.days
    expect(d1.allocations[0].activityTypeId).toBe(d2.allocations[0].activityTypeId)
    const byId = new Map(result.activityTypes.map((a) => [a.id, a]))
    for (const d of result.days) {
      for (const a of d.allocations) expect(byId.get(a.activityTypeId)?.projectId).toBe(a.projectId)
    }
    const fill = result.settings!.defaultFill!
    expect(byId.get(fill.activityTypeId)).toMatchObject({ projectId: 'revit', name: 'Büro' })
  })

  it('Monatssummen und Namen bleiben gleich', () => {
    const rows = (data: typeof old) =>
      buildMonthGrid('2026-10', data.days, data.projects, data.activityTypes, { includeEmptyActive: false }).groups.flatMap(
        (g) => g.rows.map((r) => [g.project.id, r.activityType.name, r.total]),
      )
    const before = rows(old).map(([p, name, total]) => [p, name === 'Unbekannt' ? 'Tätigkeit' : name, total])
    expect(rows(result)).toEqual(before)
  })

  it('zweimal anwenden ändert nichts', () => {
    expect(splitActivitiesPerProject(result, () => 'x')).toBe(result)
  })
})
