import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { buildProjectList } from '../domain/projectTransfer'
import { parseTaskText, planTaskImport } from '../domain/taskText'
import type { ActivityType } from '../domain/types'
import {
  collectBackup,
  ImportError,
  parseBackup,
  parseProjectList,
  restoreBackup,
  serializeBackup,
} from './exportImport'
import {
  countProjectTasks,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  reorderTask,
  restoreTasks,
  setTaskDone,
  noteToItem,
  setTaskStarred,
  importTasks,
  undoTaskImport,
  importProjectList,
  createActivityType,
  deleteActivityType,
  updateActivityType,
  toggleDefaultActivity,
  reorderActivityType,
  reorderProject,
  recentProjectIds,
  updateDay,
  updateProject,
  updateSettings,
} from './repo'
import { seedDefaults } from './seed'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  await seedDefaults()
})

describe('Tage', () => {
  it('speichert Änderungen und löscht leere Tage wieder', async () => {
    await updateDay('2026-10-19', (d) => ({ ...d, timeMode: 'total', totalMinutes: 498 }))
    expect((await db.days.get('2026-10-19'))?.totalMinutes).toBe(498)
    await updateDay('2026-10-19', (d) => ({ ...d, totalMinutes: null }))
    expect((await db.days.get('2026-10-19'))?.timeMode).toBe('total') // Moduswahl bleibt erhalten
    await updateDay('2026-10-19', (d) => ({ ...d, timeMode: 'blocks' }))
    expect(await db.days.get('2026-10-19')).toBeUndefined()
  })

  it('liefert zuletzt genutzte Projekte, neueste zuerst', async () => {
    const alloc = (projectId: string) => ({
      id: projectId,
      projectId,
      activityTypeId: 'buero',
      mode: 'rest' as const,
      value: 0,
      note: '',
    })
    await updateDay('2026-10-15', (d) => ({ ...d, allocations: [alloc('a'), alloc('b')] }))
    await updateDay('2026-10-16', (d) => ({ ...d, allocations: [alloc('c'), alloc('a')] }))
    expect(await recentProjectIds('2026-10-19')).toEqual(['c', 'a', 'b'])
  })
})

describe('Projekte', () => {
  it('vergibt Reihenfolge und Farben und lässt sich verschieben', async () => {
    const a = await createProject({ name: ' Alpha ', code: 'P-1' })
    const b = await createProject({ name: 'Beta' })
    expect(a.name).toBe('Alpha')
    expect(a.color).not.toBe(b.color)
    await reorderProject(b.id, a.id, false)
    const order = (await db.projects.orderBy('sortOrder').toArray()).map((p) => p.name)
    expect(order).toEqual(['Beta', 'Alpha'])
  })

  it('überspringt beim Verschieben ausgeblendete (inaktive) Projekte', async () => {
    await createProject({ name: 'A' })
    const b = await createProject({ name: 'B' })
    const c = await createProject({ name: 'C' })
    await updateProject(b.id, { active: false })
    // sichtbar sind nur A und C: C vor A ziehen, das ausgeblendete B bleibt an seinem Platz
    await reorderProject(c.id, (await db.projects.orderBy('sortOrder').first())!.id, true)
    const order = (await db.projects.orderBy('sortOrder').toArray()).map((p) => p.name)
    expect(order).toEqual(['C', 'A', 'B'])
    // ans Ende (hinter den letzten sichtbaren)
    await reorderProject(c.id, null, true)
    expect((await db.projects.orderBy('sortOrder').toArray()).map((p) => p.name)).toEqual(['A', 'C', 'B'])
  })

  it('Tätigkeitsarten lassen sich umsortieren', async () => {
    const types = await db.activityTypes.orderBy('sortOrder').toArray()
    await reorderActivityType(types.at(-1)!.id, types[0].id)
    const names = (await db.activityTypes.orderBy('sortOrder').toArray()).map((a) => a.name)
    expect(names[0]).toBe(types.at(-1)!.name)
  })

  it('löscht nur Projekte ohne Buchungen', async () => {
    const used = await createProject({ name: 'Benutzt' })
    const unused = await createProject({ name: 'Unbenutzt' })
    await updateSettings({ defaultFill: { projectId: unused.id, activityTypeId: 'buero' } })
    await updateDay('2026-10-19', (d) => ({
      ...d,
      allocations: [{ id: 'x', projectId: used.id, activityTypeId: 'buero', mode: 'rest', value: 0, note: '' }],
    }))
    expect(await deleteProject(used.id)).toBe(false)
    expect(await deleteProject(unused.id)).toBe(true)
    expect((await db.settings.get('settings'))?.defaultFill).toBeNull()
  })
})

