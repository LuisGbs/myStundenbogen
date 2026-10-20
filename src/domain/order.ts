/**
 * Neue Reihenfolge nach dem Ziehen eines Eintrags (Projekte, Tätigkeitsarten).
 * `ids` = alle Einträge in der bisherigen Reihenfolge; `beforeId` = sichtbarer
 * Eintrag, vor dem abgelegt wurde (null = hinter den letzten sichtbaren). Nicht
 * sichtbare Einträge (z.B. ausgeblendete inaktive) bleiben, wo sie sind.
 */
export function reorderIds(ids: string[], movedId: string, beforeId: string | null, visible: (id: string) => boolean = () => true): string[] {
  if (movedId === beforeId || !ids.includes(movedId)) return ids
  const rest = ids.filter((id) => id !== movedId)
  let i = beforeId ? rest.indexOf(beforeId) : -1
  if (i < 0) {
    const lastVisible = rest.findLastIndex(visible)
    i = lastVisible + 1
  }
  return [...rest.slice(0, i), movedId, ...rest.slice(i)]
}
