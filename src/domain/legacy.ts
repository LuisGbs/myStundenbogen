/**
 * Umstellungen alter Datenstände. Diese Funktionen bleiben für immer so, wie sie
 * sind – sie beschreiben, was ein bestimmter alter Stand bedeutete.
 */

interface AllocationV4 {
  mode: string
  blockId?: string
}

/**
 * Datenstand 4 → 5 (Dexie v6): Bis Stand 4 hieß „feste Dauer mit Block“ Zeitleiste
 * und „Rest mit Block“ Rest im Block. Ab Stand 5 sind das eigene Modi; eine Blockangabe
 * ist für alle Modi erlaubt und bedeutet nur noch „steht in diesem Block“.
 */
export function upgradeAllocationV5<T extends AllocationV4>(allocation: T): T {
  if (!allocation.blockId) return allocation
  if (allocation.mode === 'duration') return { ...allocation, mode: 'timeline' }
  if (allocation.mode === 'rest') return { ...allocation, mode: 'blockRest' }
  return allocation
}

interface LegacyActivityType {
  id: string
  name?: unknown
  active?: unknown
  sortOrder?: unknown
  projectId?: unknown
  code?: unknown
}

interface LegacyData {
  projects: { id: string }[]
  activityTypes: LegacyActivityType[]
  days: { allocations?: { projectId: string; activityTypeId: string }[] }[]
  settings: { defaultFill?: { projectId: string; activityTypeId: string } | null } | null
}

/**
 * Datenstand 8 → 9 (Dexie v10): Tätigkeiten gehören ab jetzt zu einem Projekt.
 * - die bisherigen (globalen) Tätigkeitsarten werden zur Standardliste (projectId null)
 * - jedes Projekt bekommt eine eigene Kopie der Tätigkeiten, mit denen es gebucht
 *   wurde (auch als Standard-Auffüllziel); nie gebuchte Projekte die aktiven der Standardliste
 * - Buchungen und Standard-Auffüllziel zeigen danach auf die Kopien
 * Stand schon umgestellt (alle Einträge haben projectId) → unverändert.
 */
export function splitActivitiesPerProject<T extends LegacyData>(data: T, makeId: () => string): T {
  if (data.activityTypes.length > 0 && data.activityTypes.every((a) => a.projectId !== undefined)) return data
  const templates = data.activityTypes.map((a, i) => ({
    ...a,
    name: typeof a.name === 'string' ? a.name : 'Tätigkeit',
    active: a.active !== false,
    sortOrder: typeof a.sortOrder === 'number' ? a.sortOrder : i,
    projectId: null as string | null,
    code: '',
  }))
  const byId = new Map(templates.map((t) => [t.id, t]))
  const copies: typeof templates = []
  const map = new Map<string, string>()
  const key = (projectId: string, typeId: string) => `${projectId}|${typeId}`
  const copyFor = (projectId: string, typeId: string): string => {
    const k = key(projectId, typeId)
    let id = map.get(k)
    if (!id) {
      const source = byId.get(typeId)
      id = makeId()
      copies.push({
        id,
        name: source?.name ?? 'Tätigkeit',
        active: source?.active ?? true,
        sortOrder: source?.sortOrder ?? templates.length,
        projectId,
        code: '',
      })
      map.set(k, id)
    }
    return id
  }

  const days = data.days.map((d) =>
    Array.isArray(d.allocations)
      ? { ...d, allocations: d.allocations.map((a) => ({ ...a, activityTypeId: copyFor(a.projectId, a.activityTypeId) })) }
      : d,
  )
  const fill = data.settings?.defaultFill
  const settings =
    data.settings && fill
      ? { ...data.settings, defaultFill: { ...fill, activityTypeId: copyFor(fill.projectId, fill.activityTypeId) } }
      : data.settings
  const used = new Set(copies.map((c) => c.projectId))
  for (const p of data.projects) {
    if (used.has(p.id)) continue
    for (const t of templates) if (t.active) copyFor(p.id, t.id)
  }
  return { ...data, activityTypes: [...templates, ...copies], days, settings }
}
