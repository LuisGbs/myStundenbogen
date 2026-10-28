import { todayISO } from '../../domain/date'
import type { Task } from '../../domain/types'
import type { ToastAction } from '../../components/Toast'
import { deleteTask, restoreTasks, setTaskDone } from '../../storage/repo'

/**
 * Abhaken und Löschen mit Rückmeldung: Ist der letzte Stichpunkt erledigt, wird
 * gefragt, ob die Aufgabe auch abgehakt werden soll; Löschen lässt sich kurz rückgängig machen.
 */
export function useTaskActions(tasks: Task[], showToast: (message: string, action?: ToastAction) => void) {
  const toggle = (task: Task, done: boolean) => {
    void setTaskDone(task.id, done, todayISO())
    if (!done || task.parentId === null) return
    const parent = tasks.find((t) => t.id === task.parentId)
    const siblings = tasks.filter((t) => t.parentId === task.parentId)
    if (parent && !parent.done && siblings.every((s) => s.id === task.id || s.done)) {
      showToast(`Alle Stichpunkte von „${parent.title}“ erledigt.`, {
        label: 'Aufgabe auch abhaken',
        onClick: () => void setTaskDone(parent.id, true, todayISO()),
      })
    }
  }

  const remove = async (task: Task) => {
    const removed = await deleteTask(task.id)
    showToast(`„${task.title || (task.parentId ? 'Stichpunkt' : 'Aufgabe')}“ gelöscht.`, {
      label: 'Rückgängig',
      onClick: () => void restoreTasks(removed),
    })
  }

  return { toggle, remove }
}
