import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  attachToBlock,
  chronologicalOrder,
  detachFromTimeline,
  isOnTimeline,
  MIN_SEGMENT_MINUTES,
  moveAllocation,
  toBlockRest,
  type MoveTarget,
  type TimelineBlock,
} from '../../domain/timeline'
import {
  applyAmountInput,
  changeAllocationMode,
  formatAllocationValue,
  hasDayRest,
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
  /** Blöcke der Zeitleiste (für Modus „Zeitleiste“ und die zeitliche Sortierung). */
  timelineBlocks: TimelineBlock[]
  onChange: (fn: (day: Day) => Day) => void
}

const QUICK_ADD_COUNT = 5

/** Gruppe der Liste: ein Block der Zeitleiste oder (blockId null) „Ohne Zeitleiste“. */
interface RowGroup {
  blockId: string | null
  label: string
  rows: Allocation[]
}

/** Ziehen einer Zeile am Griff. */
interface RowDrag {
  allocationId: string
  startY: number
  active: boolean
  target: MoveTarget | null
}

/** Ziel unter dem Zeiger: Zeile (obere/untere Hälfte) oder Gruppenkopf/leere Gruppe. */
function rowTargetAt(x: number, y: number, groups: RowGroup[]): MoveTarget | null {
  const el = document.elementFromPoint(x, y)
  const groupEl = el?.closest<HTMLElement>('[data-group]')
  if (!groupEl) return null
  const blockId = groupEl.dataset.group || null
  const group = groups.find((g) => g.blockId === blockId)
  if (!group) return null
  const rowEl = el?.closest<HTMLElement>('[data-row-id]')
  if (!rowEl) return { blockId, beforeId: group.rows[0]?.id ?? null }
  const rect = rowEl.getBoundingClientRect()
  const i = group.rows.findIndex((r) => r.id === rowEl.dataset.rowId)
  const beforeId = y < rect.top + rect.height / 2 ? group.rows[i]?.id : group.rows[i + 1]?.id
  return { blockId, beforeId: beforeId ?? null }
}

/** Ziel für ↑/↓ am Griff: eine Position weiter, an Gruppengrenzen in die Nachbargruppe. */
function keyboardTarget(groups: RowGroup[], allocationId: string, direction: -1 | 1): MoveTarget | null {
  const g = groups.findIndex((x) => x.rows.some((r) => r.id === allocationId))
  if (g < 0) return null
  const rows = groups[g].rows
  const i = rows.findIndex((r) => r.id === allocationId)
  if (direction < 0) {
    if (i > 0) return { blockId: groups[g].blockId, beforeId: rows[i - 1].id }
    const prev = groups[g - 1]
    return prev ? { blockId: prev.blockId, beforeId: null } : null
  }
  if (i < rows.length - 1) return { blockId: groups[g].blockId, beforeId: rows[i + 2]?.id ?? null }
  const next = groups[g + 1]
  return next ? { blockId: next.blockId, beforeId: next.rows[0]?.id ?? null } : null
}

const comboKey = (a: Allocation) => `${a.projectId}|${a.activityTypeId}`

