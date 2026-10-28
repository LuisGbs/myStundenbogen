import { useMemo, useState } from 'react'
import { todayISO } from '../../domain/date'
import {
  defaultTarget,
  formatTaskText,
  FORMAT_EXAMPLE,
  llmPrompt,
  NO_PROJECT_HEADING,
  parseTaskText,
  planTaskImport,
  type ImportTarget,
  type TextSection,
} from '../../domain/taskText'
import type { Project, Task } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { downloadFile, pickTextFile } from '../../lib/browser'
import { importTasks, type TaskImportResult } from '../../storage/repo'

/** Kopiert Text in die Zwischenablage (nur lokal im Browser). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const projectLabel = (p: Project) => (p.code ? `${p.name} (${p.code})` : p.name)

// ---------- Export ----------

export function ExportTasksDialog({
  projects,
  tasks,
  projectId,
  onClose,
  onMessage,
}: {
  projects: Project[]
  tasks: Task[]
  /** aktuell gewähltes Projekt (null = „Alle“) */
  projectId: string | null
  onClose: () => void
  onMessage: (message: string) => void
}) {
  const current = projectId ? projects.find((p) => p.id === projectId) : undefined
  const [onlyCurrent, setOnlyCurrent] = useState(!!current)
  const [includeDone, setIncludeDone] = useState(false)
  const text = formatTaskText(projects, tasks, {
    projectIds: onlyCurrent && current ? [current.id] : undefined,
    includeDone,
  })

  return (
    <Modal
      title="Aufgaben exportieren"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={!text}
            onClick={() => {
              downloadFile(`aufgaben-${todayISO()}.md`, text, 'text/markdown')
              onClose()
            }}
          >
            <Icon name="download" /> Als Datei speichern
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!text}
            onClick={async () => {
              onMessage((await copyText(text)) ? 'Aufgaben in die Zwischenablage kopiert' : 'Kopieren nicht möglich')
              onClose()
            }}
          >
            <Icon name="copy" /> Text kopieren
          </button>
        </>
      }
    >
      <div className="task-transfer__options">
        {current && (
          <>
            <label className="checkbox">
              <input type="radio" name="export-scope" checked={onlyCurrent} onChange={() => setOnlyCurrent(true)} />
              Nur {current.name}
            </label>
            <label className="checkbox">
              <input type="radio" name="export-scope" checked={!onlyCurrent} onChange={() => setOnlyCurrent(false)} />
              Alle Projekte
            </label>
          </>
        )}
        <label className="checkbox">
          <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
          Erledigte mitnehmen
        </label>
      </div>
      {text ? (
        <textarea className="input task-transfer__text" readOnly value={text} aria-label="Exporttext" rows={12} />
      ) : (
        <p className="muted">Keine Aufgaben zum Exportieren.</p>
      )}
      <p className="muted small">
        Das Format ist dasselbe wie beim Import – der Text lässt sich also auch wieder einlesen (z.B. auf einem anderen
        Rechner). Er bleibt in deinem Browser, bis du ihn selbst irgendwo einfügst.
      </p>
    </Modal>
  )
}

// ---------- Import ----------

const encodeTarget = (t: ImportTarget) => (t.kind === 'project' ? `p:${t.projectId}` : t.kind)

