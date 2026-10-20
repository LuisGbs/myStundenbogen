import type { ActivityType, Project } from './types'

/**
 * Projektliste zum Weitergeben an Kollegen: nur Namen, Nummern, Farben und
 * Tätigkeitsarten – keine Stunden, keine Tage, keine internen IDs.
 */
export interface SharedProject {
  name: string
  code: string
  color: string
}

export interface SharedActivityType {
  name: string
}

export interface ProjectListFile {
  app: 'stundenbogen'
  kind: 'projects'
  schemaVersion: 1
  exportedAt: string
  projects: SharedProject[]
  activityTypes: SharedActivityType[]
}

export function buildProjectList(projects: Project[], activityTypes: ActivityType[]): ProjectListFile {
  return {
    app: 'stundenbogen',
    kind: 'projects',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map((p) => ({ name: p.name, code: p.code, color: p.color })),
    activityTypes: activityTypes.filter((a) => a.active).map((a) => ({ name: a.name })),
  }
}

/**
 * - new:     gibt es noch nicht → vorausgewählt
 * - exists:  gleiche Projektnummer (bzw. gleicher Name, wenn keine Nummer da ist)
 * - similar: gleicher Name, aber andere Projektnummer → bewusst entscheiden
 */
export type ImportStatus = 'new' | 'exists' | 'similar'

export interface ImportCandidate<T> {
  item: T
  status: ImportStatus
  /** Das vorhandene Projekt, mit dem verglichen wurde (bei exists/similar). */
  match: Project | null
  selected: boolean
}

/** Für Vergleiche: Groß-/Kleinschreibung und Leerzeichen ignorieren. */
export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const projectKey = (p: SharedProject) => `${normalizeKey(p.code)}|${normalizeKey(p.name)}`

export function planProjectImport(existing: Project[], incoming: SharedProject[]): ImportCandidate<SharedProject>[] {
  return dedupe(incoming.filter((p) => p.name.trim() !== ''), projectKey).map((item) => {
    const code = normalizeKey(item.code)
    const name = normalizeKey(item.name)
    const byCode = code ? existing.find((p) => normalizeKey(p.code) === code) : undefined
    if (byCode) return { item, status: 'exists', match: byCode, selected: false }
    const byName = existing.find((p) => normalizeKey(p.name) === name)
    if (byName) {
      const differentCode = code !== '' && normalizeKey(byName.code) !== '' && normalizeKey(byName.code) !== code
      return { item, status: differentCode ? 'similar' : 'exists', match: byName, selected: false }
    }
    return { item, status: 'new', match: null, selected: true }
  })
}

export function planActivityTypeImport(
  existing: ActivityType[],
  incoming: SharedActivityType[],
): ImportCandidate<SharedActivityType>[] {
  const names = new Set(existing.map((a) => normalizeKey(a.name)))
  return dedupe(
    incoming.filter((a) => a.name.trim() !== ''),
    (a) => normalizeKey(a.name),
  ).map((item) =>
    names.has(normalizeKey(item.name))
      ? { item, status: 'exists', match: null, selected: false }
      : { item, status: 'new', match: null, selected: true },
  )
}
