import type { Day, ISODate } from '../domain/types'
import { db } from './db'

/**
 * Rückgängig/Wiederholen für Tagesänderungen. Jede Änderung über updateDay()
 * wird hier mit Vorher/Nachher festgehalten (nur im Speicher, solange die Seite
 * offen ist). null = an diesem Tag war bzw. ist nichts gespeichert.
 */
export interface HistoryEntry {
  date: ISODate
  before: Day | null
  after: Day | null
  at: number
}

export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
}

const LIMIT = 100
/** Änderungen am selben Tag innerhalb dieser Zeit gelten als ein Schritt (z.B. Pfeiltasten am Griff). */
const MERGE_MS = 1000

let undoStack: HistoryEntry[] = []
let redoStack: HistoryEntry[] = []
let state: HistoryState = { canUndo: false, canRedo: false }
const listeners = new Set<() => void>()

function emit() {
  state = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 }
  listeners.forEach((l) => l())
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getHistoryState(): HistoryState {
  return state
}

export function recordDayChange(date: ISODate, before: Day | null, after: Day | null, now = Date.now()): void {
  const last = undoStack.at(-1)
  if (last && last.date === date && now - last.at < MERGE_MS) {
    undoStack[undoStack.length - 1] = { ...last, after, at: now }
  } else {
    undoStack = [...undoStack, { date, before, after, at: now }].slice(-LIMIT)
  }
  redoStack = []
  emit()
}

async function apply(date: ISODate, day: Day | null): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    if (day) await db.days.put(day)
    else await db.days.delete(date)
  })
}

/** Nimmt die letzte Änderung zurück. Gibt das betroffene Datum zurück (oder null). */
export async function undo(): Promise<ISODate | null> {
  const entry = undoStack.at(-1)
  if (!entry) return null
  undoStack = undoStack.slice(0, -1)
  redoStack = [...redoStack, entry]
  emit()
  await apply(entry.date, entry.before)
  return entry.date
}

export async function redo(): Promise<ISODate | null> {
  const entry = redoStack.at(-1)
  if (!entry) return null
  redoStack = redoStack.slice(0, -1)
  undoStack = [...undoStack, { ...entry, at: 0 }] // at: 0 → wird nicht mit der nächsten Änderung zusammengefasst
  emit()
  await apply(entry.date, entry.after)
  return entry.date
}

export function clearHistory(): void {
  undoStack = []
  redoStack = []
  emit()
}