describe('Export/Import', () => {
  it('stellt nach Export → Import exakt dieselben Daten her', async () => {
    const p = await createProject({ name: 'Alpha', code: 'P-1' })
    await updateDay('2026-10-19', (d) => ({
      ...d,
      blocks: [{ id: 'b1', start: '07:45', end: '12:00' }],
      allocations: [{ id: 'x', projectId: p.id, activityTypeId: 'buero', mode: 'percent', value: 50, note: 'Notiz' }],
    }))
    const t = await createTask({ projectId: p.id, parentId: null, title: 'Pläne prüfen' })
    await createTask({ projectId: p.id, parentId: t.id, title: 'Erdgeschoss' })
    const before = await collectBackup()
    expect(before.data.tasks).toHaveLength(2)
    const text = serializeBackup(before)

    await Promise.all(db.tables.map((t) => t.clear()))
    await restoreBackup(parseBackup(text))
    const after = await collectBackup()
    expect(after.data).toEqual(before.data)
  })

  it('lehnt fremde oder kaputte Dateien verständlich ab', () => {
    expect(() => parseBackup('kein json')).toThrow(ImportError)
    expect(() => parseBackup('{"app":"etwas"}')).toThrow('keine Sicherung dieser App')
    expect(() => parseBackup('{"app":"stundenbogen","schemaVersion":99,"data":{}}')).toThrow('neueren App-Version')
    expect(() =>
      parseBackup('{"app":"stundenbogen","schemaVersion":1,"data":{"projects":[],"activityTypes":[],"days":[{"date":"x"}]}}'),
    ).toThrow('Ungültiger Tag')
  })

  it('Projektliste: Roundtrip, volle Sicherung als Quelle, fremde Dateien abgelehnt', async () => {
    await createProject({ name: 'Alpha', code: 'P-1' })
    const list = buildProjectList(await db.projects.toArray(), await db.activityTypes.toArray())
    const parsed = parseProjectList(JSON.stringify(list))
    expect(parsed.projects).toEqual(list.projects)
    expect(parsed.projects[0].activities?.map((a) => a.name)).toEqual(['Büro', 'Meeting'])
    expect(parsed.activityTypes.map((a) => a.name)).toEqual(['Büro', 'Meeting'])

    const fromBackup = parseProjectList(serializeBackup(await collectBackup()))
    expect(fromBackup.projects.map((p) => p.name)).toEqual(['Alpha'])
    expect(fromBackup.projects[0].activities?.map((a) => a.name)).toEqual(['Büro', 'Meeting'])
    expect(fromBackup.activityTypes.map((a) => a.name)).toEqual(['Büro', 'Meeting'])

    // Format 1 (ältere Version): Tätigkeitsarten der Datei gelten für jedes Projekt
    const v1 = parseProjectList(
      JSON.stringify({
        app: 'stundenbogen',
        kind: 'projects',
        schemaVersion: 1,
        projects: [{ name: 'Beta', code: '', color: '' }],
        activityTypes: [{ name: 'Reise' }],
      }),
    )
    // ältere Formate: der Name war der offizielle
    expect(v1.projects[0]).toMatchObject({ name: 'Beta', officialName: 'Beta' })
    expect(v1.projects[0].activities).toEqual([{ name: 'Reise', officialName: 'Reise', code: '' }])

    expect(() => parseProjectList('{"app":"anders"}')).toThrow(ImportError)
    expect(() => parseProjectList('{"app":"stundenbogen","kind":"projects"}')).toThrow('Projekte')
  })

  it('Projektliste importieren: neue IDs, hinten angehängt, Farbe übernommen', async () => {
    const own = await createProject({ name: 'Eigenes' })
    await importProjectList(
      [
        { name: 'Von Kollegin', code: 'P-7', color: '#ca8a04', activities: [{ name: 'Engineering', code: '10' }] },
        { name: 'Ohne Farbe', code: '', color: 'kaputt' },
      ],
      [{ name: 'Reise' }],
    )
    const projects = await db.projects.orderBy('sortOrder').toArray()
    expect(projects.map((p) => p.name)).toEqual(['Eigenes', 'Von Kollegin', 'Ohne Farbe'])
    expect(projects[1]).toMatchObject({ code: 'P-7', color: '#ca8a04', active: true })
    expect(projects[2].color).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(projects.map((p) => p.id)).size).toBe(3)
    expect(projects[0].id).toBe(own.id)
    const acts = await db.activityTypes.orderBy('sortOrder').toArray()
    const namesOf = (projectId: string | null) => acts.filter((a) => a.projectId === projectId).map((a) => a.name)
    expect(namesOf(null)).toEqual(['Büro', 'Meeting', 'Reise'])
    expect(acts.find((a) => a.projectId === projects[1].id)).toMatchObject({ name: 'Engineering', code: '10' })
    // ohne eigene Tätigkeiten: die (ergänzte) Standardliste
    expect(namesOf(projects[2].id)).toEqual(['Büro', 'Meeting', 'Reise'])
  })

  it('ergänzt fehlende Felder mit Standardwerten', () => {
    const file = parseBackup(
      JSON.stringify({
        app: 'stundenbogen',
        schemaVersion: 1,
        data: { projects: [{ id: 'p', name: 'P' }], activityTypes: [], days: [{ date: '2026-10-19' }] },
      }),
    )
    expect(file.data.projects[0]).toMatchObject({ id: 'p', code: '', active: true })
    expect(file.data.days[0]).toMatchObject({ timeMode: 'blocks', blocks: [], allocations: [] })
    expect(file.data.settings.weekdayTargets[0]).toBe(498)
  })
})

