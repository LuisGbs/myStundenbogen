import { describe, expect, it } from 'vitest'
import { buildProjectList, planActivityTypeImport, planProjectImport } from './projectTransfer'
import type { ActivityType, Project } from './types'

const project = (name: string, code = '', active = true): Project => ({
  id: name,
  name,
  officialName: '',
  code,
  color: '#2563eb',
  active,
  sortOrder: 0,
  createdAt: '',
})
const activity = (name: string, active = true): ActivityType => ({ id: name, projectId: null, name, officialName: '', code: '', active, isDefault: false, sortOrder: 0 })

describe('buildProjectList', () => {
  it('enthält nur Name, Nummer, Farbe und aktive Tätigkeiten je Projekt + Standardliste – keine IDs', () => {
    const alpha = project('Alpha', 'P-1')
    const file = buildProjectList(
      [alpha],
      [
        activity('Büro'),
        activity('Alt', false),
        { ...activity('Engineering'), id: 'e', projectId: alpha.id, code: '10' },
        { ...activity('Weg', false), id: 'w', projectId: alpha.id },
      ],
    )
    expect(file.schemaVersion).toBe(3)
    expect(file.projects).toEqual([
      {
        name: 'Alpha',
        officialName: '',
        code: 'P-1',
        color: '#2563eb',
        activities: [{ name: 'Engineering', officialName: '', code: '10' }],
      },
    ])
    expect(file.activityTypes).toEqual([{ name: 'Büro', officialName: '', code: '' }])
    expect(JSON.stringify(file)).not.toContain('"id"')
  })
})

describe('planProjectImport', () => {
  const existing = [project('Kunde Müller', 'P-100'), project('Intern'), project('Website', 'P-200')]

  it('erkennt Vorhandenes über die Projektnummer, auch bei anderem Namen', () => {
    const [c] = planProjectImport(existing, [{ name: 'Müller AG', code: ' p-100 ', color: '' }])
    expect(c).toMatchObject({ status: 'exists', selected: false })
    expect(c.match?.name).toBe('Kunde Müller')
  })

  it('erkennt Vorhandenes über den Namen (Groß-/Kleinschreibung, Leerzeichen egal)', () => {
    const [c] = planProjectImport(existing, [{ name: '  intern ', code: '', color: '' }])
    expect(c).toMatchObject({ status: 'exists', selected: false })
  })

  it('gleicher Name, andere Nummer → ähnlich, nicht vorausgewählt', () => {
    const [c] = planProjectImport(existing, [{ name: 'Website', code: 'P-201', color: '' }])
    expect(c).toMatchObject({ status: 'similar', selected: false })
  })

  it('Neues ist vorausgewählt, Doppelte in der Datei werden zusammengefasst', () => {
    const plan = planProjectImport(existing, [
      { name: 'Neu', code: 'P-300', color: '' },
      { name: 'neu', code: 'p-300', color: '' },
      { name: '', code: 'P-999', color: '' },
    ])
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({ status: 'new', selected: true })
  })
})

describe('planActivityTypeImport', () => {
  it('übernimmt nur unbekannte Tätigkeitsarten automatisch', () => {
    const plan = planActivityTypeImport([activity('Büro'), activity('Meeting')], [
      { name: 'büro' },
      { name: 'Reise' },
      { name: 'Reise' },
    ])
    expect(plan.map((c) => [c.item.name, c.status, c.selected])).toEqual([
      ['büro', 'exists', false],
      ['Reise', 'new', true],
    ])
  })
})

describe('offizieller Name', () => {
  it('wird exportiert und beim Abgleich erkannt', () => {
    const own = { ...project('Rollen überarbeiten'), officialName: 'Epis Allg.' }
    const file = buildProjectList([own], [])
    expect(file.schemaVersion).toBe(3)
    expect(file.projects[0]).toMatchObject({ name: 'Rollen überarbeiten', officialName: 'Epis Allg.' })
    const [c] = planProjectImport([own], [{ name: 'Anderer Name', officialName: 'epis allg.', code: '', color: '' }])
    expect(c).toMatchObject({ status: 'exists', selected: false })
  })
})
