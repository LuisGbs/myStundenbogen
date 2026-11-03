import Dexie, { type Table } from 'dexie'
import type { ActivityType, Day, Project, Settings, Task } from '../domain/types'
import { newId } from '../domain/id'
import { addOfficialName, splitActivitiesPerProject, upgradeAllocationV5 } from '../domain/legacy'
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
  tasks!: Table<Task, string>
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
    // v6: eigene Modi „Zeitleiste“ und „Rest im Block“; jede Zeile darf einen Block haben (lineares Modell).
    this.version(6)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('days')
          .toCollection()
          .modify((day: { allocations?: { mode: string; blockId?: string }[] }) => {
            if (Array.isArray(day.allocations)) day.allocations = day.allocations.map(upgradeAllocationV5)
          })
      })
    // v7: TimeBlock.expectedEnd („voraussichtlich gehen um …“) – optional, nichts umzustellen.
    this.version(7).stores({})
    // v8: Aufgaben-Reiter – neue Tabelle für Aufgaben und Stichpunkte.
    this.version(8).stores({ tasks: 'id, projectId, parentId, sortOrder' })
    // v9: Task.starred (★ wichtig) – vorhandene Aufgaben sind nicht markiert.
    this.version(9)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((t: { starred?: unknown }) => {
            if (typeof t.starred !== 'boolean') t.starred = false
          })
      })
    // v10: Tätigkeiten je Projekt (ActivityType.projectId/code) – Standardliste + Kopien, Buchungen umgeschrieben.
    this.version(10)
      .stores({ activityTypes: 'id, projectId, sortOrder' })
      .upgrade(async (tx) => {
        const days = await tx.table('days').toArray()
        const settings = (await tx.table('settings').get('settings')) ?? null
        const result = splitActivitiesPerProject(
          { projects: await tx.table('projects').toArray(), activityTypes: await tx.table('activityTypes').toArray(), days, settings },
          newId,
        )
        await tx.table('activityTypes').clear()
        await tx.table('activityTypes').bulkPut(result.activityTypes)
        await tx.table('days').bulkPut(result.days)
        if (result.settings) await tx.table('settings').put(result.settings)
      })
    // v11: offizieller Name (Firmensoftware) für Projekte und Tätigkeiten – bisheriger Name wird übernommen.
    this.version(11)
      .stores({})
      .upgrade(async (tx) => {
        for (const table of ['projects', 'activityTypes']) {
          await tx
            .table(table)
            .toCollection()
            .modify((x: { name?: unknown; officialName?: unknown }) => {
              Object.assign(x, addOfficialName(x))
            })
        }
      })
  }
}

export const db = new StundenbogenDB()

/** Tabellen mit Nutzdaten (alles, was gesichert/exportiert wird). */
export const dataTables = () => [db.projects, db.activityTypes, db.days, db.settings, db.tasks]
