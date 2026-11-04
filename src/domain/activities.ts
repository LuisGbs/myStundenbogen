import type { ActivityType } from './types'

const bySortOrder = (a: ActivityType, b: ActivityType) => a.sortOrder - b.sortOrder

/** Standardliste (Vorlage für neue Projekte), sortiert. */
export function templateActivities(all: ActivityType[]): ActivityType[] {
  return all.filter((a) => a.projectId === null).sort(bySortOrder)
}

/**
 * Tätigkeiten eines Projekts, sortiert: die aktiven – und `includeId` (die gerade
 * gewählte) auch, wenn sie inaktiv ist. `includeId` null/undefined = nur aktive.
 */
export function activitiesOf(projectId: string, all: ActivityType[], includeId?: string | null): ActivityType[] {
  return all.filter((a) => a.projectId === projectId && (a.active || a.id === includeId)).sort(bySortOrder)
}

/** Alle Tätigkeiten eines Projekts (auch inaktive), sortiert – für die Projekte-Seite. */
export function allActivitiesOf(projectId: string, all: ActivityType[]): ActivityType[] {
  return all.filter((a) => a.projectId === projectId).sort(bySortOrder)
}

/**
 * Wirksamer Standard einer Gruppe (ein Projekt bzw. die Standardliste):
 * die aktive als Standard markierte, sonst die erste aktive.
 */
export function effectiveDefault(group: ActivityType[]): ActivityType | undefined {
  const active = [...group].sort(bySortOrder).filter((a) => a.active)
  return active.find((a) => a.isDefault) ?? active[0]
}

/**
 * Tätigkeit für eine Zeile in `projectId`: die mit gleichem Namen wie bisher
 * (`preferName`, nur beim Projektwechsel einer Zeile), sonst der Standard des
 * Projekts, sonst irgendeine. '' = das Projekt hat keine Tätigkeit.
 */
export function defaultActivityId(projectId: string, all: ActivityType[], preferName?: string): string {
  const own = allActivitiesOf(projectId, all)
  const norm = (s: string) => s.trim().toLocaleLowerCase('de')
  return (
    (preferName ? own.find((a) => a.active && norm(a.name) === norm(preferName)) : undefined)?.id ??
    effectiveDefault(own)?.id ??
    own[0]?.id ??
    ''
  )
}

/** Tätigkeiten eines neuen Projekts aus der Standardliste (nur aktive, Reihenfolge bleibt). */
export function copyTemplate(projectId: string, all: ActivityType[], makeId: () => string): ActivityType[] {
  return templateActivities(all)
    .filter((a) => a.active)
    .map((a, i) => ({
      id: makeId(),
      projectId,
      name: a.name,
      officialName: a.officialName,
      code: a.code,
      active: true,
      isDefault: a.isDefault,
      sortOrder: i,
    }))
}

/** Anzeigename mit Nummer: „Engineering (10)“. */
export function activityLabel(a: { name: string; code?: string }): string {
  return a.code ? `${a.name} (${a.code})` : a.name
}

/**
 * Zeile auf ein anderes Projekt umhängen: Gehört die Tätigkeit schon zum neuen
 * Projekt, bleibt sie; sonst die gleichnamige dort bzw. der Standard des Projekts.
 */
export function withProject<T extends { projectId: string; activityTypeId: string }>(
  row: T,
  projectId: string,
  all: ActivityType[],
): T {
  const current = all.find((a) => a.id === row.activityTypeId)
  if (current?.projectId === projectId) return { ...row, projectId }
  return { ...row, projectId, activityTypeId: defaultActivityId(projectId, all, current?.name) }
}