describe('Datenbank-Update', () => {
  const nine = [{ start: '07:00', end: '11:33' }, { start: '12:03', end: '16:30' }]
  const eight18 = [{ start: '07:00', end: '11:33' }, { start: '12:03', end: '15:48' }]

  it.each([
    ['v3 mit alter 9:00-Vorlage', 3, nine, '16:30'],
    ['v4 mit 8:18-Standardvorlage', 4, eight18, '16:30'],
    ['eigene Vorlage bleibt', 4, [{ start: '06:30', end: '15:00' }], '15:00'],
  ] as const)('%s → Vorlage endet %s, Höchstarbeitszeit 45 h', async (_name, version, template, expectedEnd) => {
    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const name = `upgrade-${version}-${expectedEnd}-${template.length}`
    const old = new Dexie(name)
    old.version(version).stores({ projects: 'id, sortOrder', activityTypes: 'id, sortOrder', days: 'date', settings: 'id', meta: 'key' })
    await old.table('settings').put({ id: 'settings', dayTemplate: template })
    old.close()
    const upgraded = new StundenbogenDB(name)
    const s = await upgraded.settings.get('settings')
    expect(s?.dayTemplate.at(-1)?.end).toBe(expectedEnd)
    expect(s?.weeklyMaxMinutes).toBe(45 * 60)
    upgraded.close()
  })
})

describe('Lineares Blockmodell (Datenstand 5 / Dexie v6)', () => {
  const v4Day = {
    date: '2026-10-19',
    allocations: [
      { id: 'z', projectId: 'p', activityTypeId: 'a', mode: 'duration', value: 60, note: '', blockId: 'b1' },
      { id: 'r', projectId: 'p', activityTypeId: 'a', mode: 'rest', value: 0, note: '', blockId: 'b1' },
      { id: 'h', projectId: 'p', activityTypeId: 'a', mode: 'duration', value: 30, note: '' },
    ],
  }
  const expected = ['timeline', 'blockRest', 'duration']

  it('Sicherung von Stand 4: Zeitleiste und Rest im Block bekommen eigene Modi', () => {
    const file = parseBackup(
      JSON.stringify({ app: 'stundenbogen', schemaVersion: 4, data: { projects: [], activityTypes: [], days: [v4Day] } }),
    )
    expect(file.data.days[0].allocations.map((a) => a.mode)).toEqual(expected)
  })

  it('Datenbank v5 → v6 stellt die Tage um', async () => {
    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const old = new Dexie('upgrade-v6')
    old.version(5).stores({ projects: 'id, sortOrder', activityTypes: 'id, sortOrder', days: 'date', settings: 'id', meta: 'key' })
    await old.table('days').put(v4Day)
    old.close()
    const upgraded = new StundenbogenDB('upgrade-v6')
    const day = await upgraded.days.get('2026-10-19')
    expect(day?.allocations.map((a) => a.mode)).toEqual(expected)
    expect(day?.allocations[0].blockId).toBe('b1')
    upgraded.close()
  })
})

