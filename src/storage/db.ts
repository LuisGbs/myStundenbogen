import Dexie, { type Table } from 'dexie'
import type { ActivityType, Day, Project, Settings } from '../domain/types'
import { TEMPLATE_8H18, TEMPLATE_9H } from '../domain/plan'
import { DEFAULT_WEEKLY_MAX } from '../domain/target'

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
            if (!Array.isArray(s.dayTemplate)) s.dayTemplate = TEMPLATE_9H.map((b) => ({ ...b }))
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
            if (JSON.stringify(s.dayTemplate) === JSON.stringify(TEMPLATE_9H)) {
              s.dayTemplate = TEMPLATE_8H18.map((b) => ({ ...b }))
            }
          })
      })
    // v5: Standard-Vorlage wieder 9:00 (Überstunden sammeln) – nur, wenn noch die 8:18-Standardvorlage drinsteht;
    //     neu: wöchentliche Höchstarbeitszeit (Standard 45 h).
    this.version(5)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((s: { dayTemplate?: unknown; weeklyMaxMinutes?: unknown }) => {
            if (JSON.stringify(s.dayTemplate) === JSON.stringify(TEMPLATE_8H18)) {
              s.dayTemplate = TEMPLATE_9H.map((b) => ({ ...b }))
            }
            if (typeof s.weeklyMaxMinutes !== 'number') s.weeklyMaxMinutes = DEFAULT_WEEKLY_MAX
          })
      })
  }
}

export const db = new StundenbogenDB()

/** Tabellen mit Nutzdaten (alles, was gesichert/exportiert wird). */
export const dataTables = () => [db.projects, db.activityTypes, db.days, db.settings]
