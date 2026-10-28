import { describe, expect, it } from 'vitest'
import { insertAfter, openTaskCounts, progress, taskTree } from './tasks'
import type { Task } from './types'

const task = (id: string, projectId: string, parentId: string | null, sortOrder: number, done = false): Task => ({
  id,
  projectId,
  parentId,
  title: id,
  note: '',
  done,
  doneAt: done ? '2026-10-28' : null,
  sortOrder,
  createdAt: '',
})

const tasks = [
  task('b', 'epis', null, 1),
  task('a', 'epis', null, 0),
  task('erledigt', 'epis', null, 2, true),
  task('a2', 'epis', 'a', 1, true),
  task('a1', 'epis', 'a', 0),
  task('x', 'revit', null, 0),
]

describe('Aufgaben', () => {
  it('Baum je Projekt: Aufgaben mit Stichpunkten, sortiert, erledigte getrennt', () => {
    const { open, done } = taskTree(tasks, 'epis')
    expect(open.map((n) => [n.task.id, n.items.map((i) => i.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', []],
    ])
    expect(done.map((n) => n.task.id)).toEqual(['erledigt'])
  })

  it('Fortschritt und offene Aufgaben je Projekt (Stichpunkte zählen nicht)', () => {
    expect(progress(taskTree(tasks, 'epis').open[0].items)).toEqual({ done: 1, total: 2 })
    expect(openTaskCounts(tasks)).toEqual(new Map([
      ['epis', 2],
      ['revit', 1],
    ]))
  })

  it('neuer Eintrag direkt hinter einem anderen (Enter im Stichpunkt)', () => {
    expect(insertAfter(['a', 'b', 'c'], 'n', 'a')).toEqual(['a', 'n', 'b', 'c'])
    expect(insertAfter(['a', 'b'], 'n', null)).toEqual(['a', 'b', 'n'])
    expect(insertAfter(['a'], 'n', 'weg')).toEqual(['a', 'n'])
  })
})