describe('Aufgaben', () => {
  const titles = async (parentId: string | null) =>
    (await db.tasks.orderBy('sortOrder').toArray()).filter((t) => t.parentId === parentId).map((t) => t.title)

  it('anlegen (auch direkt hinter einem Stichpunkt), abhaken, sortieren', async () => {
    const p = await createProject({ name: 'Epis' })
    const a = await createTask({ projectId: p.id, parentId: null, title: ' Pläne prüfen ' })
    const b = await createTask({ projectId: p.id, parentId: null, title: 'Mail an X' })
    expect(a.title).toBe('Pläne prüfen')
    const s1 = await createTask({ projectId: p.id, parentId: a.id, title: 'EG' })
    await createTask({ projectId: p.id, parentId: a.id, title: 'OG' })
    await createTask({ projectId: p.id, parentId: a.id, title: 'UG' }, s1.id)
    expect(await titles(a.id)).toEqual(['EG', 'UG', 'OG'])

    await setTaskDone(s1.id, true, '2026-10-28')
    expect(await db.tasks.get(s1.id)).toMatchObject({ done: true, doneAt: '2026-10-28' })
    await setTaskDone(s1.id, false, '2026-10-28')
    expect(await db.tasks.get(s1.id)).toMatchObject({ done: false, doneAt: null })

    await reorderTask(b.id, a.id)
    expect(await titles(null)).toEqual(['Mail an X', 'Pläne prüfen'])
  })

  it('löschen nimmt Stichpunkte mit; Rückgängig stellt alles wieder her', async () => {
    const p = await createProject({ name: 'Epis' })
    const a = await createTask({ projectId: p.id, parentId: null, title: 'A' })
    await createTask({ projectId: p.id, parentId: a.id, title: 'a1' })
    const removed = await deleteTask(a.id)
    expect(removed).toHaveLength(2)
    expect(await db.tasks.count()).toBe(0)
    await restoreTasks(removed)
    expect(await db.tasks.count()).toBe(2)
  })

  it('Notiz als Stichpunkt übernehmen: hinten angehängt, Notiz leer', async () => {
    const p = await createProject({ name: 'Epis' })
    const a = await createTask({ projectId: p.id, parentId: null, title: 'BOXer Baukasten' })
    await createTask({ projectId: p.id, parentId: a.id, title: 'Meeting' })
    await db.tasks.update(a.id, { note: ' Rollen ' })
    const item = await noteToItem(a.id)
    expect(item).toMatchObject({ parentId: a.id, title: 'Rollen', sortOrder: 1, done: false })
    expect((await db.tasks.get(a.id))?.note).toBe('')
    expect(await noteToItem(a.id)).toBeNull() // leere Notiz: nichts
  })

  it('Projekt löschen löscht seine Aufgaben mit', async () => {
    const p = await createProject({ name: 'Weg' })
    await createTask({ projectId: p.id, parentId: null, title: 'A' })
    expect(await countProjectTasks(p.id)).toBe(1)
    expect(await deleteProject(p.id)).toBe(true)
    expect(await db.tasks.count()).toBe(0)
  })

  it('Sicherung von Stand 6 (ohne Aufgaben) lässt sich importieren', () => {
    const file = parseBackup(
      JSON.stringify({ app: 'stundenbogen', schemaVersion: 6, data: { projects: [], activityTypes: [], days: [] } }),
    )
    expect(file.data.tasks).toEqual([])
  })

  it('★ markieren; Sicherung von Stand 7 bekommt starred = false', async () => {
    const p = await createProject({ name: 'Epis' })
    const a = await createTask({ projectId: p.id, parentId: null, title: 'A' })
    expect(a.starred).toBe(false)
    await setTaskStarred(a.id, true)
    expect((await db.tasks.get(a.id))?.starred).toBe(true)

    const file = parseBackup(
      JSON.stringify({
        app: 'stundenbogen',
        schemaVersion: 7,
        data: { projects: [], activityTypes: [], days: [], tasks: [{ id: 't', projectId: 'p', title: 'Alt' }] },
      }),
    )
    expect(file.data.tasks[0].starred).toBe(false)
  })

  it('Datenbank v8 → v9 ergänzt starred', async () => {
    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const old = new Dexie('upgrade-v9')
    old.version(8).stores({
      projects: 'id, sortOrder',
      activityTypes: 'id, sortOrder',
      days: 'date',
      settings: 'id',
      meta: 'key',
      tasks: 'id, projectId, parentId, sortOrder',
    })
    await old.table('tasks').put({ id: 't', projectId: 'p', parentId: null, title: 'Alt', sortOrder: 0 })
    old.close()
    const upgraded = new StundenbogenDB('upgrade-v9')
    expect((await upgraded.tasks.get('t'))?.starred).toBe(false)
    upgraded.close()
  })

  it('Text-Import: hinten anhängen, neues Projekt, Stichpunkte; Rückgängig entfernt genau das', async () => {
    const p = await createProject({ name: 'Epis' })
    await createTask({ projectId: p.id, parentId: null, title: 'Schon da' })
    const projects = await db.projects.toArray()
    const { sections } = parseTaskText(
      '# Epis\n- [ ] !! Neu\n  - [x] Teil\n  > Notiz\n# Fremd\n- [x] Fertig\n# fremd\n- [ ] Auch fremd',
      projects,
    )
    const groups = planTaskImport(
      sections,
      [{ kind: 'project', projectId: p.id }, { kind: 'new', name: 'Fremd' }, { kind: 'new', name: 'fremd' }],
      await db.tasks.toArray(),
    )
    const result = await importTasks(groups, '2026-10-28')
    expect(result.taskCount).toBe(3)
    expect(result.projectIds).toHaveLength(1)

    const epis = await db.tasks.where('projectId').equals(p.id).toArray()
    const neu = epis.find((t) => t.title === 'Neu')!
    expect(neu).toMatchObject({ starred: true, note: 'Notiz', sortOrder: 1, done: false })
    expect(epis.find((t) => t.parentId === neu.id)).toMatchObject({ title: 'Teil', done: true, doneAt: '2026-10-28' })
    const fremd = await db.tasks.where('projectId').equals(result.projectIds[0]).sortBy('sortOrder')
    expect(fremd.map((t) => [t.title, t.sortOrder])).toEqual([
      ['Fertig', 0],
      ['Auch fremd', 1],
    ])
    expect((await db.projects.get(result.projectIds[0]))?.name).toBe('Fremd')

    await undoTaskImport(result)
    expect((await db.tasks.toArray()).map((t) => t.title)).toEqual(['Schon da'])
    expect(await db.projects.count()).toBe(1)
  })
})

