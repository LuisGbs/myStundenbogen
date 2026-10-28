import { isISODate } from '../domain/date'
import { emptyDay } from '../domain/day'
import { upgradeAllocationV5 } from '../domain/legacy'
import type { ProjectListFile } from '../domain/projectTransfer'
import type { ActivityType, Day, Project, Settings, Task } from '../domain/types'
import { db } from './db'
import { clearHistory } from './history'
import { defaultSettings } from './seed'

/**
 * Version des Sicherungsformats. Bei jeder Änderung am Datenmodell erhöhen und
 * in MIGRATIONS eine Funktion „von Version n auf n+1“ ergänzen.
 */
export const SCHEMA_VERSION = 7

const MIGRATIONS: Record<number, (data: Record<string, unknown>) => Record<string, unknown>> = {
  // 1 → 2: Allocation.blockId ist neu und optional – alte Zeilen bleiben „frei verteilt“.
  1: (data) => data,
  // 2 → 3: TimeBlock.planned ist neu und optional; Settings.dayTemplate ergänzt parseBackup über die Standardwerte.
  2: (data) => data,
  // 3 → 4: Settings.weeklyMaxMinutes – ergänzt parseBackup über die Standardwerte.
  3: (data) => data,
  // 4 → 5: Modi „timeline“ und „blockRest“ (vorher duration/rest mit blockId).
  4: (data) => ({
    ...data,
    days: Array.isArray(data.days)
      ? data.days.map((d: { allocations?: unknown }) =>
          d && Array.isArray(d.allocations) ? { ...d, allocations: d.allocations.map(upgradeAllocationV5) } : d,
        )
      : data.days,
  }),
  // 5 → 6: TimeBlock.expectedEnd ist neu und optional.
  5: (data) => data,
  // 6 → 7: Aufgaben (Aufgaben-Reiter) – ältere Sicherungen haben keine.
  6: (data) => ({ ...data, tasks: Array.isArray(data.tasks) ? data.tasks : [] }),
}

export interface BackupData {
  projects: Project[]
  activityTypes: ActivityType[]
  days: Day[]
  settings: Settings
  tasks: Task[]
}

export interface BackupFile {
  app: 'stundenbogen'
  schemaVersion: number
  exportedAt: string
  data: BackupData
}

export class ImportError extends Error {}

export async function collectBackup(): Promise<BackupFile> {
  return db.transaction('r', db.projects, db.activityTypes, db.days, db.settings, db.tasks, async () => ({
    app: 'stundenbogen' as const,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      projects: await db.projects.orderBy('sortOrder').toArray(),
      activityTypes: await db.activityTypes.orderBy('sortOrder').toArray(),
      days: await db.days.orderBy('date').toArray(),
      settings: (await db.settings.get('settings')) ?? defaultSettings(),
      tasks: await db.tasks.orderBy('sortOrder').toArray(),
    },
  }))
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 1)
}

