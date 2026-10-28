import { taskTree } from './tasks'
import type { Project, Task } from './types'

/**
 * Aufgaben als einfacher Markdown-Text – zum Exportieren, Importieren und zum
 * Umwandeln alter ToDo-Listen mit einem LLM. Beispiel:
 *
 *   # Epis
 *   - [ ] Pläne prüfen
 *     - [ ] Erdgeschoss
 *     - [x] Dach
 *   - [ ] !! Rückruf Statiker
 *     > Tel. 061 123 45 67
 */

export interface TextItem {
  title: string
  done: boolean
}

export interface TextTask {
  title: string
  done: boolean
  starred: boolean
  note: string
  items: TextItem[]
  /** Zeilennummer (ab 1) */
  line: number
}

export interface TextSection {
  /** Überschrift ohne „#“, z.B. „Revit (2295/90)“; „Ohne Projekt“, wenn Aufgaben vor der ersten Überschrift stehen. */
  heading: string
  line: number
  /** zugeordnetes Projekt; null = unbekannt */
  projectId: string | null
  tasks: TextTask[]
}

export interface TextWarning {
  line: number
  message: string
}

export interface ParsedTaskText {
  sections: TextSection[]
  warnings: TextWarning[]
}

/** Abschnitt für Punkte, die das LLM keinem Projekt zuordnen konnte. */
export const NO_PROJECT_HEADING = 'Ohne Projekt'

const STAR = '!!'

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')

/** Überschrift einem Projekt zuordnen: Name, „Name (Nummer)“ oder nur die Nummer in Klammern. */
export function matchProject(heading: string, projects: Project[]): string | null {
  const full = normalize(heading)
  const bracket = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(heading)
  const name = bracket ? normalize(bracket[1]) : full
  const code = bracket ? normalize(bracket[2]) : ''
  const label = (p: Project) => normalize(p.code ? `${p.name} (${p.code})` : p.name)
  return (
    projects.find((p) => label(p) === full)?.id ??
    projects.find((p) => normalize(p.name) === name)?.id ??
    projects.find((p) => normalize(p.name) === full)?.id ??
    (code ? projects.find((p) => p.code && normalize(p.code) === code)?.id : undefined) ??
    null
  )
}

/** Einrückung in Leerzeichen (Tab = 4). */
function indentOf(s: string): number {
  let n = 0
  for (const ch of s) n += ch === '\t' ? 4 : 1
  return n
}