describe('Tätigkeiten je Projekt (Datenstand 9 / Dexie v10)', () => {
  const v8 = {
    projects: [
      { id: 'epis', name: 'Epis', code: '', color: '#000', active: true, sortOrder: 0, createdAt: '' },
      { id: 'nie', name: 'Nie', code: '', color: '#000', active: true, sortOrder: 1, createdAt: '' },
    ],
    activityTypes: [
      { id: 'buero', name: 'Büro', active: true, sortOrder: 0 },
      { id: 'meeting', name: 'Meeting', active: true, sortOrder: 1 },
    ],
    days: [
      {
        date: '2026-10-19',
        timeMode: 'total',
        blocks: [],
        totalMinutes: 60,
        allocations: [{ id: 'a', projectId: 'epis', activityTypeId: 'meeting', mode: 'rest', value: 0, note: '' }],
        fillStrategy: 'none',
        absence: null,
        note: '',
        updatedAt: '',
      },
    ],
  }
  const check = (acts: ActivityType[], allocationTypeId: string) => {
    const named = (projectId: string | null) => acts.filter((a) => a.projectId === projectId).map((a) => a.name)
    expect(named(null)).toEqual(['Büro', 'Meeting'])
    expect(named('epis')).toEqual(['Meeting'])
    expect(named('nie')).toEqual(['Büro', 'Meeting'])
    expect(acts.find((a) => a.id === allocationTypeId)).toMatchObject({ projectId: 'epis', name: 'Meeting', code: '' })
  }

  it('Sicherung von Stand 8 wird umgestellt', () => {
    const file = parseBackup(JSON.stringify({ app: 'stundenbogen', schemaVersion: 8, data: v8 }))
    check(file.data.activityTypes, file.data.days[0].allocations[0].activityTypeId)
  })

  it('Datenbank v9 → v10 stellt um', async () => {
    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const old = new Dexie('upgrade-v10')
    old.version(9).stores({
      projects: 'id, sortOrder',
      activityTypes: 'id, sortOrder',
      days: 'date',
      settings: 'id',
      meta: 'key',
      tasks: 'id, projectId, parentId, sortOrder',
    })
    await old.table('projects').bulkPut(v8.projects)
    await old.table('activityTypes').bulkPut(v8.activityTypes)
    await old.table('days').bulkPut(v8.days)
    old.close()
    const upgraded = new StundenbogenDB('upgrade-v10')
    const acts = await upgraded.activityTypes.orderBy('sortOrder').toArray()
    check(acts, (await upgraded.days.get('2026-10-19'))!.allocations[0].activityTypeId)
    expect(await upgraded.activityTypes.where('projectId').equals('epis').count()).toBe(1)
    upgraded.close()
  })

  it('neues Projekt bekommt die Standardliste; Löschregeln; Projekt löschen nimmt Tätigkeiten mit', async () => {
    const p = await createProject({ name: 'Epis' })
    const own = () => db.activityTypes.where('projectId').equals(p.id).sortBy('sortOrder')
    expect((await own()).map((a) => a.name)).toEqual(['Büro', 'Meeting'])
    const eng = await createActivityType('Engineering', p.id, '10')
    expect(eng).toMatchObject({ projectId: p.id, code: '10', sortOrder: 2 })
    // Standardliste bleibt unberührt
    expect((await db.activityTypes.toArray()).filter((a) => a.projectId === null)).toHaveLength(2)

    const [buero, meeting] = await own()
    await updateDay('2026-10-19', (d) => ({
      ...d,
      allocations: [{ id: 'x', projectId: p.id, activityTypeId: buero.id, mode: 'rest', value: 0, note: '' }],
    }))
    expect(await deleteActivityType(buero.id)).toBe(false) // gebucht
    expect(await deleteActivityType(meeting.id)).toBe(true)
    expect(await updateActivityType(eng.id, { active: false })).toBe(true)
    expect(await updateActivityType(buero.id, { active: false })).toBe(false) // letzte aktive
    await reorderActivityType(eng.id, buero.id)
    expect((await own()).map((a) => a.name)).toEqual(['Engineering', 'Büro'])

    const q = await createProject({ name: 'Leer' })
    expect(await deleteProject(q.id)).toBe(true)
    expect(await db.activityTypes.where('projectId').equals(q.id).count()).toBe(0)
  })
})