function decodeTarget(value: string, section: TextSection): ImportTarget {
  if (value.startsWith('p:')) return { kind: 'project', projectId: value.slice(2) }
  if (value === 'new') return { kind: 'new', name: section.heading }
  return { kind: 'skip' }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function ImportTasksDialog({
  projects,
  tasks,
  onClose,
  onImported,
  onShowInfo,
}: {
  projects: Project[]
  tasks: Task[]
  onClose: () => void
  onImported: (result: TaskImportResult) => void
  onShowInfo: () => void
}) {
  const [text, setText] = useState('')
  /** Vom Nutzer geänderte Ziele, je Abschnitt (Index + Überschrift) */
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseTaskText(text, projects), [text, projects])
  const keyOf = (s: TextSection, i: number) => `${i}:${s.heading}`
  const targets = parsed.sections.map((s, i) => {
    const choice = choices[keyOf(s, i)]
    return choice ? decodeTarget(choice, s) : defaultTarget(s)
  })
  const groups = planTaskImport(parsed.sections, targets, tasks)
  const taskCount = groups.reduce((n, g) => n + g.tasks.length, 0)
  const itemCount = groups.reduce((n, g) => n + g.tasks.reduce((m, t) => m + t.items.length, 0), 0)
  const selectable = projects.filter((p) => p.active)

  const apply = async () => {
    setBusy(true)
    try {
      onImported(await importTasks(groups, todayISO()))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Aufgaben importieren"
      onClose={onClose}
      footer={
        <>
          <span className="muted small" data-testid="task-import-summary">
            {taskCount === 0
              ? 'Noch nichts zu importieren'
              : `${plural(taskCount, 'Aufgabe', 'Aufgaben')} und ${plural(itemCount, 'Stichpunkt', 'Stichpunkte')} werden angelegt`}
          </span>
          <button type="button" className="btn btn--primary" disabled={taskCount === 0 || busy} onClick={() => void apply()}>
            Importieren
          </button>
        </>
      }
    >
      <p className="muted small">
        Text einfügen (z.B. die Antwort des LLM) oder eine Datei wählen. Unten siehst du vorher genau, was passiert.{' '}
        <button type="button" className="link-btn" onClick={onShowInfo}>
          Wie muss der Text aussehen?
        </button>
      </p>
      <textarea
        className="input task-transfer__text"
        aria-label="Importtext"
        placeholder={FORMAT_EXAMPLE}
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="task-transfer__options">
        <button
          type="button"
          className="btn btn--small"
          onClick={async () => {
            const content = await pickTextFile('.md,.txt,text/markdown,text/plain')
            if (content !== null) setText(content)
          }}
        >
          <Icon name="upload" /> Datei wählen …
        </button>
        {text && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setText('')}>
            Leeren
          </button>
        )}
      </div>

      {parsed.sections.length > 0 && (
        <>
          <div className="check-list__head">
            <strong>Vorschau</strong>
          </div>
          <ul className="check-list">
            {parsed.sections.map((section, i) => {
              const group = groups[i]
              const items = group.tasks.reduce((n, t) => n + t.items.length, 0)
              const matched = section.projectId !== null
              return (
                <li key={keyOf(section, i)} className="task-import-row" data-testid="task-import-section">
                  <div className="task-import-row__head">
                    <span className={`badge ${matched ? 'badge--new' : 'badge--similar'}`}>{matched ? '✓' : '⚠'}</span>
                    <strong className="task-import-row__heading">{section.heading}</strong>
                    <select
                      className="input"
                      aria-label={`Ziel für „${section.heading}“`}
                      value={encodeTarget(targets[i])}
                      onChange={(e) => setChoices({ ...choices, [keyOf(section, i)]: e.target.value })}
                    >
                      <option value="skip">überspringen</option>
                      {section.heading !== NO_PROJECT_HEADING && <option value="new">als neues Projekt „{section.heading}“</option>}
                      {selectable.map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          → {projectLabel(p)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="muted small task-import-row__info">
                    {group.target.kind === 'skip'
                      ? matched
                        ? `${plural(section.tasks.length, 'Aufgabe', 'Aufgaben')} – wird übersprungen`
                        : `Projekt nicht gefunden – bitte zuordnen (${plural(section.tasks.length, 'Aufgabe', 'Aufgaben')})`
                      : `${plural(group.tasks.length, 'Aufgabe', 'Aufgaben')} und ${plural(items, 'Stichpunkt', 'Stichpunkte')} neu`}
                    {group.duplicates > 0 && ` · ${group.duplicates} schon vorhanden (übersprungen)`}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {parsed.warnings.length > 0 && (
        <div className="task-import-warnings" data-testid="task-import-warnings">
          <strong>Hinweise</strong>
          <ul>
            {parsed.warnings.map((w, i) => (
              <li key={i}>
                Zeile {w.line}: {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

// ---------- Info: Format & LLM-Hilfe ----------

export function TaskFormatInfoDialog({
  projects,
  onClose,
  onMessage,
  onOpenImport,
}: {
  projects: Project[]
  onClose: () => void
  onMessage: (message: string) => void
  onOpenImport: () => void
}) {
  const prompt = llmPrompt(projects)
  const [copied, setCopied] = useState(false)
  const activeCount = projects.filter((p) => p.active).length

  return (
    <Modal
      title="Format & LLM-Hilfe"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Schließen
          </button>
          <button type="button" className="btn btn--primary" onClick={onOpenImport}>
            Zum Import …
          </button>
        </>
      }
    >
      <div className="task-info">
        <h3>So muss der Text aussehen</h3>
        <pre className="task-info__code">{FORMAT_EXAMPLE}</pre>
        <ul className="task-info__rules">
          <li>
            <code># Projektname</code> beginnt ein Projekt. Der Name muss so heißen wie in deiner Projektliste
            (Groß-/Kleinschreibung egal). Die Projektnummer darf in Klammern dahinter stehen, z.B.{' '}
            <code># Epis (2295/90)</code> – dann wird auch über die Nummer zugeordnet.
          </li>
          <li>
            <code>- [ ] Text</code> ohne Einrückung ist eine <strong>offene Aufgabe</strong>, <code>- [x] Text</code> eine
            erledigte.
          </li>
          <li>
            Darunter <strong>eingerückt</strong> (2 Leerzeichen oder Tab) ist <code>- [ ] Text</code> ein{' '}
            <strong>Stichpunkt</strong> dieser Aufgabe. Es gibt nur diese zwei Ebenen.
          </li>
          <li>
            <code>!!</code> direkt vor dem Text (<code>- [ ] !! Text</code>) markiert die Aufgabe als{' '}
            <strong>wichtig ★</strong> – sie steht dann oben.
          </li>
          <li>
            <code>&gt; Text</code> eingerückt unter einer Aufgabe ist ihre <strong>Notiz</strong> (Termin, Ansprechpartner,
            Ticket …).
          </li>
          <li>
            Aufgaben vor der ersten Überschrift oder unter <code># {NO_PROJECT_HEADING}</code> ordnest du beim Import selbst
            einem Projekt zu (oder legst ein neues an).
          </li>
          <li>
            Großzügig beim Einlesen: <code>*</code>, <code>+</code> oder <code>1.</code> statt <code>-</code>,{' '}
            <code>[X]</code>, <code>##</code>, Zeilen ohne Kästchen und Leerzeilen sind in Ordnung. Alles andere wird
            ignoriert und in der Vorschau mit Zeilennummer gemeldet.
          </li>
          <li>
            Aufgaben, die es im Projekt mit gleichem Titel schon gibt, werden übersprungen – zweimal importieren erzeugt
            also keine Doppelten.
          </li>
        </ul>

        <h3>Bestehende ToDo-Liste mit einem LLM umwandeln</h3>
        <p className="muted small">z.B. ChatGPT, Claude, Copilot – egal, wo deine Liste heute steht (Outlook, OneNote, Excel, Notizen-App, Zettel).</p>
        <ol className="task-info__steps">
          <li>
            Auf <strong>„Text für das LLM kopieren“</strong> klicken. Der Text enthält die Regeln oben und – automatisch
            angehängt – deine {activeCount} aktiven Projekte mit Projektnummer, damit das LLM genau diese Namen verwendet.
          </li>
          <li>Im LLM einen neuen Chat öffnen, den Text einfügen.</li>
          <li>
            <strong>Direkt darunter</strong> (nach „MEINE TODO-LISTE“) deine bisherige Liste einfügen – in beliebiger Form,
            gern auch unsortiert. Abschicken.
          </li>
          <li>
            Die Antwort des LLM komplett kopieren, hier auf <strong>„Zum Import …“</strong> gehen und einfügen.
          </li>
          <li>
            In der Vorschau prüfen: ✓ = Projekt erkannt, ⚠ = bitte zuordnen. Erst „Importieren“ legt etwas an – und der
            Import lässt sich danach mit „Rückgängig“ wieder entfernen.
          </li>
        </ol>
        <button
          type="button"
          className="btn btn--primary"
          onClick={async () => {
            const ok = await copyText(prompt)
            setCopied(ok)
            onMessage(ok ? 'Text für das LLM kopiert' : 'Kopieren nicht möglich – bitte unten markieren und kopieren')
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} /> Text für das LLM kopieren
        </button>
        <details className="task-info__prompt">
          <summary>Diesen Text kopierst du (ansehen)</summary>
          <pre className="task-info__code" data-testid="llm-prompt">
            {prompt}
          </pre>
        </details>

        <p className="task-info__privacy small">
          <Icon name="alert" /> <strong>Datenschutz:</strong> Die App schickt nichts weg. Erst wenn du den Text selbst in
          ein LLM einfügst, gehen Projektnamen, Projektnummern und deine Aufgaben an diesen Dienst – bitte die Regeln
          deiner Firma beachten (z.B. nur das freigegebene Firmen-LLM verwenden).
        </p>
      </div>
    </Modal>
  )
}
