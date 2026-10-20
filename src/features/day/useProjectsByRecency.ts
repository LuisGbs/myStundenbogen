import { useLiveQuery } from 'dexie-react-hooks'
import type { ISODate, Project } from '../../domain/types'
import { recentProjectIds } from '../../storage/repo'

/** Aktive Projekte, zuletzt gebuchte zuerst (für Schnellauswahl und Zeitleiste). */
export function useProjectsByRecency(date: ISODate, projects: Project[]): Project[] {
  const recentIds = useLiveQuery(() => recentProjectIds(date, 10), [date]) ?? []
  const active = projects.filter((p) => p.active)
  const byId = new Map(active.map((p) => [p.id, p]))
  return [...recentIds.flatMap((id) => byId.get(id) ?? []), ...active].filter((p, i, all) => all.indexOf(p) === i)
}