describe('Offizieller Name (Datenstand 10 / Dexie v11)', () => {
  it('Sicherung von Stand 9: bisherige Namen werden offizielle Namen', () => {
    const file = parseBackup(
      JSON.stringify({
        app: 'stundenbogen',
        schemaVersion: 9,
        data: {
          projects: [{ id: 'p', name: 'Epis' }],
          activityTypes: [{ id: 'a', projectId: 'p', name: 'Engineering', code: '10' }],
          days: [],
        },
      }),
    )
    expect(file.data.projects[0]).toMatchObject({ name: 'Epis', officialName: 'Epis' })
    expect(file.data.activityTypes[0]).toMatchObject({ name: 'Engineering', officialName: 'Engineering', code: '10' })
  })

  it('Datenbank v10 → v11 übernimmt die Namen', async () => {
    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const old = new Dexie('upgrade-v11')
    old.version(10).stores({
      projects: 'id, sortOrder',
      activityTypes: 'id, projectId, sortOrder',
      days: 'date',
      settings: 'id',
      meta: 'key',
      tasks: 'id, projectId, parentId, sortOrder',
    })
    await old.table('projects').put({ id: 'p', name: 'Epis', code: '', color: '#000', active: true, sortOrder: 0, createdAt: '' })
    await old.table('activityTypes').put({ id: 'a', projectId: 'p', name: 'Meeting', code: '', active: true, sortOrder: 0 })
    old.close()
    const upgraded = new StundenbogenDB('upgrade-v11')
    expect((await upgraded.projects.get('p'))?.officialName).toBe('Epis')
    expect((await upgraded.activityTypes.get('a'))?.officialName).toBe('Meeting')
    upgraded.close()
  })

  it('neues Projekt: offizieller Name leer bzw. angegeben; Standardliste vererbt ihren', async () => {
    const template = (await db.activityTypes.toArray()).find((a) => a.name === 'Büro')!
    await updateActivityType(template.id, { officialName: 'Allgemein' })
    const p = await createProject({ name: 'Rollen überarbeiten', officialName: ' Epis Allg. ', code: '2295/90' })
    expect(p.officialName).toBe('Epis Allg.')
    const own = await db.activityTypes.where('projectId').equals(p.id).toArray()
    expect(own.find((a) => a.name === 'Büro')?.officialName).toBe('Allgemein')
    expect((await createProject({ name: 'Ohne' })).officialName).toBe('')
  })
})

