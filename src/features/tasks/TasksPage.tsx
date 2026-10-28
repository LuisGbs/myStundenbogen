import { useState } from 'react'
import { openTaskCounts, progress, taskTree } from '../../domain/tasks'
import type { Project, Task } from '../../domain/types'
import { useToast } from '../../components/Toast'
import { useSortDrag } from '../../components/useSortDrag'
import { useLocalPreference } from '../../lib/browser'
import { href } from '../../lib/router'
import { useProjects, useTasks } from '../../storage/hooks'
import { Icon } from '../../components/Icon'
import { createTask, reorderTask, undoTaskImport, type TaskImportResult } from '../../storage/repo'
import { StarMark } from './StarMark'
import { TaskCard } from './TaskCard'
import { ExportTasksDialog, ImportTasksDialog, TaskFormatInfoDialog } from './TaskTransferDialogs'
import { useTaskActions } from './useTaskActions'
import './tasks.css'

/** Reiter „Aufgaben“: offene Punkte je Projekt (getrennt vom Stundentracking). */
export function TasksPage({ projectId }: { projectId: string | null }) {
  const projects = useProjects()
  const tasks = useTasks()
  const [showInactive, setShowInactive] = useLocalPreference('tasks.showInactive', false)
  const [toast, showToast] = useToast()
  const actions = useTaskActions(tasks ?? [], showToast)
  const [dialog, setDialog] = useState<'import' | 'export' | 'info' | null>(null)
  if (!projects || !tasks) return null

  const imported = (result: TaskImportResult) => {
    setDialog(null)
    const extra = result.projectIds.length ? `, ${result.projectIds.length} neue Projekte` : ''
    showToast(`${result.taskCount} Aufgaben importiert${extra}`, {
      label: 'Rückgängig',
      onClick: () => void undoTaskImport(result),
    })
  }

  const counts = openTaskCounts(tasks)
  const inactiveCount = projects.filter((p) => !p.active).length
  const visible = projects.filter((p) => p.active || showInactive || p.id === projectId)
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined

  return (
    <div className="page tasks-page">
      <nav className="tasks-nav card" aria-label="Projekte">
        <a href={href.tasks()} className={`tasks-nav__item${projectId === null ? ' is-active' : ''}`}>
          Alle
          <span className="tasks-nav__count">{[...counts.values()].reduce((a, b) => a + b, 0)}</span>
        </a>
        {visible.map((p) => (
          <a
            key={p.id}
            href={href.tasks(p.id)}
            className={`tasks-nav__item${p.id === projectId ? ' is-active' : ''}${p.active ? '' : ' is-inactive'}`}
            data-testid={`tasks-nav-${p.name}`}
          >
            <span className="dot" style={{ background: p.color }} />
            <span className="tasks-nav__name">{p.name}</span>
            {counts.get(p.id) ? <span className="tasks-nav__count">{counts.get(p.id)}</span> : null}
          </a>
        ))}
        {inactiveCount > 0 && (
          <label className="checkbox small tasks-nav__inactive">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Inaktive zeigen ({inactiveCount})
          </label>
        )}
        {projects.length === 0 && (
          <p className="muted small">
            Noch keine Projekte. <a href={href.projects()}>Projekte anlegen</a>
          </p>
        )}
        <div className="tasks-nav__tools">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog('import')}>
            <Icon name="upload" /> Importieren …
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog('export')}>
            <Icon name="download" /> Exportieren …
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--subtle"
            aria-label="Format & LLM-Hilfe"
            title="Format & LLM-Hilfe: so übernimmst du deine bisherige ToDo-Liste"
            onClick={() => setDialog('info')}
          >
            <Icon name="info" />
          </button>
        </div>
      </nav>

      <div className="tasks-main">
        {project ? (
          <ProjectTasks key={project.id} project={project} tasks={tasks} actions={actions} />
        ) : projectId ? (
          <p className="muted">Dieses Projekt gibt es nicht mehr.</p>
        ) : (
          <Overview projects={visible} tasks={tasks} actions={actions} />
        )}
      </div>
      {dialog === 'import' && (
        <ImportTasksDialog
          projects={projects}
          tasks={tasks}
          onClose={() => setDialog(null)}
          onImported={imported}
          onShowInfo={() => setDialog('info')}
        />
      )}
      {dialog === 'export' && (
        <ExportTasksDialog
          projects={projects}
          tasks={tasks}
          projectId={project?.id ?? null}
          onClose={() => setDialog(null)}
          onMessage={showToast}
        />
      )}
      {dialog === 'info' && (
        <TaskFormatInfoDialog
          projects={projects}
          onClose={() => setDialog(null)}
          onMessage={showToast}
          onOpenImport={() => setDialog('import')}
        />
      )}
      {toast}
    </div>
  )
}

