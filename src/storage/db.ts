import Dexie, { type Table } from 'dexie'
import type { ActivityType, Day, Project, Settings } from '../domain/types'
import { DEFAULT_DAY_TEMPLATE, OLD_DEFAULT_DAY_TEMPLATE } from '../domain/plan'

export interface MetaEntry {
  key: string
  value: unknown
}

/**
 * Lokale Datenbank im Browser (IndexedDB). Verlässt nie den Rechner.
 *
 * Schema-Änderungen: Neue `this.version(n)` anhängen (alte nie ändern) UND
 * eine passende Migration in exportImport.ts ergänzen, damit alte
 * Sicherungsdateien weiter importiert werden können.
 */
export class StundenbogenDB extends Dexie {
  // IDs werden immer selbst vergeben (UUID bzw. Datum), daher einfache Tables.
  projects!: Table<Project, string>
  activityTypes!: Table<ActivityType, string>
  days!: Table<Day, string>
  settings!: Table<Settings, string>
  /** Technische Infos (z.B. Sicherungsordner), nicht Teil des Exports. */
  meta!: Table<MetaEntry, string>

  constructor(name = 'stundenbogen') {
    super(name)
    this.version(1).stores({
      projects: 'id, sortOrder',
      activityTypes: 'id, sortOrder',
      days: 'date',
      settings: 'id',
      meta: 'key',
    })
    // v2: Allocation.blockId (optional) – Zeitleisten-Segmente. Kein Index, keine Datenänderung nötig.
    this.version(2).stores({})
    // v3: TimeBlock.planned (optional) und Settings.dayTemplate – Standardwert kommt über die Migration.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((s: { dayTemplate?: unknown }) => {
            if (!Array.isArray(s.dayTemplate)) s.dayTemplate = DEFAULT_DAY_TEMPLATE.map((b) => ({ ...b }))
          })
      })
    // v4: Standard-Vorlage 8:18 statt 9:00 – nur ersetzen, wenn noch die alte Standard-Vorlage drinsteht.
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((s: { dayTemplate?: unknown }) => {
            if (JSON.stringify(s.dayTemplate) === JSON.stringify(OLD_DEFAULT_DAY_TEMPLATE)) {
              s.dayTemplate = DEFAULT_DAY_TEMPLATE.map((b) => ({ ...b }))
            }
          })
      })
  }
}

export const db = new StundenbogenDB()

/** Tabellen mit Nutzdaten (alles, was gesichert/exportiert wird). */
export const dataTables = () => [db.projects, db.activityTypes, db.days, db.settings]
