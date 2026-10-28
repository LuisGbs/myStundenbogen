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

/** Offene Aufgaben je Projekt (für die Zahl in der Projektliste). */
export function openTaskCounts(tasks: Task[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    if (t.parentId === null && !t.done) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1)
  }
  return counts
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