type Actions = ReturnType<typeof useTaskActions>

function ProjectTasks({ project, tasks, actions }: { project: Project; tasks: Task[]; actions: Actions }) {
  const [title, setTitle] = useState('')
  const { open, done } = taskTree(tasks, project.id)
  const sort = useSortDrag(
    `tasks-${project.id}`,
    open.map((n) => n.task.id),
    (id, beforeId) => void reorderTask(id, beforeId),
  )

  return (
    <section className="card">
      <header className="card__head">
        <h2>
          <span className="dot" style={{ background: project.color }} /> {project.name}
        </h2>
        <span className="muted small">
          {open.length} offen{done.length ? ` · ${done.length} erledigt` : ''}
        </span>
      </header>

      <input
        className="input tasks-add"
        aria-label="Neue Aufgabe"
        placeholder="+ Aufgabe (Enter)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !title.trim()) return
          void createTask({ projectId: project.id, parentId: null, title })
          setTitle('')
        }}
      />

      {open.length === 0 ? (
        <p className="muted">Keine offenen Aufgaben. Oben eine neue anlegen.</p>
      ) : (
        <ul
          className={`task-list${sort.dragging ? ' is-dragging' : ''}${sort.dropAtEnd ? ' is-drop-end' : ''}`}
          data-sort-list={`tasks-${project.id}`}
        >
          {open.map((node) => (
            <TaskCard
              key={node.task.id}
              node={node}
              grip={{ props: sort.gripProps(node.task.id), className: sort.rowClass(node.task.id) }}
              onToggle={actions.toggle}
              onDelete={(t) => void actions.remove(t)}
            />
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <details className="tasks-done" data-testid="tasks-done">
          <summary>Erledigt ({done.length})</summary>
          <ul className="task-list">
            {done.map((node) => (
              <TaskCard key={node.task.id} node={node} onToggle={actions.toggle} onDelete={(t) => void actions.remove(t)} />
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

/** „Alle“: offene Aufgaben aller Projekte kompakt untereinander. */
function Overview({ projects, tasks, actions }: { projects: Project[]; tasks: Task[]; actions: Actions }) {
  const sections = projects.map((p) => ({ project: p, open: taskTree(tasks, p.id).open })).filter((s) => s.open.length > 0)
  if (sections.length === 0) {
    return (
      <section className="card">
        <p className="muted">Keine offenen Aufgaben. Links ein Projekt wählen und loslegen.</p>
      </section>
    )
  }
  return (
    <>
      {sections.map(({ project, open }) => (
        <section key={project.id} className="card tasks-overview">
          <header className="card__head">
            <h2>
              <a href={href.tasks(project.id)}>
                <span className="dot" style={{ background: project.color }} /> {project.name}
              </a>
            </h2>
            <span className="muted small">{open.length} offen</span>
          </header>
          <ul className="task-lines">
            {open.map(({ task, items }) => {
              const { done, total } = progress(items)
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
                    {task.starred && <StarMark />}
                    <span>{task.title || 'Aufgabe'}</span>
                    {total > 0 && (
                      <span className="badge badge--muted">
                        {done}/{total}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