export function backupFileName(date: string): string {
  return `stundenbogen-${date}.json`
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asArray(v: unknown, what: string): Record<string, unknown>[] {
  if (!Array.isArray(v) || !v.every(isRecord)) throw new ImportError(`Ungültige Sicherung: „${what}“ fehlt oder ist beschädigt.`)
  return v
}

/** Liest eine Sicherungsdatei, prüft sie und bringt sie auf den aktuellen Stand. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('Die Datei ist keine gültige JSON-Datei.')
  }
  if (!isRecord(raw) || raw.app !== 'stundenbogen') {
    throw new ImportError('Das ist keine Sicherung dieser App.')
  }
  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ImportError('Die Sicherung hat keine gültige Versionsnummer.')
  }
  if (version > SCHEMA_VERSION) {
    throw new ImportError('Die Sicherung stammt aus einer neueren App-Version. Bitte die Seite neu laden.')
  }
  if (!isRecord(raw.data)) throw new ImportError('Ungültige Sicherung: Daten fehlen.')

  let data = raw.data
  for (let v = version; v < SCHEMA_VERSION; v++) data = MIGRATIONS[v](data)

  const projects = asArray(data.projects, 'Projekte').map((p): Project => {
    if (typeof p.id !== 'string' || typeof p.name !== 'string') throw new ImportError('Ungültiges Projekt in der Sicherung.')
    return { code: '', color: '#2563eb', active: true, sortOrder: 0, createdAt: '', ...p } as Project
  })
  const activityTypes = asArray(data.activityTypes, 'Tätigkeitsarten').map((a): ActivityType => {
    if (typeof a.id !== 'string' || typeof a.name !== 'string') throw new ImportError('Ungültige Tätigkeitsart in der Sicherung.')
    return { active: true, sortOrder: 0, ...a } as ActivityType
  })
  const days = asArray(data.days, 'Tage').map((d): Day => {
    if (typeof d.date !== 'string' || !isISODate(d.date)) throw new ImportError('Ungültiger Tag in der Sicherung.')
    return { ...emptyDay(d.date), ...d } as Day
  })
  const settings = { ...defaultSettings(), ...(isRecord(data.settings) ? data.settings : {}), id: 'settings' } as Settings
  const tasks = asArray(data.tasks ?? [], 'Aufgaben').map((t): Task => {
    if (typeof t.id !== 'string' || typeof t.projectId !== 'string' || typeof t.title !== 'string') {
      throw new ImportError('Ungültige Aufgabe in der Sicherung.')
    }
    return { parentId: null, note: '', done: false, doneAt: null, sortOrder: 0, createdAt: '', ...t } as Task
  })

  return {
    app: 'stundenbogen',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    data: { projects, activityTypes, days, settings, tasks },
  }
}

/** Ersetzt ALLE Daten durch den Inhalt der Sicherung. */
export async function restoreBackup(file: BackupFile): Promise<void> {
  clearHistory()
  const { projects, activityTypes, days, settings, tasks } = file.data
  await db.transaction('rw', [db.projects, db.activityTypes, db.days, db.settings, db.tasks], async () => {
    await Promise.all([db.projects.clear(), db.activityTypes.clear(), db.days.clear(), db.settings.clear(), db.tasks.clear()])
    await db.tasks.bulkPut(tasks)
    await db.projects.bulkPut(projects)
    await db.activityTypes.bulkPut(activityTypes)
    await db.days.bulkPut(days)
    await db.settings.put(settings)
  })
}

// ---------- Projektliste (zum Teilen mit Kollegen) ----------

export function projectListFileName(date: string): string {
  return `stundenbogen-projekte-${date}.json`
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Liest eine geteilte Projektliste. Eine komplette Sicherung wird auch
 * akzeptiert – daraus werden nur Projekte und Tätigkeitsarten genommen.
 */
export function parseProjectList(text: string): ProjectListFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('Die Datei ist keine gültige JSON-Datei.')
  }
  if (!isRecord(raw) || raw.app !== 'stundenbogen') {
    throw new ImportError('Das ist keine Projektliste dieser App.')
  }
  const source = raw.kind === 'projects' ? raw : isRecord(raw.data) ? raw.data : null
  if (!source) throw new ImportError('In der Datei wurden keine Projekte gefunden.')

  const projects = asArray(source.projects, 'Projekte')
    .map((p) => ({ name: str(p.name).trim(), code: str(p.code).trim(), color: str(p.color) }))
    .filter((p) => p.name !== '')
  const activityTypes = (Array.isArray(source.activityTypes) ? asArray(source.activityTypes, 'Tätigkeitsarten') : [])
    .map((a) => ({ name: str(a.name).trim() }))
    .filter((a) => a.name !== '')

  return {
    app: 'stundenbogen',
    kind: 'projects',
    schemaVersion: 1,
    exportedAt: str(raw.exportedAt),
    projects,
    activityTypes,
  }
}
