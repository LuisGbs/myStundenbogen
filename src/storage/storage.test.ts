import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { buildProjectList } from '../domain/projectTransfer'
import {
  collectBackup,
  ImportError,
  parseBackup,
  parseProjectList,
  restoreBackup,
  serializeBackup,
} from './exportImport'
import {
  createProject,
  deleteProject,
  importProjectList,
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
    const before = await collectBackup()
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
    expect(parsed.activityTypes.map((a) => a.name)).toEqual(['Büro', 'Meeting'])

    const fromBackup = parseProjectList(serializeBackup(await collectBackup()))
    expect(fromBackup.projects.map((p) => p.name)).toEqual(['Alpha'])

    expect(() => parseProjectList('{"app":"anders"}')).toThrow(ImportError)
    expect(() => parseProjectList('{"app":"stundenbogen","kind":"projects"}')).toThrow('Projekte')
  })

  it('Projektliste importieren: neue IDs, hinten angehängt, Farbe übernommen', async () => {
    const own = await createProject({ name: 'Eigenes' })
    await importProjectList(
      [{ name: 'Von Kollegin', code: 'P-7', color: '#ca8a04' }, { name: 'Ohne Farbe', code: '', color: 'kaputt' }],
      [{ name: 'Reise' }],
    )
    const projects = await db.projects.orderBy('sortOrder').toArray()
    expect(projects.map((p) => p.name)).toEqual(['Eigenes', 'Von Kollegin', 'Ohne Farbe'])
    expect(projects[1]).toMatchObject({ code: 'P-7', color: '#ca8a04', active: true })
    expect(projects[2].color).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(projects.map((p) => p.id)).size).toBe(3)
    expect(projects[0].id).toBe(own.id)
    expect((await db.activityTypes.orderBy('sortOrder').toArray()).map((a) => a.name)).toEqual(['Büro', 'Meeting', 'Reise'])
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