export function AllocationSection({ day, result, projects, activityTypes, settings, timelineBlocks, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [rowDrag, setRowDrag] = useState<RowDrag | null>(null)
  const rowDragRef = useRef<RowDrag | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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

  // Modus „Zeitleiste“: Zeile hinten an den ersten Block mit freiem Platz hängen.
  const blockIds = new Set(timelineBlocks.map((b) => b.id))
  const freeBlock = timelineBlocks.find((b) => b.minutes - b.boundMinutes >= MIN_SEGMENT_MINUTES)
  const attachRow = (id: string, minutes: Minutes | null) => {
    if (!freeBlock) return
    setAllocations((list) => attachToBlock(list, id, freeBlock, minutes ?? 0) ?? list)
  }

  // Gruppen: je Block der Zeitleiste (zeitlich sortiert), danach „Ohne Zeitleiste“.
  const ordered = chronologicalOrder(day.allocations, timelineBlocks)
  const groups: RowGroup[] = [
    ...timelineBlocks.map((b) => ({
      blockId: b.id,
      label: `${b.label}${b.planned ? ' · geplant' : ''}`,
      rows: ordered.filter((a) => a.blockId === b.id && isOnTimeline(a, blockIds)),
    })),
    { blockId: null, label: 'Ohne Zeitleiste (h:mm, %, Rest)', rows: ordered.filter((a) => !isOnTimeline(a, blockIds)) },
  ]
  // Kopfzeilen erst, wenn etwas auf der Zeitleiste liegt (oder gerade gezogen wird).
  const grouped = timelineBlocks.length > 0 && (ordered.some((a) => isOnTimeline(a, blockIds)) || !!rowDrag?.active)

  // Gleiches Projekt + Tätigkeit mehrfach (z.B. vor und nach der Pause) → Summe anzeigen.
  const comboTotals = new Map<string, { count: number; minutes: Minutes }>()
  for (const a of day.allocations) {
    const c = comboTotals.get(comboKey(a)) ?? { count: 0, minutes: 0 }
    comboTotals.set(comboKey(a), { count: c.count + 1, minutes: c.minutes + (result.minutes[a.id] ?? 0) })
  }

  const moveRow = (id: string, target: MoveTarget) => {
    const resolved = result.minutes[id] ?? null
    if (!moveAllocation(day.allocations, id, target, timelineBlocks, resolved)) {
      const block = timelineBlocks.find((b) => b.id === target.blockId)
      setMessage(`Der Block ${block?.label ?? ''} ist schon voll belegt – zuerst ein Segment kürzen.`)
      return
    }
    setMessage(null)
    setAllocations((list) => moveAllocation(list, id, target, timelineBlocks, resolved) ?? list)
  }

  const updateRowDrag = (next: RowDrag | null) => {
    rowDragRef.current = next
    setRowDrag(next)
  }

  const gripProps = (id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      updateRowDrag({ allocationId: id, startY: e.clientY, active: false, target: null })
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = rowDragRef.current
      if (!d) return
      const active = d.active || Math.abs(e.clientY - d.startY) > 4
      if (!active) return
      const target = rowTargetAt(e.clientX, e.clientY, groups)
      if (active !== d.active || target?.blockId !== d.target?.blockId || target?.beforeId !== d.target?.beforeId) {
        updateRowDrag({ ...d, active, target })
      }
    },
    onPointerUp: () => {
      const d = rowDragRef.current
      updateRowDrag(null)
      if (d?.active && d.target) moveRow(d.allocationId, d.target)
    },
    onPointerCancel: () => updateRowDrag(null),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const direction = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      if (!direction) return
      e.preventDefault()
      const target = keyboardTarget(groups, id, direction)
      if (target) moveRow(id, target)
    },
  })

  const dropTarget = rowDrag?.active ? rowDrag.target : null

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
        <div className={`alloc-list${rowDrag?.active ? ' is-dragging' : ''}`}>
          {groups.map((g) => {
            // Leere Blöcke nur beim Ziehen als Ablagefläche zeigen
            if (g.rows.length === 0 && !(grouped && rowDrag?.active)) return null
            const dropHere = !!dropTarget && dropTarget.blockId === g.blockId
            return (
              <div
                key={g.blockId ?? 'frei'}
                className={`alloc-group${dropHere && dropTarget.beforeId === null ? ' is-drop-end' : ''}`}
                data-group={g.blockId ?? ''}
                data-testid={`alloc-group-${g.blockId ?? 'frei'}`}
              >
                {grouped && (
                  <div className="alloc-group__head">
                    {g.label}
                    {g.rows.length === 0 && <span className="muted"> · hierher ziehen</span>}
                  </div>
                )}
                {g.rows.map((a) => {
                  const combo = comboTotals.get(comboKey(a))
                  return (
                    <AllocationRow
                      key={a.id}
                      allocation={a}
                      onTimeline={isOnTimeline(a, blockIds)}
                      canAttach={!!freeBlock}
                      hasBlocks={timelineBlocks.length > 0}
                      onAttach={() => attachRow(a.id, result.minutes[a.id] ?? null)}
                      onBlockRest={() => {
                        const blockId = isOnTimeline(a, blockIds) ? a.blockId! : timelineBlocks[0].id
                        changeRow(a.id, (current) => toBlockRest(current, blockId))
                      }}
                      minutes={result.minutes[a.id] ?? null}
                      combined={combo && combo.count > 1 ? combo.minutes : null}
                      total={result.total}
                      projects={projects}
                      activityTypes={activityTypes}
                      autoFocus={a.id === focusId}
                      dragging={rowDrag?.active === true && rowDrag.allocationId === a.id}
                      dropBefore={dropHere && dropTarget.beforeId === a.id}
                      gripProps={gripProps(a.id)}
                      onChange={(fn) => changeRow(a.id, fn)}
                      onRemove={() => removeRow(a.id)}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      {message && <p className="timeline__message">{message}</p>}

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

/**
 * Eingabeart einer Zeile; „timeline“ = feste Dauer in einem Block, oben in der Zeitleiste
 * bearbeitbar; „blockRest“ = bekommt den Rest seines Blocks.
 */
type RowMode = AllocationMode | 'blockRest' | 'timeline'

const MODE_OPTIONS: { value: RowMode; label: string; title: string }[] = [
  { value: 'duration', label: 'h:mm', title: 'Feste Dauer (oben gesperrt)' },
  { value: 'percent', label: '%', title: 'Anteil an der Tageszeit (oben gesperrt)' },
  { value: 'rest', label: 'Rest', title: 'Bekommt die restliche Zeit des Tages (oben gesperrt)' },
  { value: 'blockRest', label: 'Block-Rest', title: 'Bekommt die restliche Zeit seines Blocks' },
  { value: 'timeline', label: 'Zeitleiste', title: 'Oben in der Zeitleiste ziehen und einstellen' },
]

interface RowProps {
  allocation: Allocation
  onTimeline: boolean
  canAttach: boolean
  hasBlocks: boolean
  onAttach: () => void
  onBlockRest: () => void
  minutes: Minutes | null
  /** Summe aller Zeilen mit demselben Projekt + Tätigkeit, wenn es mehrere gibt. */
  combined: Minutes | null
  total: Minutes | null
  projects: Project[]
  activityTypes: ActivityType[]
  autoFocus: boolean
  dragging: boolean
  dropBefore: boolean
  gripProps: Record<string, unknown>
  onChange: (fn: (current: Allocation) => Allocation) => void
  onRemove: () => void
}

function AllocationRow({
  allocation,
  onTimeline,
  canAttach,
  hasBlocks,
  onAttach,
  onBlockRest,
  minutes,
  combined,
  total,
  projects,
  activityTypes,
  autoFocus,
  dragging,
  dropBefore,
  gripProps,
  onChange,
  onRemove,
}: RowProps) {
  const blockRest = onTimeline && allocation.mode === 'rest'
  const rowMode: RowMode = blockRest ? 'blockRest' : onTimeline ? 'timeline' : allocation.mode
  const project = projects.find((p) => p.id === allocation.projectId)
  const projectOptions = projects.filter((p) => p.active || p.id === allocation.projectId)
  const typeOptions = activityTypes.filter((a) => a.active || a.id === allocation.activityTypeId)
  const [noteOpen, setNoteOpen] = useState(false)
  const showNote = noteOpen || allocation.note.trim() !== ''

  const commitValue = (text: string): string | null => {
    const preview = applyAmountInput(allocation, text)
    if (!preview) return null
    // Gegen den gespeicherten Stand auswerten: Wurde gerade erst auf „%“ umgeschaltet,
    // ist das dort schon enthalten, in `allocation` (Anzeige) evtl. noch nicht.
    // Wird daraus % oder Rest, verlässt die Zeile die Zeitleiste.
    onChange((current) => {
      const next = applyAmountInput(current, text) ?? current
      return next.mode === 'duration' ? next : detachFromTimeline(next)
    })
    return formatAllocationValue(preview)
  }

  return (
    <div
      className={['alloc-row', dragging && 'is-dragging', dropBefore && 'is-drop-before'].filter(Boolean).join(' ')}
      data-testid="alloc-row"
      data-row-id={allocation.id}
    >
      <button
        type="button"
        className="alloc-row__grip"
        aria-label="Zeile verschieben"
        title="Ziehen zum Verschieben (oder Pfeiltasten ↑/↓)"
        {...gripProps}
      >
        <Icon name="grip" />
      </button>
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
        options={MODE_OPTIONS.map((o) =>
          o.value === 'timeline' && !onTimeline && !canAttach
            ? { ...o, disabled: true, title: 'Kein freier Platz in der Zeitleiste' }
            : o.value === 'blockRest' && !hasBlocks
              ? { ...o, disabled: true, title: 'Erst Arbeitszeit eintragen – dann gibt es Blöcke' }
              : o,
        )}
        value={rowMode}
        onChange={(mode) => {
          if (mode === 'blockRest') onBlockRest()
          else if (mode === 'timeline' && blockRest) {
            // Block-Rest → feste Dauer im selben Block mit der aktuellen Zeit
            const value = Math.max(minutes ?? 0, MIN_SEGMENT_MINUTES)
            onChange((current) => ({ ...current, mode: 'duration', value }))
          } else if (mode === 'timeline') onAttach()
          else onChange((current) => detachFromTimeline(changeAllocationMode(current, mode, minutes, total)))
        }}
      />

      {/* Auch Rest-Zeilen haben ein Feld: Tippen von „1:00“ oder „50%“ wechselt direkt den Modus. */}
      <CommitInput
        className={`input input--amount${allocation.mode === 'rest' ? ' is-rest' : ''}`}
        aria-label="Dauer oder Anteil"
        placeholder={blockRest ? 'Blockrest' : allocation.mode === 'rest' ? 'Rest' : allocation.mode === 'percent' ? '50 %' : '1:30'}
        autoFocus={autoFocus}
        value={formatAllocationValue(allocation)}
        onCommit={commitValue}
      />

      <span className="alloc-row__sum">
        <span className="alloc-row__result num" data-testid="alloc-result" title="Berechnete Zeit">
          {minutes === null ? '–' : formatDuration(minutes)}
        </span>
        {combined !== null && (
          <span
            className="alloc-row__combined num"
            data-testid="alloc-combined"
            title="Gleiches Projekt und gleiche Tätigkeit zusammen – im Monat eine Zeile"
          >
            Σ {formatDuration(combined)}
          </span>
        )}
      </span>

      <button
        type="button"
        className={`icon-btn icon-btn--subtle${allocation.note.trim() ? ' has-note' : ''}`}
        aria-label="Notiz"
        aria-expanded={showNote}
        title="Notiz zu diesem Eintrag"
        onClick={() => setNoteOpen(!noteOpen)}
      >
        <Icon name="note" />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--subtle"
        aria-label="Zeile entfernen"
        title="Zeile entfernen"
        onClick={onRemove}
      >
        <Icon name="x" />
      </button>
      {showNote && (
        <div className="alloc-row__note">
          <NoteInput
            value={allocation.note}
            autoFocus={noteOpen && allocation.note.trim() === ''}
            onCommit={(note) => onChange((current) => ({ ...current, note }))}
          />
        </div>
      )}
    </div>
  )
}

/** Notiz zu einem Eintrag (z.B. Tätigkeit für die Firmensoftware). */
export function NoteInput({
  value,
  onCommit,
  autoFocus = false,
}: {
  value: string
  onCommit: (note: string) => void
  autoFocus?: boolean
}) {
  return (
    <CommitInput
      className="input"
      aria-label="Notiz zum Eintrag"
      placeholder="Notiz, z.B. Tätigkeit oder Ticket"
      autoFocus={autoFocus}
      value={value}
      onCommit={(text) => {
        const note = text.trim()
        onCommit(note)
        return note
      }}
    />
  )
}

function DayStatus({ result, day }: { result: AllocationResult; day: Day }) {
  const { total, allocated, open, status } = result
  const percent = total ? Math.min(100, (allocated / total) * 100) : 0
  const proportional = day.fillStrategy === 'proportional' && !hasDayRest(day.allocations)

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