const HEADING = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/
// - [ ] Text   * [x] Text   + Text   1. Text   1) [ ] Text
const LIST = /^(\s*)(?:[-*+•]|\d+[.)])\s+(?:\[( |x|X|✓|✔)?\]\s*)?(.*)$/
const NOTE = /^\s*>\s?(.*)$/
const FENCE = /^\s*```/

/** Liest den Text ein – tolerant (Aufzählungszeichen, [X], ##, 2–4 Leerzeichen oder Tab Einrückung). */
export function parseTaskText(text: string, projects: Project[]): ParsedTaskText {
  const sections: TextSection[] = []
  const warnings: TextWarning[] = []
  let section: TextSection | null = null
  let task: TextTask | null = null
  /** Einrückung der Aufgaben im aktuellen Abschnitt – tiefer eingerückt = Stichpunkt */
  let taskIndent: number | null = null

  const ensureSection = (line: number) => {
    if (!section) {
      section = { heading: NO_PROJECT_HEADING, line, projectId: matchProject(NO_PROJECT_HEADING, projects), tasks: [] }
      sections.push(section)
    }
    return section
  }

  text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = i + 1
      if (raw.trim() === '' || FENCE.test(raw)) return

      const heading = HEADING.exec(raw)
      if (heading) {
        section = { heading: heading[1].trim(), line, projectId: matchProject(heading[1], projects), tasks: [] }
        sections.push(section)
        task = null
        taskIndent = null
        return
      }

      const note = NOTE.exec(raw)
      if (note) {
        if (!task) {
          warnings.push({ line, message: 'Notiz („>“) ohne Aufgabe darüber – ignoriert.' })
          return
        }
        const t: TextTask = task
        const content = note[1].trim()
        if (content) t.note = t.note ? `${t.note} · ${content}` : content
        return
      }

      const item = LIST.exec(raw)
      if (!item) {
        warnings.push({ line, message: `Zeile nicht erkannt und ignoriert: „${raw.trim().slice(0, 60)}“` })
        return
      }
      const indent = indentOf(item[1])
      const done = !!item[2] && item[2] !== ' '
      let title = item[3].trim()
      const starred = title.startsWith(STAR)
      if (starred) title = title.slice(STAR.length).trim()
      if (!title) {
        warnings.push({ line, message: 'Leerer Punkt – ignoriert.' })
        return
      }

      const current = ensureSection(line)
      if (taskIndent === null || indent <= taskIndent || !task) {
        if (taskIndent === null || indent < taskIndent) taskIndent = indent
        const created: TextTask = { title, done, starred, note: '', items: [], line }
        current.tasks.push(created)
        task = created
      } else {
        const t: TextTask = task
        t.items.push({ title, done })
        if (starred) warnings.push({ line, message: '„!!“ gilt nur für Aufgaben, nicht für Stichpunkte – ignoriert.' })
      }
    })

  for (const s of sections) {
    if (s.tasks.length === 0) warnings.push({ line: s.line, message: `Abschnitt „${s.heading}“ enthält keine Aufgaben.` })
  }
  warnings.sort((a, b) => a.line - b.line)
  return { sections: sections.filter((s) => s.tasks.length > 0), warnings }
}

/** Erzeugt den Text (Export). `projectIds` = nur diese Projekte; `includeDone` = auch Erledigtes. */
export function formatTaskText(
  projects: Project[],
  tasks: Task[],
  options: { projectIds?: string[]; includeDone?: boolean } = {},
): string {
  const blocks: string[] = []
  for (const p of projects) {
    if (options.projectIds && !options.projectIds.includes(p.id)) continue
    const { open, done } = taskTree(tasks, p.id)
    const nodes = options.includeDone ? [...open, ...done] : open
    if (nodes.length === 0) continue
    const lines = [`# ${p.code ? `${p.name} (${p.code})` : p.name}`]
    for (const { task, items } of nodes) {
      lines.push(`- [${task.done ? 'x' : ' '}] ${task.starred ? `${STAR} ` : ''}${task.title}`)
      if (task.note.trim()) lines.push(`  > ${task.note.trim()}`)
      for (const item of items) {
        if (!options.includeDone && item.done) continue
        lines.push(`  - [${item.done ? 'x' : ' '}] ${item.title}`)
      }
    }
    blocks.push(lines.join('\n'))
  }
  return blocks.join('\n\n') + (blocks.length ? '\n' : '')
}

/** Ziel eines Abschnitts beim Import. */
export type ImportTarget = { kind: 'project'; projectId: string } | { kind: 'new'; name: string } | { kind: 'skip' }

export interface ImportGroup {
  target: ImportTarget
  /** neu anzulegende Aufgaben */
  tasks: TextTask[]
  /** im Projekt (oder weiter oben im Text) schon vorhanden – übersprungen */
  duplicates: number
}

/**
 * Was ein Import tun würde: je Abschnitt das Ziel und die neuen Aufgaben. Aufgaben,
 * die es im Zielprojekt mit gleichem Titel schon gibt (oder die doppelt im Text
 * stehen), werden übersprungen – ein zweiter Import erzeugt so keine Dubletten.
 */
export function planTaskImport(sections: TextSection[], targets: ImportTarget[], existing: Task[]): ImportGroup[] {
  const seen = new Map<string, Set<string>>()
  const titlesOf = (key: string, projectId: string | null) => {
    if (!seen.has(key)) {
      seen.set(
        key,
        new Set(existing.filter((t) => t.parentId === null && t.projectId === projectId).map((t) => normalize(t.title))),
      )
    }
    return seen.get(key)!
  }
  return sections.map((section, i) => {
    const target = targets[i] ?? { kind: 'skip' }
    if (target.kind === 'skip') return { target, tasks: [], duplicates: 0 }
    const key = target.kind === 'project' ? `p:${target.projectId}` : `n:${normalize(target.name)}`
    const titles = titlesOf(key, target.kind === 'project' ? target.projectId : null)
    const tasks: TextTask[] = []
    let duplicates = 0
    for (const t of section.tasks) {
      const k = normalize(t.title)
      if (titles.has(k)) {
        duplicates++
        continue
      }
      titles.add(k)
      tasks.push(t)
    }
    return { target, tasks, duplicates }
  })
}

