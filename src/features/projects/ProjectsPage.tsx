import { useState, type FormEvent } from 'react'
import { allActivitiesOf, templateActivities } from '../../domain/activities'
import type { ProjectListFile } from '../../domain/projectTransfer'
import type { ActivityType, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { ColorInput, CommitInput } from '../../components/inputs'
import { useToast } from '../../components/Toast'
import { SortGrip } from '../../components/SortGrip'
import { useSortDrag } from '../../components/useSortDrag'
import { pickTextFile, useLocalPreference } from '../../lib/browser'
import { ImportError, parseProjectList } from '../../storage/exportImport'
import { useActivityTypes, useProjects } from '../../storage/hooks'
import { countProjectTasks, createProject, deleteProject, reorderProject, updateProject } from '../../storage/repo'
import { ActiveSwitch } from './ActiveSwitch'
import { ActivityList } from './ActivityList'
import { OfficialFields } from './OfficialFields'
import { ExportProjectsDialog, ImportProjectsDialog } from './ProjectTransferDialog'
import './projects.css'

export function ProjectsPage() {
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  if (!projects || !activityTypes) return null
  return (
    <div className="page page--narrow">
      <ProjectsCard projects={projects} activityTypes={activityTypes} />
      <TemplateCard activityTypes={activityTypes} />
    </div>
  )
}

type TransferDialog = { kind: 'export' } | { kind: 'import'; file: ProjectListFile } | null

function ProjectsCard({ projects, activityTypes }: { projects: Project[]; activityTypes: ActivityType[] }) {
  const [showInactive, setShowInactive] = useLocalPreference('projects.showInactive', false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [official, setOfficial] = useState('')
  const [dialog, setDialog] = useState<TransferDialog>(null)
  const [toast, showToast] = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const inactiveCount = projects.filter((p) => !p.active).length
  const visible = showInactive ? projects : projects.filter((p) => p.active)
  const projectSort = useSortDrag(
    'projects',
    visible.map((p) => p.id),
    (id, beforeId) => void reorderProject(id, beforeId, !showInactive),
  )

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await createProject({ name, code, officialName: official })
    setName('')
    setCode('')
    setOfficial('')
  }

  const remove = async (p: Project) => {
    const taskCount = await countProjectTasks(p.id)
    const withTasks = taskCount > 0 ? ` Seine ${taskCount} Aufgabe${taskCount === 1 ? '' : 'n'} werden mit gelöscht.` : ''
    if (!confirm(`Projekt „${p.name}“ wirklich löschen?${withTasks}`)) return
    const deleted = await deleteProject(p.id)
    if (!deleted) {
      alert(`„${p.name}“ hat bereits Buchungen und kann nicht gelöscht werden.\nDeaktiviere es stattdessen – dann verschwindet es aus der Auswahl, die Stunden bleiben erhalten.`)
    }
  }

  const startImport = async () => {
    const text = await pickTextFile()
    if (text === null) return
    try {
      setDialog({ kind: 'import', file: parseProjectList(text) })
    } catch (e) {
      alert(e instanceof ImportError ? e.message : 'Die Datei konnte nicht gelesen werden.')
    }
  }

  return (
    <section className="card">
      <header className="card__head">
        <h2>Projekte</h2>
        <div className="card__actions">
          {inactiveCount > 0 && (
            <label className="checkbox">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Inaktive zeigen ({inactiveCount})
            </label>
          )}
          <button
            type="button"
            className="btn btn--small"
            disabled={projects.length === 0}
            onClick={() => setDialog({ kind: 'export' })}
            title="Projektliste als Datei speichern, z.B. für Kollegen"
          >
            <Icon name="download" /> Exportieren …
          </button>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => void startImport()}
            title="Projektliste von Kollegen einlesen"
          >
            <Icon name="upload" /> Importieren …
          </button>
        </div>
      </header>
      {dialog?.kind === 'export' && (
        <ExportProjectsDialog projects={projects} activityTypes={activityTypes} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'import' && (
        <ImportProjectsDialog
          file={dialog.file}
          projects={projects}
          activityTypes={activityTypes}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null)
            showToast(message)
          }}
        />
      )}
      {toast}

      <form className="add-form" onSubmit={add}>
        <input
          className="input add-form__name"
          placeholder="Neues Projekt – dein Name, z.B. Rollen überarbeiten"
          aria-label="Projektname"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input add-form__official"
          placeholder="Offizieller Name (optional)"
          aria-label="Offizieller Projektname"
          title="So heißt es in der Firmensoftware – leer = wie dein Name"
          value={official}
          onChange={(e) => setOfficial(e.target.value)}
        />
        <input
          className="input add-form__code"
          placeholder="Projektnr. (optional)"
          aria-label="Projektnummer"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
          <Icon name="plus" /> Anlegen
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="muted">
          {projects.length === 0 ? 'Leg oben dein erstes Projekt an.' : 'Alle Projekte sind inaktiv.'}
        </p>
      ) : (
        <ul
          className={`item-list${projectSort.dragging ? ' is-dragging' : ''}${projectSort.dropAtEnd ? ' is-drop-end' : ''}`}
          data-sort-list="projects"
        >
          {visible.map((p) => {
            const own = allActivitiesOf(p.id, activityTypes)
            const open = expanded.has(p.id)
            return (
              <li
                key={p.id}
                className={`item-row${p.active ? '' : ' is-inactive'} ${projectSort.rowClass(p.id)}`}
                data-sort-id={p.id}
                data-testid="project-row"
              >
                <SortGrip label={`${p.name} verschieben`} {...projectSort.gripProps(p.id)} />
                <ColorInput
                  className="color-input"
                  aria-label={`Farbe von ${p.name}`}
                  value={p.color}
                  onCommit={(color) => void updateProject(p.id, { color })}
                />
                <CommitInput
                  className="input item-row__name"
                  aria-label="Projektname"
                  value={p.name}
                  onCommit={(text) => {
                    const trimmed = text.trim()
                    if (!trimmed) return null
                    void updateProject(p.id, { name: trimmed })
                    return trimmed
                  }}
                />
                <ActiveSwitch active={p.active} onChange={(active) => void updateProject(p.id, { active })} />
                <button
                  type="button"
                  className={`btn btn--ghost btn--small project-acts-toggle${open ? ' is-open' : ''}`}
                  aria-expanded={open}
                  aria-label={`Tätigkeiten von ${p.name}`}
                  title={own.map((a) => a.name).join(', ')}
                  onClick={() => toggleExpanded(p.id)}
                >
                  Tätigkeiten ({own.filter((a) => a.active).length})
                  <Icon name="chevron-down" />
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--subtle"
                  aria-label={`${p.name} löschen`}
                  title="Löschen (nur ohne Buchungen)"
                  onClick={() => void remove(p)}
                >
                  <Icon name="trash" />
                </button>
                <OfficialFields item={p} kind="Projekt" onChange={(patch) => void updateProject(p.id, patch)} />
                {open && (
                  <div className="project-acts">
                    <ActivityList projectId={p.id} activities={own} owner={p.name} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted small">
        Inaktive Projekte verschwinden aus der Auswahl beim Eintragen. In der Monatstabelle erscheinen sie weiter,
        solange sie in dem Monat Stunden haben.
      </p>
    </section>
  )
}

/** Standardliste: Tätigkeiten, die neue Projekte als Kopie bekommen. */
function TemplateCard({ activityTypes }: { activityTypes: ActivityType[] }) {
  return (
    <section className="card">
      <header className="card__head">
        <h2>Standardliste für neue Projekte</h2>
      </header>
      <p className="muted small">
        Jede Buchung gehört zu Projekt + Tätigkeit (Unter-Kostenstelle, z.B. Engineering, Abwicklung, Meeting). Jedes
        Projekt hat seine eigenen Tätigkeiten – oben beim Projekt unter „Tätigkeiten“. Ein neu angelegtes Projekt startet
        mit einer Kopie dieser Liste; Änderungen hier betreffen bestehende Projekte nicht.
      </p>
      <ActivityList projectId={null} activities={templateActivities(activityTypes)} owner="Standardliste" />
    </section>
  )
}
