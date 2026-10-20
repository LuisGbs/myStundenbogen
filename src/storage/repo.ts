import type { Table } from 'dexie'
import { nextProjectColor } from '../domain/colors'
import { addDays } from '../domain/date'
import { emptyDay, isEmptyDay } from '../domain/day'
import { newId } from '../domain/id'
import type { SharedActivityType, SharedProject } from '../domain/projectTransfer'
import type { ActivityType, Day, ISODate, Project, Settings } from '../domain/types'
import { db } from './db'
import { recordDayChange } from './history'

// ---------- Sortierung (gemeinsam für Projekte und Tätigkeitsarten) ----------

type Sortable = { id: string; sortOrder: number }

/**
 * Verschiebt einen Eintrag um eine Position. `visible` bestimmt, mit welchem
 * Nachbarn getauscht wird (z.B. nur aktive, wenn inaktive ausgeblendet sind).
 */
async function moveItem<T extends Sortable>(
  table: Table<T, string>,
  id: string,
  direction: -1 | 1,
  visible: (item: T) => boolean = () => true,
): Promise<void> {
  await db.transaction('rw', table, async () => {
    const items = await table.orderBy('sortOrder').toArray()
    const i = items.findIndex((x) => x.id === id)
    if (i < 0) return
    let j = i + direction
    while (j >= 0 && j < items.length && !visible(items[j])) j += direction
    if (j < 0 || j >= items.length) return
    ;[items[i], items[j]] = [items[j], items[i]]
    await table.bulkPut(items.map((x, k) => ({ ...x, sortOrder: k })))
  })
}

async function nextSortOrder(table: Table<Sortable, string>): Promise<number> {
  const last = await table.orderBy('sortOrder').last()
  return last ? last.sortOrder + 1 : 0
}

// ---------- Projekte ----------

export async function createProject(input: { name: string; code?: string }): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const all = await db.projects.toArray()
    const project: Project = {
      id: newId(),
      name: input.name.trim(),
      code: (input.code ?? '').trim(),
      color: nextProjectColor(all.map((p) => p.color)),
      active: true,
      sortOrder: await nextSortOrder(db.projects),
      createdAt: new Date().toISOString(),
    }
    await db.projects.add(project)
    return project
  })
}

export async function updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<void> {
  await db.projects.update(id, patch)
}

export async function moveProject(id: string, direction: -1 | 1, onlyActive: boolean): Promise<void> {
  await moveItem(db.projects, id, direction, (p) => !onlyActive || p.active)
}

async function isReferenced(predicate: (day: Day) => boolean): Promise<boolean> {
  return (await db.days.filter(predicate).count()) > 0
}

export function isProjectInUse(id: string): Promise<boolean> {
  return isReferenced((d) => d.allocations.some((a) => a.projectId === id))
}

/** Löscht nur unbenutzte Projekte. Gibt false zurück, wenn es Buchungen gibt. */
export async function deleteProject(id: string): Promise<boolean> {
  return db.transaction('rw', db.projects, db.days, db.settings, async () => {
    if (await isProjectInUse(id)) return false
    await db.projects.delete(id)
    const settings = await db.settings.get('settings')
    if (settings?.defaultFill?.projectId === id) await db.settings.update('settings', { defaultFill: null })
    return true
  })
}

/**
 * Übernimmt ausgewählte Einträge einer geteilten Projektliste. Alles bekommt
 * neue IDs und wird hinten angehängt.
 */
export async function importProjectList(projects: SharedProject[], activityTypes: SharedActivityType[]): Promise<void> {
  await db.transaction('rw', db.projects, db.activityTypes, async () => {
    const colors = (await db.projects.toArray()).map((p) => p.color)
    let projectOrder = await nextSortOrder(db.projects)
    for (const p of projects) {
      const color = /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : nextProjectColor(colors)
      colors.push(color)
      await db.projects.add({
        id: newId(),
        name: p.name.trim(),
        code: p.code.trim(),
        color,
        active: true,
        sortOrder: projectOrder++,
        createdAt: new Date().toISOString(),
      })
    }
    let typeOrder = await nextSortOrder(db.activityTypes)
    for (const a of activityTypes) {
      await db.activityTypes.add({ id: newId(), name: a.name.trim(), active: true, sortOrder: typeOrder++ })
    }
  })
}

