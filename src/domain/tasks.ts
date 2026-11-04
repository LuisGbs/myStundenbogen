import type { Task } from './types'

/** Eine Aufgabe mit ihren Stichpunkten (beides nach sortOrder). */
export interface TaskNode {
  task: Task
  items: Task[]
}

const bySortOrder = (a: Task, b: Task) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)

/** Aufgaben eines Projekts mit ihren Stichpunkten, getrennt nach offen (★ zuerst) und erledigt. */
export function taskTree(tasks: Task[], projectId: string): { open: TaskNode[]; done: TaskNode[] } {
  const own = tasks.filter((t) => t.projectId === projectId)
  const nodes = own
    .filter((t) => t.parentId === null)
    .sort(bySortOrder)
    .map((task) => ({ task, items: own.filter((i) => i.parentId === task.id).sort(bySortOrder) }))
  // Wichtige (★) zuerst, sonst eigene Reihenfolge
  const open = nodes.filter((n) => !n.task.done)
  return {
    open: [...open.filter((n) => n.task.starred), ...open.filter((n) => !n.task.starred)],
    done: nodes.filter((n) => n.task.done),
  }
}

/** Fortschritt „2/5“ einer Aufgabe (Stichpunkte). */
export function progress(items: Task[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length }
}

/** Offene Aufgaben: mit ★ (wichtig) und ohne. */
export interface OpenCount {
  starred: number
  other: number
}

/** Offene Aufgaben je Projekt, getrennt nach ★ und ohne (Stichpunkte zählen nicht). */
export function openTaskCounts(tasks: Task[]): Map<string, OpenCount> {
  const counts = new Map<string, OpenCount>()
  for (const t of tasks) {
    if (t.parentId !== null || t.done) continue
    const c = counts.get(t.projectId) ?? { starred: 0, other: 0 }
    if (t.starred) c.starred++
    else c.other++
    counts.set(t.projectId, c)
  }
  return counts
}

/** Alle offenen Aufgaben eines Zählers (fehlt = 0). */
export function totalOpen(c: OpenCount | undefined): number {
  return c ? c.starred + c.other : 0
}

/** Summe mehrerer Zähler (z.B. „Alle“). */
export function sumCounts(counts: Iterable<OpenCount>): OpenCount {
  const sum = { starred: 0, other: 0 }
  for (const c of counts) {
    sum.starred += c.starred
    sum.other += c.other
  }
  return sum
}

/** „★ 2 · 5 weitere offen“ bzw. „5 offen“. */
export function openCountText(c: OpenCount): string {
  if (c.starred === 0) return `${c.other} offen`
  return c.other === 0 ? `★ ${c.starred} offen` : `★ ${c.starred} · ${c.other} weitere offen`
}

/**
 * Sortierwerte, wenn ein neuer Eintrag direkt hinter `afterId` eingefügt wird
 * (null = ans Ende). Gibt die neue Reihenfolge der Geschwister-IDs zurück,
 * der neue Eintrag steht als `newId` darin.
 */
export function insertAfter(siblingIds: string[], newId: string, afterId: string | null): string[] {
  const i = afterId === null ? -1 : siblingIds.indexOf(afterId)
  if (i < 0) return [...siblingIds, newId]
  return [...siblingIds.slice(0, i + 1), newId, ...siblingIds.slice(i + 1)]
}
