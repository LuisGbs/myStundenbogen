import { useEffect, useRef, useState } from 'react'
import type { AllocationResult } from '../../domain/allocation'
import { clockToMinutes, formatDuration, nowClock } from '../../domain/duration'
import { newId } from '../../domain/id'
import { appendNote } from '../../domain/notes'
import { activeAllocation, runningBlockId, startWorkingOn, stopWorking } from '../../domain/nowWorking'
import { clockIn } from '../../domain/plan'
import { activitiesOf, defaultActivityId } from '../../domain/activities'
import type { ActivityType, Day, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { Segmented } from '../../components/Segmented'
import { ProjectTaskPreview } from '../tasks/ProjectTaskPreview'
import { useProjectsByRecency } from './useProjectsByRecency'

interface Props {
  day: Day
  result: AllocationResult
  projects: Project[]
  activityTypes: ActivityType[]
  onChange: (fn: (day: Day) => Day) => void
}

const CHIP_COUNT = 8

/** Minuten seit Mitternacht genau jetzt (beim Klick, nicht beim letzten Neuzeichnen). */
const minutesNow = () => clockToMinutes(nowClock())

/**
 * „Ich arbeite gerade an …“: Projekt antippen → es läuft im laufenden Block mit,
 * bis man wechselt, anhält oder ausstempelt. Ohne laufenden Block: einstempeln und loslegen.
 */
export function NowWorking({ day, result, projects, activityTypes, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects).slice(0, CHIP_COUNT)
  // nach „neuer Abschnitt“ gleich in die (leere) Notiz schreiben
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const running = runningBlockId(day) !== null
  const active = activeAllocation(day)
  const activeProject = active && projects.find((p) => p.id === active.projectId)
  const types = active ? activitiesOf(active.projectId, activityTypes, active.activityTypeId) : []
  // sobald der neue Abschnitt gespeichert ist, steht der Cursor in seiner Notiz
  const activeId = active?.id
  useEffect(() => {
    if (activeId && activeId === focusNoteId) noteRef.current?.focus()
  }, [activeId, focusNoteId])

  if (byRecency.length === 0) return null

  const start = (projectId: string) => {
    const blockId = newId()
    const rowId = newId()
    onChange((d) => {
      const now = minutesNow()
      const clockedIn = runningBlockId(d) ? d : clockIn(d, blockId)
      const current = activeAllocation(clockedIn)
      // dasselbe Projekt nochmal = neuer Abschnitt mit derselben Tätigkeit
      if (current?.projectId === projectId) {
        const same = { projectId: current.projectId, activityTypeId: current.activityTypeId }
        return startWorkingOn(clockedIn, same, now, rowId, { split: true })
      }
      // neues Projekt = neue Arbeit: dessen Standard-Tätigkeit
      return startWorkingOn(clockedIn, { projectId, activityTypeId: defaultActivityId(projectId, activityTypes) }, now, rowId)
    })
    if (active?.projectId === projectId) setFocusNoteId(rowId)
  }
  const stop = () => onChange((d) => stopWorking(d, minutesNow()))
  // Notiz der laufenden Buchung – immer gegen den gespeicherten Stand ändern
  const changeNote = (fn: (note: string) => string) =>
    onChange((d) => {
      const current = activeAllocation(d)
      return current
        ? { ...d, allocations: d.allocations.map((a) => (a.id === current.id ? { ...a, note: fn(a.note) } : a)) }
        : d
    })
  const setType = (activityTypeId: string) =>
    onChange((d) => {
      const current = activeAllocation(d)
      return current
        ? { ...d, allocations: d.allocations.map((a) => (a.id === current.id ? { ...a, activityTypeId } : a)) }
        : d
    })

  return (
    <section className="card now-working" data-testid="now-working">
      <header className="card__head">
        <h2>Gerade</h2>
        <span className="muted small">
          {running
            ? 'Projekt antippen – läuft mit, bis du wechselst oder ausstempelst'
            : 'Projekt antippen = jetzt einstempeln und loslegen'}
          {active && ' · nochmal antippen = neuer Abschnitt'}
        </span>
      </header>

      {active && (
        <div className="now-working__active" data-testid="now-active">
          <span className="dot" style={{ background: activeProject?.color }} />
          <strong>{activeProject?.name ?? '?'}</strong>
          <span className="badge badge--live">läuft</span>
          {types.length > 1 && types.length <= 3 && (
            <Segmented
              size="small"
              ariaLabel="Tätigkeit (gerade)"
              options={types.map((a) => ({ value: a.id, label: a.name }))}
              value={active.activityTypeId}
              onChange={setType}
            />
          )}
          {types.length > 3 && (
            <select
              className="input"
              aria-label="Tätigkeit (gerade)"
              value={active.activityTypeId}
              onChange={(e) => setType(e.target.value)}
            >
              {types.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <span className="num now-working__time" data-testid="now-active-time">
            {formatDuration(result.minutes[active.id] ?? 0)}
          </span>
          <button
            type="button"
            className="btn btn--small"
            title="Neuen Abschnitt im selben Projekt beginnen – der bisherige bleibt mit seiner Zeit und Notiz stehen"
            onClick={() => start(active.projectId)}
          >
            <Icon name="plus" /> Neu beginnen
          </button>
          <button type="button" className="btn btn--small" onClick={stop}>
            <Icon name="stop" /> Anhalten
          </button>
          <CommitInput
            key={active.id}
            ref={noteRef}
            className="input now-working__note"
            aria-label="Notiz (gerade)"
            placeholder="Notiz: woran genau? (erscheint im Monat) – oder unten eine Aufgabe mit ▶ wählen"
            value={active.note}
            onCommit={(text) => {
              const note = text.trim()
              changeNote(() => note)
              return note
            }}
          />
        </div>
      )}

      <div className="chips">
        {byRecency.map((p) => {
          const isActive = active?.projectId === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={`chip${isActive ? ' is-active' : ''}`}
              aria-pressed={isActive}
              title={
                isActive
                  ? `Neuen Abschnitt bei ${p.name} beginnen – der bisherige bleibt mit seiner Zeit und Notiz stehen`
                  : running
                    ? `Ab jetzt an ${p.name} arbeiten`
                    : `Jetzt einstempeln und an ${p.name} arbeiten`
              }
              data-testid={`now-chip-${p.name}`}
              onClick={() => start(p.id)}
            >
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          )
        })}
      </div>
      {activeProject && active && (
        <ProjectTaskPreview
          project={activeProject}
          activeNote={active.note}
          onWorkOn={(title) => changeNote((note) => appendNote(note, title))}
        />
      )}
    </section>
  )
}
