import type { AllocationResult } from '../../domain/allocation'
import { clockToMinutes, formatDuration, nowClock } from '../../domain/duration'
import { newId } from '../../domain/id'
import { activeAllocation, runningBlockId, startWorkingOn, stopWorking } from '../../domain/nowWorking'
import { clockIn } from '../../domain/plan'
import type { ActivityType, Day, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
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
  const running = runningBlockId(day) !== null
  const active = activeAllocation(day)
  const activeProject = active && projects.find((p) => p.id === active.projectId)
  const types = activityTypes.filter((a) => a.active || a.id === active?.activityTypeId)
  const defaultTypeId = (activityTypes.find((a) => a.active) ?? activityTypes[0])?.id ?? ''

  if (byRecency.length === 0) return null

  const start = (projectId: string) => {
    const target = { projectId, activityTypeId: defaultTypeId }
    const blockId = newId()
    const rowId = newId()
    onChange((d) => {
      const now = minutesNow()
      const clockedIn = runningBlockId(d) ? d : clockIn(d, blockId)
      return startWorkingOn(clockedIn, target, now, rowId)
    })
  }
  const stop = () => onChange((d) => stopWorking(d, minutesNow()))
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
              ariaLabel="Tätigkeitsart (gerade)"
              options={types.map((a) => ({ value: a.id, label: a.name }))}
              value={active.activityTypeId}
              onChange={setType}
            />
          )}
          <span className="num now-working__time" data-testid="now-active-time">
            {formatDuration(result.minutes[active.id] ?? 0)}
          </span>
          <button type="button" className="btn btn--small" onClick={stop}>
            <Icon name="stop" /> Anhalten
          </button>
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
              title={running ? `Ab jetzt an ${p.name} arbeiten` : `Jetzt einstempeln und an ${p.name} arbeiten`}
              data-testid={`now-chip-${p.name}`}
              onClick={() => start(p.id)}
            >
              <span className="dot" style={{ background: p.color }} />
              {p.name}
            </button>
          )
        })}
      </div>
      {activeProject && <ProjectTaskPreview project={activeProject} />}
    </section>
  )
}
