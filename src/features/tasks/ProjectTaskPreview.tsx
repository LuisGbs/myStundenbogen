import { useState } from 'react'
import { noteContains } from '../../domain/notes'
import { taskTree } from '../../domain/tasks'
import type { Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { href } from '../../lib/router'
import { useTasks } from '../../storage/hooks'
import { createTask } from '../../storage/repo'
import { StarMark } from './StarMark'
import { useTaskActions } from './useTaskActions'
import './tasks.css'

const MAX_TASKS = 3
const MAX_ITEMS = 4

/** „Offen bei …“ (Gerade-Karte): die ersten offenen Aufgaben des aktiven Projekts, direkt abhakbar. */
export function ProjectTaskPreview({
  project,
  activeNote = '',
  onWorkOn,
}: {
  project: Project
  /** Notiz der laufenden Buchung – zeigt, woran gerade gearbeitet wird */
  activeNote?: string
  /** „▶ dran arbeiten“: Titel in die Notiz der laufenden Buchung übernehmen (fehlt = keine Knöpfe) */
  onWorkOn?: (title: string) => void
}) {
  const tasks = useTasks()
  const [toast, showToast] = useToast()
  const [title, setTitle] = useState('')
  const actions = useTaskActions(tasks ?? [], showToast)
  if (!tasks) return null
  const { open } = taskTree(tasks, project.id)

  return (
    <div className="task-preview" data-testid="task-preview">
      <div className="task-preview__head">
        Offen bei {project.name}
        <span className="muted small">{open.length === 0 ? 'nichts' : `${open.length} Aufgabe${open.length === 1 ? '' : 'n'}`}</span>
        <a href={href.tasks(project.id)}>Alle Aufgaben →</a>
      </div>
      <ul className="task-lines">
        {open.slice(0, MAX_TASKS).map(({ task, items }) => {
          const openItems = items.filter((i) => !i.done)
          return (
            <li key={task.id}>
              <div className="task-preview__row">
                <label className="task-line">
                  <input
                    type="checkbox"
                    className="task-check"
                    checked={false}
                    aria-label={`${task.title} erledigt`}
                    onChange={() => actions.toggle(task, true)}
                  />
                  {task.starred && <StarMark />}
                  <span>{task.title || 'Aufgabe'}</span>
                </label>
                {onWorkOn && task.title && <WorkOnButton title={task.title} note={activeNote} onWorkOn={onWorkOn} />}
              </div>
              {openItems.length > 0 && (
                <ul className="task-lines task-preview__items">
                  {openItems.slice(0, MAX_ITEMS).map((item) => (
                    <li key={item.id} className="task-preview__row">
                      <label className="task-line small">
                        <input
                          type="checkbox"
                          className="task-check"
                          checked={false}
                          aria-label={`${item.title} erledigt`}
                          onChange={() => actions.toggle(item, true)}
                        />
                        <span>{item.title || 'Stichpunkt'}</span>
                      </label>
                      {onWorkOn && item.title && (
                        <WorkOnButton title={`${task.title}: ${item.title}`} note={activeNote} onWorkOn={onWorkOn} />
                      )}
                    </li>
                  ))}
                  {openItems.length > MAX_ITEMS && <li className="muted small">… und {openItems.length - MAX_ITEMS} weitere</li>}
                </ul>
              )}
            </li>
          )
        })}
        {open.length > MAX_TASKS && <li className="muted small">… und {open.length - MAX_TASKS} weitere Aufgaben</li>}
      </ul>
      <input
        className="input tasks-add"
        aria-label={`Aufgabe für ${project.name} notieren`}
        placeholder={`+ Aufgabe für ${project.name} notieren (Enter)`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !title.trim()) return
          void createTask({ projectId: project.id, parentId: null, title })
          setTitle('')
        }}
      />
      {toast}
    </div>
  )
}

/** ▶ neben einer Aufgabe: „daran arbeite ich gerade“ – landet in der Notiz der laufenden Buchung. */
function WorkOnButton({ title, note, onWorkOn }: { title: string; note: string; onWorkOn: (title: string) => void }) {
  const active = noteContains(note, title)
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--subtle work-on${active ? ' is-active' : ''}`}
      aria-label={`An „${title}“ arbeiten`}
      aria-pressed={active}
      title={active ? 'Steht schon in der Notiz der laufenden Buchung' : 'Daran arbeite ich gerade – in die Notiz der laufenden Buchung übernehmen'}
      onClick={() => onWorkOn(title)}
    >
      <Icon name="play" size={12} />
    </button>
  )
}
