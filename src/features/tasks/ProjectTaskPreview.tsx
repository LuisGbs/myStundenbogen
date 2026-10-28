import { useState } from 'react'
import { taskTree } from '../../domain/tasks'
import type { Project } from '../../domain/types'
import { useToast } from '../../components/Toast'
import { href } from '../../lib/router'
import { useTasks } from '../../storage/hooks'
import { createTask } from '../../storage/repo'
import { useTaskActions } from './useTaskActions'
import './tasks.css'

const MAX_TASKS = 3
const MAX_ITEMS = 4

/** „Offen bei …“ (Gerade-Karte): die ersten offenen Aufgaben des aktiven Projekts, direkt abhakbar. */
export function ProjectTaskPreview({ project }: { project: Project }) {
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
              <label className="task-line">
                <input
                  type="checkbox"
                  className="task-check"
                  checked={false}
                  aria-label={`${task.title} erledigt`}
                  onChange={() => actions.toggle(task, true)}
                />
                <span>{task.title || 'Aufgabe'}</span>
              </label>
              {openItems.length > 0 && (
                <ul className="task-lines task-preview__items">
                  {openItems.slice(0, MAX_ITEMS).map((item) => (
                    <li key={item.id}>
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
