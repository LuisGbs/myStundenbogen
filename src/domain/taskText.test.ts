import { describe, expect, it } from 'vitest'
import { formatTaskText, llmPrompt, matchProject, parseTaskText, planTaskImport, NO_PROJECT_HEADING } from './taskText'
import type { Project, Task } from './types'

const project = (id: string, name: string, code = '', active = true): Project => ({
  id,
  name,
  code,
  color: '#000',
  active,
  sortOrder: 0,
  createdAt: '',
})
const projects = [project('epis', 'Epis', '2295/90'), project('revit', 'Revit'), project('alt', 'Altprojekt', '', false)]

const task = (id: string, projectId: string, parentId: string | null, title: string, extra: Partial<Task> = {}): Task => ({
  id,
  projectId,
  parentId,
  title,
  note: '',
  done: false,
  starred: false,
  doneAt: null,
  sortOrder: 0,
  createdAt: id,
  ...extra,
})

const EXAMPLE = `# Epis
- [ ] Pläne prüfen
  - [ ] Erdgeschoss
  - [x] Dach
- [ ] !! Rückruf Statiker
  > Tel. 061 123 45 67
- [x] Mail an Bauherr

# Revit
- [ ] Familien aufräumen
`

describe('Projekt zuordnen', () => {
  it('Name, Name mit Nummer, nur Nummer, Groß/klein und Leerzeichen egal', () => {
    expect(matchProject('Epis', projects)).toBe('epis')
    expect(matchProject('  epis  ', projects)).toBe('epis')
    expect(matchProject('Epis (2295/90)', projects)).toBe('epis')
    expect(matchProject('Projekt Epis (2295/90)', projects)).toBe('epis')
    expect(matchProject('REVIT', projects)).toBe('revit')
    expect(matchProject('Unbekannt', projects)).toBeNull()
  })
})

describe('parseTaskText', () => {
  it('liest das Beispiel: Aufgaben, Stichpunkte, erledigt, wichtig, Notiz', () => {
    const { sections, warnings } = parseTaskText(EXAMPLE, projects)
    expect(warnings).toEqual([])
    expect(sections.map((s) => [s.heading, s.projectId, s.tasks.length])).toEqual([
      ['Epis', 'epis', 3],
      ['Revit', 'revit', 1],
    ])
    const [plans, call, mail] = sections[0].tasks
    expect(plans).toMatchObject({ title: 'Pläne prüfen', done: false, starred: false, line: 2 })
    expect(plans.items).toEqual([
      { title: 'Erdgeschoss', done: false },
      { title: 'Dach', done: true },
    ])
    expect(call).toMatchObject({ title: 'Rückruf Statiker', starred: true, note: 'Tel. 061 123 45 67' })
    expect(mail).toMatchObject({ title: 'Mail an Bauherr', done: true })
  })

  it('ist tolerant: *, +, Zahlen, [X], ##, Tab, 4 Leerzeichen, ohne Kästchen, Codeblock-Zeichen', () => {
    const text = [
      '```',
      '## epis (2295/90)',
      '* [X] Erledigt',
      '\t+ [ ] Unterpunkt mit Tab',
      '1. Ohne Kästchen',
      '    - [ ] vier Leerzeichen',
      '```',
    ].join('\n')
    const { sections, warnings } = parseTaskText(text, projects)
    expect(warnings).toEqual([])
    expect(sections[0].projectId).toBe('epis')
    expect(sections[0].tasks.map((t) => [t.title, t.done, t.items.map((i) => i.title)])).toEqual([
      ['Erledigt', true, ['Unterpunkt mit Tab']],
      ['Ohne Kästchen', false, ['vier Leerzeichen']],
    ])
  })

  it('Aufgaben vor der ersten Überschrift → „Ohne Projekt“; unbekanntes Projekt → null', () => {
    const { sections } = parseTaskText('- [ ] lose Aufgabe\n# Gibts nicht\n- [ ] x', projects)
    expect(sections.map((s) => [s.heading, s.projectId])).toEqual([
      [NO_PROJECT_HEADING, null],
      ['Gibts nicht', null],
    ])
  })

  it('meldet Unbekanntes mit Zeilennummer', () => {
    const { warnings } = parseTaskText('# Epis\nHallo, hier ist deine Liste:\n> Notiz ohne Aufgabe\n- [ ]\n# Revit', projects)
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 3, 4, 5])
    expect(warnings[0].message).toContain('keine Aufgaben')
    expect(warnings[1].message).toContain('nicht erkannt')
  })
})

