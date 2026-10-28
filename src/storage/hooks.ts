import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import type { ActivityType, Day, ISODate, Project, Settings, Task } from '../domain/types'
import { getBackupState, subscribeBackup, type BackupState } from './backup'
import { db } from './db'
import { getHistoryState, subscribeHistory, type HistoryState } from './history'
import { getDaysInRange } from './repo'

// Alle Hooks liefern `undefined`, solange noch geladen wird.
// Die Oberfläche aktualisiert sich automatisch bei jeder Datenänderung.

/** null = noch keine Einstellungen (erster Start). */
export function useSettings(): Settings | null | undefined {
  return useLiveQuery(async () => (await db.settings.get('settings')) ?? null)
}

export function useProjects(): Project[] | undefined {
  return useLiveQuery(() => db.projects.orderBy('sortOrder').toArray())
}

/** Alle Aufgaben und Stichpunkte (klein genug, um sie komplett zu laden). */
export function useTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.orderBy('sortOrder').toArray())
}

export function useActivityTypes(): ActivityType[] | undefined {
  return useLiveQuery(() => db.activityTypes.orderBy('sortOrder').toArray())
}

/** null = für diesen Tag ist noch nichts gespeichert. */
export function useDay(date: ISODate): Day | null | undefined {
  return useLiveQuery(async () => (await db.days.get(date)) ?? null, [date])
}

export function useDaysInRange(from: ISODate, to: ISODate): Day[] | undefined {
  return useLiveQuery(() => getDaysInRange(from, to), [from, to])
}

export function useBackupState(): BackupState {
  return useSyncExternalStore(subscribeBackup, getBackupState)
}

/** Ob Rückgängig/Wiederholen gerade möglich ist. */
export function useHistory(): HistoryState {
  return useSyncExternalStore(subscribeHistory, getHistoryState)
}