// ---------- Tätigkeitsarten ----------

export async function createActivityType(name: string): Promise<ActivityType> {
  return db.transaction('rw', db.activityTypes, async () => {
    const activityType: ActivityType = {
      id: newId(),
      name: name.trim(),
      active: true,
      sortOrder: await nextSortOrder(db.activityTypes),
    }
    await db.activityTypes.add(activityType)
    return activityType
  })
}

export async function updateActivityType(id: string, patch: Partial<Omit<ActivityType, 'id'>>): Promise<void> {
  await db.activityTypes.update(id, patch)
}

export async function moveActivityType(id: string, direction: -1 | 1): Promise<void> {
  await moveItem(db.activityTypes, id, direction)
}

export function isActivityTypeInUse(id: string): Promise<boolean> {
  return isReferenced((d) => d.allocations.some((a) => a.activityTypeId === id))
}

export async function deleteActivityType(id: string): Promise<boolean> {
  return db.transaction('rw', db.activityTypes, db.days, db.settings, async () => {
    if (await isActivityTypeInUse(id)) return false
    await db.activityTypes.delete(id)
    const settings = await db.settings.get('settings')
    if (settings?.defaultFill?.activityTypeId === id) await db.settings.update('settings', { defaultFill: null })
    return true
  })
}

// ---------- Tage ----------

/**
 * Liest den Tag, wendet die Änderung an und speichert in einer Transaktion.
 * Ein komplett leerer Tag wird gelöscht statt gespeichert.
 */
export async function updateDay(date: ISODate, change: (day: Day) => Day): Promise<void> {
  const { before, after } = await db.transaction('rw', db.days, async () => {
    const stored = (await db.days.get(date)) ?? null
    const next = change(stored ?? emptyDay(date))
    if (isEmptyDay(next)) {
      await db.days.delete(date)
      return { before: stored, after: null }
    }
    const saved = { ...next, date, updatedAt: new Date().toISOString() }
    await db.days.put(saved)
    return { before: stored, after: saved }
  })
  // Für Rückgängig festhalten – nur, wenn sich inhaltlich etwas geändert hat.
  if (!sameDayContent(before, after)) recordDayChange(date, before, after)
}

function sameDayContent(a: Day | null, b: Day | null): boolean {
  if (!a || !b) return a === b
  return JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' })
}

export function getDaysInRange(from: ISODate, to: ISODate): Promise<Day[]> {
  return db.days.where('date').between(from, to, true, true).toArray()
}

/** Projekte, die in den letzten Wochen vor `date` gebucht wurden – neueste zuerst. */
export async function recentProjectIds(date: ISODate, limit = 6): Promise<string[]> {
  const days = await db.days.where('date').between(addDays(date, -28), date, true, true).reverse().toArray()
  const ids: string[] = []
  for (const day of days) {
    for (const a of day.allocations) {
      if (!ids.includes(a.projectId)) ids.push(a.projectId)
    }
  }
  return ids.slice(0, limit)
}

// ---------- Einstellungen ----------

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.settings.update('settings', patch)
}

/**
 * Änderung, die auf dem aktuellen Stand aufbaut (z.B. ein Feld in balanceStart):
 * liest und schreibt in einer Transaktion, damit schnelle Folgeänderungen nichts überschreiben.
 */
export async function changeSettings(fn: (current: Settings) => Partial<Omit<Settings, 'id'>>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get('settings')
    if (current) await db.settings.update('settings', fn(current))
  })
}
