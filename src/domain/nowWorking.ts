import { summarizeDay } from './day'
import type { Allocation, Day, Minutes } from './types'

/**
 * „Ich arbeite gerade an …“ – ohne eigenes Datenfeld: Das aktive Projekt ist ein
 * „Rest im Block“ im laufenden Block. Der Block wächst mit der Uhr, also wächst
 * das Projekt mit; „Gehen (jetzt)“ beendet den Block und das Projekt behält genau
 * seine Zeit.
 */

/** Der laufende (eingestempelte, noch nicht ausgestempelte) Block. */
export function runningBlockId(day: Day): string | null {
  return day.blocks.find((b) => b.end === null && !b.planned)?.id ?? null
}

/** Das gerade aktive Projekt: der (letzte) Block-Rest im laufenden Block. */
export function activeAllocation(day: Day): Allocation | null {
  const blockId = runningBlockId(day)
  if (!blockId) return null
  return day.allocations.findLast((a) => a.mode === 'blockRest' && a.blockId === blockId) ?? null
}

/** Das aktive Projekt anhalten: Es wird zur festen Dauer mit der bisher gelaufenen Zeit (0 → entfällt). */
export function stopWorking(day: Day, nowMinutes: Minutes): Day {
  const active = activeAllocation(day)
  if (!active) return day
  const minutes = summarizeDay(day, nowMinutes).allocation.minutes[active.id] ?? 0
  return {
    ...day,
    allocations:
      minutes > 0
        ? day.allocations.map((a) => (a.id === active.id ? { ...a, mode: 'timeline', value: minutes } : a))
        : day.allocations.filter((a) => a.id !== active.id),
  }
}

/**
 * Ab jetzt an `target` arbeiten: Das bisher aktive Projekt wird angehalten, das neue
 * kommt als „Rest im Block“ ans Ende des laufenden Blocks und läuft dort mit.
 * Ist dasselbe Projekt schon aktiv, bleibt alles, wie es ist. Ohne laufenden Block: unverändert.
 */
export function startWorkingOn(
  day: Day,
  target: { projectId: string; activityTypeId: string },
  nowMinutes: Minutes,
  newId: string,
): Day {
  const blockId = runningBlockId(day)
  if (!blockId) return day
  const active = activeAllocation(day)
  if (active && active.projectId === target.projectId && active.activityTypeId === target.activityTypeId) return day
  const stopped = stopWorking(day, nowMinutes)
  const created: Allocation = { id: newId, ...target, mode: 'blockRest', value: 0, note: '', blockId }
  return { ...stopped, allocations: [...stopped.allocations, created] }
}
