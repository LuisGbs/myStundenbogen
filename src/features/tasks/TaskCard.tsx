import { useState, type KeyboardEvent } from 'react'
import { progress, type TaskNode } from '../../domain/tasks'
import type { Task } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { SortGrip } from '../../components/SortGrip'
import { useSortDrag } from '../../components/useSortDrag'
import { createTask, reorderTask, setTaskStarred, updateTask } from '../../storage/repo'

interface Props {
  node: TaskNode
  /** Griff/Klasse aus der Liste der Aufgaben (nicht bei erledigten). */
  grip?: { props: ReturnType<ReturnType<typeof useSortDrag>['gripProps']>; className: string }
  onToggle: (task: Task, done: boolean) => void
  onDelete: (task: Task) => void
}

/** Eine Aufgabe mit Häkchen, Titel, Fortschritt, Notiz und ihren Stichpunkten (Checkliste). */
export function TaskCard({ node, grip, onToggle, onDelete }: Props) {
  const { task, items } = node
  const [noteOpen, setNoteOpen] = useState(false)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const itemSort = useSortDrag(
    `items-${task.id}`,
    items.map((i) => i.id),
    (id, beforeId) => void reorderTask(id, beforeId),
  )
  const { done, total } = progress(items)
  const showNote = noteOpen || task.note.trim() !== ''

  // Enter im Stichpunkt → direkt darunter ein neuer, leerer Stichpunkt zum Weitertippen
  const addItemAfter = async (afterId: string | null, title = '') => {
    const created = await createTask({ projectId: task.projectId, parentId: task.id, title }, afterId)
    if (afterId) setFocusId(created.id)
  }

  return (
    <li
      className={`task-card${task.done ? ' is-done' : ''}${task.starred && !task.done ? ' is-starred' : ''} ${grip?.className ?? ''}`}
      data-sort-id={task.id}
      data-testid="task-card"
    >
      <div className="task-card__head">
        {grip && <SortGrip label={`${task.title || 'Aufgabe'} verschieben`} {...grip.props} />}
        <input
          type="checkbox"
          className="task-check"
          checked={task.done}
          aria-label={`${task.title || 'Aufgabe'} erledigt`}
          onChange={(e) => onToggle(task, e.target.checked)}
        />
        <CommitInput
          className="input task-card__title"
          aria-label="Aufgabe"
          placeholder="Aufgabe"
          value={task.title}
          onCommit={(text) => {
            void updateTask(task.id, { title: text.trim() })
            return text.trim()
          }}
        />
        {!task.done && (
          <button
            type="button"
            className={`icon-btn icon-btn--subtle task-star${task.starred ? ' is-starred' : ''}`}
            aria-label={`${task.title || 'Aufgabe'} als wichtig markieren`}
            aria-pressed={task.starred}
            title={task.starred ? 'Wichtig – steht oben (nochmal klicken zum Entfernen)' : 'Als wichtig markieren (steht dann oben)'}
            onClick={() => void setTaskStarred(task.id, !task.starred)}
          >
            <Icon name="star" />
          </button>
        )}
        {total > 0 && (
          <span className={`badge${done === total ? ' badge--ok' : ' badge--muted'}`} data-testid="task-progress">
            {done}/{total}
          </span>
        )}
        <button
          type="button"
          className={`icon-btn icon-btn--subtle${task.note.trim() ? ' has-note' : ''}`}
          aria-label="Notiz zur Aufgabe"
          aria-expanded={showNote}
          onClick={() => setNoteOpen(!noteOpen)}
        >
          <Icon name="note" />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--subtle"
          aria-label={`${task.title || 'Aufgabe'} löschen`}
          title="Aufgabe löschen"
          onClick={() => onDelete(task)}
        >
          <Icon name="trash" />
        </button>
      </div>

      {showNote && (
        <CommitInput
          className="input task-card__note"
          aria-label="Notiz zur Aufgabe"
          placeholder="Notiz, z.B. Ticket oder Ansprechpartner"
          autoFocus={noteOpen && task.note.trim() === ''}
          value={task.note}
          onCommit={(text) => {
            void updateTask(task.id, { note: text.trim() })
            return text.trim()
          }}
        />
      )}

      {items.length > 0 && (
        <ul
          className={`task-items${itemSort.dragging ? ' is-dragging' : ''}${itemSort.dropAtEnd ? ' is-drop-end' : ''}`}
          data-sort-list={`items-${task.id}`}
        >
          {items.map((item) => (
            <li key={item.id} className={`task-item${item.done ? ' is-done' : ''} ${itemSort.rowClass(item.id)}`} data-sort-id={item.id}>
              <SortGrip label={`${item.title || 'Stichpunkt'} verschieben`} {...itemSort.gripProps(item.id)} />
              <input
                type="checkbox"
                className="task-check"
                checked={item.done}
                aria-label={`${item.title || 'Stichpunkt'} erledigt`}
                onChange={(e) => onToggle(item, e.target.checked)}
              />
              <CommitInput
                className="input task-item__title"
                aria-label="Stichpunkt"
                placeholder="Stichpunkt"
                autoFocus={item.id === focusId}
                value={item.title}
                onCommit={(text) => {
                  void updateTask(item.id, { title: text.trim() })
                  return text.trim()
                }}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') void addItemAfter(item.id)
                }}
              />
              <button
                type="button"
                className="icon-btn icon-btn--subtle task-item__remove"
                aria-label={`${item.title || 'Stichpunkt'} löschen`}
                onClick={() => onDelete(item)}
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!task.done && (
        <input
          className="input task-card__add"
          aria-label={`Stichpunkt zu ${task.title || 'Aufgabe'} hinzufügen`}
          placeholder="+ Stichpunkt (Enter)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !draft.trim()) return
            void addItemAfter(null, draft)
            setDraft('')
          }}
        />
      )}
    </li>
  )
}