/** Standard-Ziel eines Abschnitts: das erkannte Projekt, sonst überspringen. */
export function defaultTarget(section: TextSection): ImportTarget {
  return section.projectId ? { kind: 'project', projectId: section.projectId } : { kind: 'skip' }
}

/** Beispiel des Formats (Info-Dialog und LLM-Text). */
export const FORMAT_EXAMPLE = `# Projektname
- [ ] Aufgabe
  - [ ] Stichpunkt zur Aufgabe
  - [x] erledigter Stichpunkt
- [ ] !! wichtige Aufgabe
  > Notiz zur Aufgabe
- [x] erledigte Aufgabe`

/**
 * Text für ein LLM (ChatGPT, Claude, Copilot …): Formatregeln, Beispiel und die
 * eigenen Projekte. Darunter fügt man seine bisherige ToDo-Liste ein.
 */
export function llmPrompt(projects: Project[]): string {
  const active = projects.filter((p) => p.active)
  const projectLines = active.length
    ? active.map((p) => `- ${p.code ? `${p.name} (${p.code})` : p.name}`).join('\n')
    : '- (noch keine Projekte angelegt)'
  return `Wandle meine ToDo-Liste (ganz unten) in genau das folgende Textformat um. Es wird von einem Programm eingelesen – halte dich deshalb exakt an die Regeln.

FORMAT
${FORMAT_EXAMPLE}

REGELN
1. Jedes Projekt beginnt mit einer Zeile „# Projektname“. Verwende als Projektname AUSSCHLIESSLICH einen Namen aus der Liste „Meine Projekte“ unten – genau so geschrieben wie dort (die Projektnummer in Klammern darfst du mitschreiben).
2. Punkte, die du keinem Projekt sicher zuordnen kannst, kommen unter die Überschrift „# ${NO_PROJECT_HEADING}“. Erfinde keine neuen Projektnamen.
3. Jede Aufgabe ist eine Zeile „- [ ] Text“ ohne Einrückung. Erledigte Aufgaben: „- [x] Text“.
4. Unterpunkte, Teilschritte oder Details einer Aufgabe werden Stichpunkte: um genau 2 Leerzeichen eingerückt, ebenfalls „- [ ] Text“ bzw. „- [x] Text“. Es gibt nur diese zwei Ebenen – tiefere Ebenen fasst du zu Stichpunkten zusammen.
5. Wichtige, dringende oder priorisierte Aufgaben (z.B. „wichtig“, „dringend“, „ASAP“, „Prio 1“, rot markiert, mit Stern oder Ausrufezeichen) bekommen direkt nach „[ ]“ die Zeichen „!! “.
6. Termine, Fälligkeiten, Ansprechpartner, Telefonnummern, Links oder sonstige Zusatzinfos zu einer Aufgabe schreibst du in eine Notizzeile direkt unter der Aufgabe: 2 Leerzeichen eingerückt, beginnend mit „> “.
7. Formuliere jede Aufgabe kurz und eindeutig (ein Satz, ohne Aufzählungszeichen oder Nummern am Anfang). Übernimm den Inhalt vollständig – lass nichts weg und fasse nichts Unterschiedliches zusammen.
8. Gib NUR den umgewandelten Text aus: keine Einleitung, keine Erklärung, keine Codeblock-Zeichen (\`\`\`), keine Leerzeilen innerhalb eines Projekts. Zwischen zwei Projekten genau eine Leerzeile.

MEINE PROJEKTE (nur diese Namen verwenden)
${projectLines}

MEINE TODO-LISTE
`
}
