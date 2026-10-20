import { useState } from 'react'
import {
  applyAmountInput,
  changeAllocationMode,
  formatAllocationValue,
  modeForNewAllocation,
  type AllocationResult,
} from '../../domain/allocation'
import { formatDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import type { ActivityType, Allocation, AllocationMode, Day, Minutes, Project, Settings } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { Segmented } from '../../components/Segmented'
import { href } from '../../lib/router'
import { FillMenu } from './FillMenu'
import { useProjectsByRecency } from './useProjectsByRecency'

interface Props {
  day: Day
  result: AllocationResult
  projects: Project[]
  activityTypes: ActivityType[]
  settings: Settings
  onChange: (fn: (day: Day) => Day) => void
}

const QUICK_ADD_COUNT = 5

export function AllocationSection({ day, result, projects, activityTypes, settings, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects)
  const [focusId, setFocusId] = useState<string | null>(null)

  const activeProjects = projects.filter((p) => p.active)
  const activeTypes = activityTypes.filter((a) => a.active)

  const setAllocations = (fn: (list: Allocation[]) => Allocation[]) =>
    onChange((d) => ({ ...d, allocations: fn(d.allocations) }))

  const addRow = (projectId: string) => {
    const id = newId()
    const activityTypeId = (activeTypes[0] ?? activityTypes[0])?.id ?? ''
    setAllocations((list) => [
      ...list,
      { id, projectId, activityTypeId, mode: modeForNewAllocation(list), value: 0, note: '' },
    ])
    setFocusId(id)
  }
  // Änderungen laufen immer gegen den zuletzt gespeicherten Stand der Zeile (nicht den angezeigten).
  const changeRow = (id: string, fn: (current: Allocation) => Allocation) =>
    setAllocations((list) => list.map((a) => (a.id === id ? fn(a) : a)))
  const removeRow = (id: string) => setAllocations((list) => list.filter((a) => a.id !== id))

  // Schnellauswahl: zuletzt genutzte Projekte, aufgefüllt mit weiteren aktiven Projekten.
  const usedToday = new Set(day.allocations.map((a) => a.projectId))
  const quickAdd = byRecency.filter((p) => !usedToday.has(p.id)).slice(0, QUICK_ADD_COUNT)

  return (
    <section className="card">
      <header className="card__head">
        <h2>Projekte</h2>
        <FillMenu day={day} projects={projects} activityTypes={activityTypes} settings={settings} onChange={onChange} />
      </header>

      {day.allocations.length > 0 && (
        <div className="alloc-list">
          {day.allocations.map((a) => (
            <AllocationRow
              key={a.id}
              allocation={a}
              minutes={result.minutes[a.id] ?? null}
              total={result.total}
              projects={projects}
              activityTypes={activityTypes}
              autoFocus={a.id === focusId}
              onChange={(fn) => changeRow(a.id, fn)}
              onRemove={() => removeRow(a.id)}
            />
          ))}
        </div>
      )}

      {activeProjects.length === 0 ? (
        <p className="muted">
          Noch keine Projekte angelegt. <a href={href.projects()}>Jetzt Projekte anlegen</a>
        </p>
      ) : (
        <div className="alloc-add">
          <select
            className="input alloc-add__select"
            value=""
            aria-label="Projekt hinzufügen"
            onChange={(e) => e.target.value && addRow(e.target.value)}
          >
            <option value="">+ Projekt hinzufügen …</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectLabel(p)}
              </option>
            ))}
          </select>
          {quickAdd.length > 0 && (
            <div className="chips">
              {quickAdd.map((p) => (
                <button key={p.id} type="button" className="chip" onClick={() => addRow(p.id)} title="Zeile hinzufügen">
                  <span className="dot" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DayStatus result={result} day={day} />
    </section>
  )
}

function projectLabel(p: Project): string {
  return `${p.name}${p.code ? ` (${p.code})` : ''}${p.active ? '' : ' – inaktiv'}`
}

const MODE_OPTIONS: { value: AllocationMode; label: string; title: string }[] = [
  { value: 'duration', label: 'h:mm', title: 'Feste Dauer' },
  { value: 'percent', label: '%', title: 'Anteil an der Tageszeit' },
  { value: 'rest', label: 'Rest', title: 'Bekommt die restliche Zeit des Tages' },
]

interface RowProps {
  allocation: Allocation
  minutes: Minutes | null
  total: Minutes | null
  projects: Project[]
  activityTypes: ActivityType[]
  autoFocus: boolean
  onChange: (fn: (current: Allocation) => Allocation) => void
  onRemove: () => void
}

function AllocationRow({ allocation, minutes, total, projects, activityTypes, autoFocus, onChange, onRemove }: RowProps) {
  const project = projects.find((p) => p.id === allocation.projectId)
  const projectOptions = projects.filter((p) => p.active || p.id === allocation.projectId)
  const typeOptions = activityTypes.filter((a) => a.active || a.id === allocation.activityTypeId)

  const commitValue = (text: string): string | null => {
    const preview = applyAmountInput(allocation, text)
    if (!preview) return null
    // Gegen den gespeicherten Stand auswerten: Wurde gerade erst auf „%“ umgeschaltet,
    // ist das dort schon enthalten, in `allocation` (Anzeige) evtl. noch nicht.
    onChange((current) => applyAmountInput(current, text) ?? current)
    return formatAllocationValue(preview)
  }

  return (
    <div className="alloc-row" data-testid="alloc-row">
      <div className="alloc-row__project">
        <span className="dot" style={{ background: project?.color ?? 'transparent' }} />
        <select
          className="input"
          aria-label="Projekt"
          value={allocation.projectId}
          onChange={(e) => {
            const projectId = e.target.value
            onChange((current) => ({ ...current, projectId }))
          }}
        >
          {!project && <option value={allocation.projectId}>Unbekanntes Projekt</option>}
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {projectLabel(p)}
            </option>
          ))}
        </select>
      </div>

      {typeOptions.length <= 3 ? (
        <Segmented
          size="small"
          ariaLabel="Tätigkeitsart"
          options={typeOptions.map((a) => ({ value: a.id, label: a.name }))}
          value={allocation.activityTypeId}
          onChange={(activityTypeId) => onChange((current) => ({ ...current, activityTypeId }))}
        />
      ) : (
        <select
          className="input"
          aria-label="Tätigkeitsart"
          value={allocation.activityTypeId}
          onChange={(e) => {
            const activityTypeId = e.target.value
            onChange((current) => ({ ...current, activityTypeId }))
          }}
        >
          {typeOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}

      <Segmented
        size="small"
        ariaLabel="Eingabeart"
        options={MODE_OPTIONS}
        value={allocation.mode}
        onChange={(mode) => onChange((current) => changeAllocationMode(current, mode, minutes, total))}
      />

      {/* Auch Rest-Zeilen haben ein Feld: Tippen von „1:00“ oder „50%“ wechselt direkt den Modus. */}
      <CommitInput
        className={`input input--amount${allocation.mode === 'rest' ? ' is-rest' : ''}`}
        aria-label="Dauer oder Anteil"
        placeholder={allocation.mode === 'rest' ? 'Rest' : allocation.mode === 'percent' ? '50 %' : '1:30'}
        autoFocus={autoFocus}
        value={formatAllocationValue(allocation)}
        onCommit={commitValue}
      />

      <span className="alloc-row__result num" data-testid="alloc-result" title="Berechnete Zeit">
        {minutes === null ? '–' : formatDuration(minutes)}
      </span>

      <button
        type="button"
        className="icon-btn icon-btn--subtle"
        aria-label="Zeile entfernen"
        title="Zeile entfernen"
        onClick={onRemove}
      >
        <Icon name="x" />
      </button>
    </div>
  )
}

function DayStatus({ result, day }: { result: AllocationResult; day: Day }) {
  const { total, allocated, open, status } = result
  const percent = total ? Math.min(100, (allocated / total) * 100) : 0
  const proportional = day.fillStrategy === 'proportional' && !day.allocations.some((a) => a.mode === 'rest')

  let text: string
  switch (status) {
    case 'empty':
      text = 'Trag zuerst die Arbeitszeit ein – dann wird hier verteilt.'
      break
    case 'no-total':
      text = 'Die Arbeitszeit fehlt noch – Prozent- und Rest-Zeilen werden berechnet, sobald sie eingetragen ist.'
      break
    case 'ok':
      text = `${formatDuration(total ?? 0)} vollständig verteilt`
      break
    case 'open':
      text = `${formatDuration(allocated)} von ${formatDuration(total ?? 0)} verteilt · noch ${formatDuration(open)} offen`
      break
    case 'over':
      text = `${formatDuration(allocated)} von ${formatDuration(total ?? 0)} verteilt · ${formatDuration(-open)} zu viel`
      break
  }

  return (
    <div className={`day-status day-status--${status}`} data-testid="day-status">
      <div className="progress" aria-hidden="true">
        <div className="progress__bar" style={{ width: `${percent}%` }} />
      </div>
      <p>
        {status === 'ok' && <Icon name="check" />}
        {(status === 'over' || status === 'open') && <Icon name="alert" />} {text}
        {proportional && <span className="badge">proportional aufgefüllt</span>}
      </p>
    </div>
  )
}
