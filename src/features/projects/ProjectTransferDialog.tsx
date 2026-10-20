import { useState } from 'react'
import { todayISO } from '../../domain/date'
import {
  buildProjectList,
  planActivityTypeImport,
  planProjectImport,
  type ImportCandidate,
  type ImportStatus,
  type ProjectListFile,
  type SharedProject,
} from '../../domain/projectTransfer'
import type { ActivityType, Project } from '../../domain/types'
import { Modal } from '../../components/Modal'
import { downloadFile } from '../../lib/browser'
import { projectListFileName } from '../../storage/exportImport'
import { importProjectList } from '../../storage/repo'

/** Auswahl als Set von Indizes, mit „Alle / Keine“. */
function useSelection(initial: number[]) {
  const [selected, setSelected] = useState(() => new Set(initial))
  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  return { selected, toggle, setAll: (indices: number[]) => setSelected(new Set(indices)) }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function AllNone({ count, setAll }: { count: number; setAll: (indices: number[]) => void }) {
  return (
    <span className="check-list__all">
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setAll(range(count))}>
        Alle
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => setAll([])}>
        Keine
      </button>
    </span>
  )
}

// ---------- Export ----------

export function ExportProjectsDialog({
  projects,
  activityTypes,
  onClose,
}: {
  projects: Project[]
  activityTypes: ActivityType[]
  onClose: () => void
}) {
  const { selected, toggle, setAll } = useSelection(projects.flatMap((p, i) => (p.active ? [i] : [])))
  const activeTypes = activityTypes.filter((a) => a.active)

  const exportSelected = () => {
    const chosen = projects.filter((_, i) => selected.has(i))
    const file = buildProjectList(chosen, activityTypes)
    downloadFile(projectListFileName(todayISO()), JSON.stringify(file, null, 1), 'application/json')
    onClose()
  }

  return (
    <Modal
      title="Projekte exportieren"
      onClose={onClose}
      footer={
        <>
          <span className="muted small">{selected.size} ausgewählt</span>
          <button type="button" className="btn btn--primary" disabled={selected.size === 0} onClick={exportSelected}>
            Exportieren
          </button>
        </>
      }
    >
      <p className="muted small">
        Die Datei enthält nur Projektnamen, Projektnummern, Farben und die Tätigkeitsarten (
        {activeTypes.map((a) => a.name).join(', ') || 'keine'}) – <strong>keine Stunden und keine Tage</strong>. Du
        kannst sie z.B. Kollegen schicken.
      </p>
      <div className="check-list__head">
        <strong>Projekte</strong>
        <AllNone count={projects.length} setAll={setAll} />
      </div>
      <ul className="check-list">
        {projects.map((p, i) => (
          <li key={p.id}>
            <label className="check-row">
              <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
              <span className="dot" style={{ background: p.color }} />
              <span className="check-row__name">{p.name}</span>
              {p.code && <span className="check-row__code">{p.code}</span>}
              {!p.active && <span className="badge badge--muted">inaktiv</span>}
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

// ---------- Import ----------

const STATUS_LABEL: Record<ImportStatus, string> = {
  new: 'neu',
  exists: 'schon vorhanden',
  similar: 'ähnlich',
}

function statusHint(c: ImportCandidate<SharedProject>): string | null {
  if (!c.match) return null
  if (c.status === 'similar') return `„${c.match.name}“ hat Nr. ${c.match.code}`
  return c.match.name !== c.item.name ? `als „${c.match.name}“` : null
}

export function ImportProjectsDialog({
  file,
  projects,
  activityTypes,
  onClose,
  onDone,
}: {
  file: ProjectListFile
  projects: Project[]
  activityTypes: ActivityType[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [projectPlan] = useState(() => planProjectImport(projects, file.projects))
  const [typePlan] = useState(() => planActivityTypeImport(activityTypes, file.activityTypes))
  const projectSel = useSelection(projectPlan.flatMap((c, i) => (c.selected ? [i] : [])))
  const typeSel = useSelection(typePlan.flatMap((c, i) => (c.selected ? [i] : [])))
  const total = projectSel.selected.size + typeSel.selected.size

  const apply = async () => {
    await importProjectList(
      projectPlan.filter((_, i) => projectSel.selected.has(i)).map((c) => c.item),
      typePlan.filter((_, i) => typeSel.selected.has(i)).map((c) => c.item),
    )
    onDone(`${projectSel.selected.size} Projekte und ${typeSel.selected.size} Tätigkeitsarten übernommen`)
  }

  return (
    <Modal
      title="Projekte importieren"
      onClose={onClose}
      footer={
        <>
          <span className="muted small" data-testid="import-summary">
            {projectSel.selected.size} von {projectPlan.length} Projekten
            {typePlan.length > 0 && `, ${typeSel.selected.size} von ${typePlan.length} Tätigkeitsarten`} werden
            übernommen
          </span>
          <button type="button" className="btn btn--primary" disabled={total === 0} onClick={() => void apply()}>
            Übernehmen
          </button>
        </>
      }
    >
      <p className="muted small">
        Hake an, was du übernehmen willst. Projekte, die es bei dir schon gibt (gleiche Projektnummer oder gleicher
        Name), sind abgewählt.
      </p>

      <div className="check-list__head">
        <strong>Projekte</strong>
        <AllNone count={projectPlan.length} setAll={projectSel.setAll} />
      </div>
      {projectPlan.length === 0 ? (
        <p className="muted">Die Datei enthält keine Projekte.</p>
      ) : (
        <ul className="check-list">
          {projectPlan.map((c, i) => (
            <li key={i} data-testid="import-project">
              <label className="check-row">
                <input type="checkbox" checked={projectSel.selected.has(i)} onChange={() => projectSel.toggle(i)} />
                <span className="dot" style={{ background: c.item.color || 'var(--border-strong)' }} />
                <span className="check-row__name">{c.item.name}</span>
                {c.item.code && <span className="check-row__code">{c.item.code}</span>}
                <span className={`badge badge--${c.status}`}>{STATUS_LABEL[c.status]}</span>
                {statusHint(c) && <span className="check-row__hint">{statusHint(c)}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {typePlan.length > 0 && (
        <>
          <div className="check-list__head">
            <strong>Tätigkeitsarten</strong>
            <AllNone count={typePlan.length} setAll={typeSel.setAll} />
          </div>
          <ul className="check-list">
            {typePlan.map((c, i) => (
              <li key={i}>
                <label className="check-row">
                  <input type="checkbox" checked={typeSel.selected.has(i)} onChange={() => typeSel.toggle(i)} />
                  <span className="check-row__name">{c.item.name}</span>
                  <span className={`badge badge--${c.status}`}>{STATUS_LABEL[c.status]}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  )
}
