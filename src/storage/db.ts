import Dexie, { type Table } from 'dexie'
import type { ActivityType, Day, Project, Settings } from '../domain/types'

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
  }
}

export const db = new StundenbogenDB()

/** Tabellen mit Nutzdaten (alles, was gesichert/exportiert wird). */
export const dataTables = () => [db.projects, db.activityTypes, db.days, db.settings]