describe('formatTaskText (Export)', () => {
  const tasks = [
    task('a', 'epis', null, 'Pläne prüfen'),
    task('a1', 'epis', 'a', 'Erdgeschoss'),
    task('a2', 'epis', 'a', 'Dach', { done: true }),
    task('b', 'epis', null, 'Rückruf Statiker', { starred: true, note: 'Tel. 061 123 45 67' }),
    task('c', 'epis', null, 'Mail an Bauherr', { done: true }),
    task('r', 'revit', null, 'Familien aufräumen'),
  ]

  it('offene Aufgaben (★ zuerst) mit offenen Stichpunkten; Projektnummer in Klammern', () => {
    expect(formatTaskText(projects, tasks)).toBe(
      ['# Epis (2295/90)', '- [ ] !! Rückruf Statiker', '  > Tel. 061 123 45 67', '- [ ] Pläne prüfen', '  - [ ] Erdgeschoss', '', '# Revit', '- [ ] Familien aufräumen', ''].join('\n'),
    )
    expect(formatTaskText(projects, tasks, { projectIds: ['revit'] })).toBe('# Revit\n- [ ] Familien aufräumen\n')
  })

  it('Roundtrip mit Erledigtem: format → parse ergibt denselben Inhalt', () => {
    const text = formatTaskText(projects, tasks, { includeDone: true })
    const { sections, warnings } = parseTaskText(text, projects)
    expect(warnings).toEqual([])
    expect(sections[0].tasks.map((t) => [t.title, t.done, t.starred, t.note, t.items])).toEqual([
      ['Rückruf Statiker', false, true, 'Tel. 061 123 45 67', []],
      ['Pläne prüfen', false, false, '', [{ title: 'Erdgeschoss', done: false }, { title: 'Dach', done: true }]],
      ['Mail an Bauherr', true, false, '', []],
    ])
  })
})

describe('planTaskImport', () => {
  it('überspringt vorhandene Titel und Doppelte im Text; Ziele: Projekt, neu, überspringen', () => {
    const { sections } = parseTaskText('# Epis\n- [ ] Pläne prüfen\n- [ ] Neu\n- [ ] neu\n# Gibts nicht\n- [ ] x', projects)
    const existing = [task('a', 'epis', null, 'pläne PRÜFEN')]
    const plan = planTaskImport(sections, [{ kind: 'project', projectId: 'epis' }, { kind: 'new', name: 'Gibts nicht' }], existing)
    expect(plan.map((g) => [g.tasks.map((t) => t.title), g.duplicates])).toEqual([
      [['Neu'], 2],
      [['x'], 0],
    ])
    expect(planTaskImport(sections, [{ kind: 'skip' }], existing)[0].tasks).toEqual([])
  })
})

describe('Text für das LLM', () => {
  it('enthält Regeln, Beispiel und genau die aktiven Projekte (mit Nummer)', () => {
    const prompt = llmPrompt(projects)
    expect(prompt).toContain('- Epis (2295/90)')
    expect(prompt).toContain('- Revit')
    expect(prompt).not.toContain('Altprojekt')
    expect(prompt).toContain(`# ${NO_PROJECT_HEADING}`)
    expect(prompt).toContain('!! ')
    expect(prompt.trimEnd().endsWith('MEINE TODO-LISTE')).toBe(true)
    // Das Beispiel im Text lässt sich selbst einlesen
    const example = prompt.slice(prompt.indexOf('FORMAT') + 7, prompt.indexOf('REGELN')).trim()
    expect(parseTaskText(example, projects).warnings).toEqual([])
  })
})