describe('Standard-Tätigkeit (Datenstand 11 / Dexie v12)', () => {
  it('genau eine je Projekt, Reihenfolge bleibt, nochmal antippen nimmt ihn weg, deaktivieren löscht ihn', async () => {
    const p = await createProject({ name: 'Epis' })
    const own = () => db.activityTypes.where('projectId').equals(p.id).sortBy('sortOrder')
    const [buero, meeting] = await own()
    await toggleDefaultActivity(meeting.id)
    expect((await own()).map((a) => [a.name, a.isDefault])).toEqual([
      ['Büro', false],
      ['Meeting', true],
    ])
    await toggleDefaultActivity(buero.id)
    expect((await own()).map((a) => [a.name, a.isDefault])).toEqual([
      ['Büro', true],
      ['Meeting', false],
    ])
    // Standardliste bleibt unberührt
    expect((await db.activityTypes.toArray()).filter((a) => a.projectId === null).every((a) => !a.isDefault)).toBe(true)
    await toggleDefaultActivity(buero.id)
    expect((await own()).some((a) => a.isDefault)).toBe(false)

    await toggleDefaultActivity(meeting.id)
    await updateActivityType(meeting.id, { active: false })
    expect((await db.activityTypes.get(meeting.id))?.isDefault).toBe(false)
    // inaktive als Standard setzen macht sie wieder aktiv
    await toggleDefaultActivity(meeting.id)
    expect(await db.activityTypes.get(meeting.id)).toMatchObject({ active: true, isDefault: true })
  })

  it('neues Projekt erbt den Standard der Standardliste', async () => {
    const meeting = (await db.activityTypes.toArray()).find((a) => a.projectId === null && a.name === 'Meeting')!
    await toggleDefaultActivity(meeting.id)
    const p = await createProject({ name: 'Neu' })
    const own = await db.activityTypes.where('projectId').equals(p.id).toArray()
    expect(own.find((a) => a.isDefault)?.name).toBe('Meeting')
  })

  it('Sicherung von Stand 10 und Datenbank v11 → v12 bekommen isDefault = false', async () => {
    const file = parseBackup(
      JSON.stringify({
        app: 'stundenbogen',
        schemaVersion: 10,
        data: { projects: [], activityTypes: [{ id: 'a', projectId: 'p', name: 'X', officialName: 'X' }], days: [] },
      }),
    )
    expect(file.data.activityTypes[0].isDefault).toBe(false)

    const { default: Dexie } = await import('dexie')
    const { StundenbogenDB } = await import('./db')
    const old = new Dexie('upgrade-v12')
    old.version(11).stores({
      projects: 'id, sortOrder',
      activityTypes: 'id, projectId, sortOrder',
      days: 'date',
      settings: 'id',
      meta: 'key',
      tasks: 'id, projectId, parentId, sortOrder',
    })
    await old.table('activityTypes').put({ id: 'a', projectId: 'p', name: 'X', officialName: 'X', code: '', active: true, sortOrder: 0 })
    old.close()
    const upgraded = new StundenbogenDB('upgrade-v12')
    expect((await upgraded.activityTypes.get('a'))?.isDefault).toBe(false)
    upgraded.close()
  })

  it('Projektliste nimmt den Standard mit', async () => {
    const p = await createProject({ name: 'Alpha' })
    const [, meeting] = await db.activityTypes.where('projectId').equals(p.id).sortBy('sortOrder')
    await toggleDefaultActivity(meeting.id)
    const list = parseProjectList(JSON.stringify(buildProjectList(await db.projects.toArray(), await db.activityTypes.toArray())))
    expect(list.projects[0].activities?.map((a) => [a.name, a.isDefault ?? false])).toEqual([
      ['Büro', false],
      ['Meeting', true],
    ])
    await importProjectList([{ ...list.projects[0], name: 'Kopie' }], [])
    const copy = (await db.projects.toArray()).find((x) => x.name === 'Kopie')!
    const acts = await db.activityTypes.where('projectId').equals(copy.id).toArray()
    expect(acts.find((a) => a.isDefault)?.name).toBe('Meeting')
  })
})
