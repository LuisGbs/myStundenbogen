import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { changeAllocationMode, type AllocationResult } from '../../domain/allocation'
import { summarizeDay } from '../../domain/day'
import { formatDuration, minutesToClock, parseDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import {
  insertionBefore,
  insertSegment,
  layoutTimeline,
  maxSegmentMinutes,
  MIN_SEGMENT_MINUTES,
  moveAllocation,
  resizeSegment,
  snapMinutes,
  SNAP_MINUTES,
  type MoveTarget,
  type PlacementContext,
  type TimelineBlock,
  type TimelineSegment,
} from '../../domain/timeline'
import type { ActivityType, Allocation, Day, Minutes, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput } from '../../components/inputs'
import { Segmented } from '../../components/Segmented'
import { NoteInput } from './AllocationSection'
import { useProjectsByRecency } from './useProjectsByRecency'

interface Props {
  day: Day
  result: AllocationResult
  projects: Project[]
  activityTypes: ActivityType[]
  nowMinutes: Minutes | null
  /** Laufender Block: bis zum voraussichtlichen Gehen zeichnen (Rest grau). */
  forecast: { blockId: string; end: Minutes } | null
  onChange: (fn: (day: Day) => Day) => void
}

/** Ziehen eines Projekt-Chips in einen Block (Pointer Events → Maus und Touch). */
interface ChipDrag {
  projectId: string
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  overBlock: string | null
}

/** Ziehen eines ganzen Segments an eine andere Stelle (im Block oder in einen anderen Block). */
interface SegmentDrag {
  allocationId: string
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
}

/** Ablageziel beim Ziehen: Block, Zeile davor und Position der Einfügemarke (in % des Blocks). */
interface DropTarget {
  block: TimelineBlock
  minute: Minutes
  beforeId: string | null
  markerLeft: number
}

/** Ziehen am rechten Rand eines Segments. */
interface Resize {
  allocationId: string
  /** Obergrenze (Block minus die übrigen festen Zeilen), beim Start des Ziehens festgehalten. */
  maxMinutes: Minutes
  startX: number
  startValue: Minutes
  pxPerMinute: number
  value: Minutes
  /** Losgelassen und gespeichert – Vorschau bleibt, bis der neue Wert aus der Datenbank da ist. */
  committed: boolean
}

/** Block unter dem Zeiger und die Uhrzeit (Minute) an dieser Stelle. */
function blockAt(x: number, y: number, blocks: TimelineBlock[]): { block: TimelineBlock; minute: Minutes } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-block-id]')
  const block = el && blocks.find((b) => b.id === el.dataset.blockId)
  if (!el || !block) return null
  const rect = el.getBoundingClientRect()
  return { block, minute: block.start + ((x - rect.left) / rect.width) * block.displayMinutes }
}

/** Wo landet etwas, das an (x, y) losgelassen wird? `selfId` = gezogenes Segment (zählt nicht mit). */
function dropTargetAt(x: number, y: number, blocks: TimelineBlock[], selfId: string | null): DropTarget | null {
  const hit = blockAt(x, y, blocks)
  if (!hit) return null
  // Alle Zeilen des Blocks zählen (auch gesperrte), nicht aber Überlauf-Stücke und offene Zeit.
  const placed = hit.block.segments.filter(
    (s) => (s.kind === 'bound' || s.kind === 'blockRest' || s.kind === 'floating') && s.allocationId !== selfId,
  )
  const beforeId = insertionBefore(placed, hit.minute)
  const before = placed.find((s) => s.allocationId === beforeId)
  const markerLeft = before ? before.left : Math.max(0, ...placed.map((s) => Math.min(100, s.left + s.width)))
  return { ...hit, beforeId, markerLeft }
}

const fullMessage = (block: TimelineBlock) => `Der Block ${block.label} ist schon voll belegt – zuerst ein Segment kürzen.`

export function DayTimeline({ day, result, projects, activityTypes, nowMinutes, forecast, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects)
  const [chipDrag, setChipDrag] = useState<ChipDrag | null>(null)
  const chipDragRef = useRef<ChipDrag | null>(null)
  const [segmentDrag, setSegmentDrag] = useState<SegmentDrag | null>(null)
  const segmentDragRef = useRef<SegmentDrag | null>(null)
  /** Nach dem Ziehen eines Segments keinen Klick (= Auswählen) auslösen. */
  const suppressClickRef = useRef(false)
  const [resize, setResize] = useState<Resize | null>(null)
  const resizeRef = useRef<Resize | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Während des Ziehens am Rand: Vorschau mit der neuen Dauer (gespeichert wird beim Loslassen).
  const shownDay = resize
    ? { ...day, allocations: resizeSegment(day.allocations, resize.allocationId, resize.value, resize.maxMinutes) }
    : day
  if (resize?.committed) {
    const saved = day.allocations.find((a) => a.id === resize.allocationId)?.value
    const shown = shownDay.allocations.find((a) => a.id === resize.allocationId)?.value
    if (saved === undefined || saved === shown) setResize(null)
  }
  const shownResult = resize ? summarizeDay(shownDay, nowMinutes).allocation : result
  const layout = layoutTimeline(shownDay, shownResult, nowMinutes, forecast)
  if (!layout) return null

  const defaultTypeId = (activityTypes.find((a) => a.active) ?? activityTypes[0])?.id ?? ''
  const ctx: PlacementContext = { blockOf: shownResult.blockOf, blocks: layout.blocks }
  const allocationById = new Map(shownDay.allocations.map((a) => [a.id, a]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const activityById = new Map(activityTypes.map((a) => [a.id, a]))

  const segmentName = (a: Allocation | undefined): string => {
    if (!a) return 'offen'
    const t = activityById.get(a.activityTypeId)
    return `${projectById.get(a.projectId)?.name ?? '?'}${t ? ` · ${t.name}` : ''}`
  }

  // ---------- Projekt in einen Block einfügen ----------

  const addToBlock = (projectId: string, block: TimelineBlock, beforeId: string | null) => {
    const base = { id: newId(), projectId, activityTypeId: defaultTypeId, note: '' }
    if (!insertSegment(day.allocations, block.id, beforeId, base, ctx)) {
      setMessage(fullMessage(block))
      return
    }
    setMessage(null)
    setSelectedId(base.id)
    onChange((d) => {
      const next = insertSegment(d.allocations, block.id, beforeId, base, ctx)
      return next ? { ...d, allocations: next } : d
    })
  }

  const updateChipDrag = (next: ChipDrag | null) => {
    chipDragRef.current = next
    setChipDrag(next)
  }
  const isDragged = (d: ChipDrag, x: number, y: number) => d.active || Math.hypot(x - d.startX, y - d.startY) > 5

  const chipHandlers = (projectId: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      updateChipDrag({ projectId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, overBlock: null })
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = chipDragRef.current
      if (!d) return
      const active = isDragged(d, e.clientX, e.clientY)
      const over = active ? blockAt(e.clientX, e.clientY, layout.blocks) : null
      updateChipDrag({ ...d, x: e.clientX, y: e.clientY, active, overBlock: over?.block.id ?? null })
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      const d = chipDragRef.current
      if (!d) return
      updateChipDrag(null)
      if (isDragged(d, e.clientX, e.clientY)) {
        const over = dropTargetAt(e.clientX, e.clientY, layout.blocks, null)
        if (over) addToBlock(d.projectId, over.block, over.beforeId)
        return
      }
      // Einfacher Klick: hinten in den ersten Block mit freiem Platz.
      const target = layout.blocks.find((b) => b.minutes - b.fixedMinutes >= MIN_SEGMENT_MINUTES) ?? layout.blocks[0]
      addToBlock(d.projectId, target, null)
    },
    onPointerCancel: () => updateChipDrag(null),
  })

  // ---------- Ganzes Segment verschieben ----------

  const moveTo = (allocationId: string, target: MoveTarget, block: TimelineBlock) => {
    if (!moveAllocation(day.allocations, allocationId, target, ctx)) {
      setMessage(fullMessage(block))
      return
    }
    setMessage(null)
    onChange((d) => ({ ...d, allocations: moveAllocation(d.allocations, allocationId, target, ctx) ?? d.allocations }))
  }

  const updateSegmentDrag = (next: SegmentDrag | null) => {
    segmentDragRef.current = next
    setSegmentDrag(next)
  }

  const segmentDragHandlers = (allocationId: string) => ({
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      suppressClickRef.current = false
      updateSegmentDrag({ allocationId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false })
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      const d = segmentDragRef.current
      if (!d) return
      const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5
      if (active) updateSegmentDrag({ ...d, x: e.clientX, y: e.clientY, active })
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      const d = segmentDragRef.current
      if (!d) return
      updateSegmentDrag(null)
      if (!d.active) return
      suppressClickRef.current = true
      const target = dropTargetAt(e.clientX, e.clientY, layout.blocks, d.allocationId)
      if (target) moveTo(d.allocationId, { blockId: target.block.id, beforeId: target.beforeId }, target.block)
    },
    onPointerCancel: () => updateSegmentDrag(null),
  })

  // ---------- Rand eines Segments ziehen ----------

  const commitResize = (allocationId: string, value: Minutes, maxMinutes: Minutes) => {
    setMessage(null)
    onChange((d) => ({ ...d, allocations: resizeSegment(d.allocations, allocationId, value, maxMinutes) }))
  }

  const updateResize = (next: Resize | null) => {
    resizeRef.current = next
    setResize(next)
  }

  const handleProps = (segment: TimelineSegment, block: TimelineBlock) => {
    const allocation = allocationById.get(segment.allocationId!)!
    const max = maxSegmentMinutes(block, allocation)
    return {
      role: 'slider',
      tabIndex: 0,
      'aria-label': `Dauer ${segmentName(allocation)}`,
      'aria-valuemin': MIN_SEGMENT_MINUTES,
      'aria-valuemax': max,
      'aria-valuenow': allocation.value,
      'aria-valuetext': formatDuration(allocation.value),
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        const frame = e.currentTarget.closest<HTMLElement>('[data-block-id]')!
        updateResize({
          allocationId: allocation.id,
          maxMinutes: max,
          startX: e.clientX,
          startValue: allocation.value,
          pxPerMinute: frame.getBoundingClientRect().width / block.displayMinutes,
          value: allocation.value,
          committed: false,
        })
      },
      onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
        const r = resizeRef.current
        if (!r || r.committed) return
        const value = snapMinutes(r.startValue + (e.clientX - r.startX) / r.pxPerMinute)
        if (value !== r.value) updateResize({ ...r, value })
      },
      onPointerUp: () => {
        const r = resizeRef.current
        if (!r || r.committed) return
        if (r.value === r.startValue) {
          updateResize(null)
          return
        }
        updateResize({ ...r, committed: true })
        commitResize(r.allocationId, r.value, r.maxMinutes)
      },
      onPointerCancel: () => updateResize(null),
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 1 : SNAP_MINUTES
        const delta = ({ ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step } as Record<string, number>)[e.key]
        if (delta === undefined) return
        e.preventDefault()
        commitResize(allocation.id, allocation.value + delta, max)
      },
    }
  }

  const selected = selectedId ? allocationById.get(selectedId) : undefined
  const selectedLocked = !!selected && selected.mode !== 'timeline' && selected.mode !== 'blockRest'
  const selectedBlock = selected && layout.blocks.find((b) => b.id === shownResult.blockOf[selected.id])
  // Modus ändern: Zeile bleibt in ihrem Block an ihrem Platz.
  const setMode = (allocation: Allocation, mode: Allocation['mode']) => {
    const minutes = shownResult.minutes[allocation.id] ?? null
    const blockId = shownResult.blockOf[allocation.id]
    onChange((d) => ({
      ...d,
      allocations: d.allocations.map((a) =>
        a.id === allocation.id ? { ...changeAllocationMode(a, mode, minutes, shownResult.total), ...(blockId ? { blockId } : {}) } : a,
      ),
    }))
  }
  const dragProject = chipDrag?.active ? projectById.get(chipDrag.projectId) : undefined
  const draggedSegment = segmentDrag?.active ? allocationById.get(segmentDrag.allocationId) : undefined
  // Einfügemarke beim Ziehen (Chip oder Segment)
  const drop = draggedSegment
    ? dropTargetAt(segmentDrag!.x, segmentDrag!.y, layout.blocks, draggedSegment.id)
    : chipDrag?.active
      ? dropTargetAt(chipDrag.x, chipDrag.y, layout.blocks, null)
      : null

  return (
    <section className="card" data-testid="timeline">
      <header className="card__head">
        <h2>Zeitleiste</h2>
        <span className="muted small">
          Projekt in einen Block ziehen · Segment ziehen zum Verschieben · rechten Rand ziehen zum Anpassen
        </span>
      </header>

      <div className="timeline__palette">
        {byRecency.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip timeline__chip"
            title="In einen Block ziehen (Klick: in den ersten freien Block)"
            data-testid={`timeline-chip-${p.name}`}
            {...chipHandlers(p.id)}
          >
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <div className={`timeline${resize && !resize.committed ? ' is-resizing' : ''}${draggedSegment ? ' is-moving' : ''}`}>
        <div className="timeline__labels">
          {layout.blocks.map((b) => (
            <span key={b.id} style={{ left: `${b.left}%`, width: `${b.width}%` }}>
              {b.label}
              {layout.mode === 'clock' && <span className="muted"> · {formatDuration(b.minutes)}</span>}
              {b.planned && <span className="muted"> · geplant</span>}
            </span>
          ))}
        </div>
        <div className="timeline__track">
          {layout.breaks.map((b) => (
            <div
              key={`pause-${b.start}`}
              className="timeline__break"
              style={{ left: `${b.left}%`, width: `${b.width}%` }}
              title={`Pause ${formatDuration(b.end - b.start)}`}
            />
          ))}
          {layout.blocks.map((block) => (
            <div
              key={block.id}
              role="group"
              aria-label={`Block ${block.label}`}
              data-block-id={block.id}
              data-testid={`timeline-block-${block.index}`}
              className={[
                'timeline__block',
                (chipDrag?.overBlock === block.id || (draggedSegment && drop?.block.id === block.id)) && 'is-over',
                block.running && 'is-running',
                block.planned && 'is-planned',
                block.fixedMinutes > block.minutes && 'is-overfull',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${block.left}%`, width: `${block.width}%` }}
            >
              {block.segments.map((s) => {
                if (s.kind === 'future') {
                  // Noch nicht vergangen: grau bis zum voraussichtlichen Gehen, davor die Jetzt-Linie
                  return (
                    <div
                      key="future"
                      className="timeline__segment is-future"
                      style={{ left: `${s.left}%`, width: `${s.width}%` }}
                      title={`noch ${formatDuration(s.minutes)} bis voraussichtlich ${minutesToClock(s.end)}`}
                      data-testid="timeline-future"
                    >
                      <span>
                        noch {formatDuration(s.minutes)} · bis {minutesToClock(s.end)}
                      </span>
                      <div className="timeline__now" aria-hidden="true" />
                    </div>
                  )
                }
                const allocation = s.allocationId ? allocationById.get(s.allocationId) : undefined
                const color = allocation ? projectById.get(allocation.projectId)?.color : undefined
                const name = segmentName(allocation)
                const movable = s.kind === 'bound' || s.kind === 'blockRest'
                return (
                  <div
                    key={`${s.allocationId ?? 'offen'}-${s.start}`}
                    className={[
                      'timeline__segment',
                      `is-${s.kind}`,
                      s.overflow && 'is-overflow',
                      s.allocationId === selectedId && 'is-selected',
                      draggedSegment && s.allocationId === draggedSegment.id && 'is-dragged',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ left: `${s.left}%`, width: `${s.width}%`, background: s.kind === 'open' ? undefined : color }}
                    title={`${name} ${formatDuration(s.minutes)}${SEGMENT_HINT[s.kind]}`}
                    data-testid={movable ? `segment-${name}` : s.kind === 'open' ? undefined : `${s.kind === 'spill' ? 'spill' : 'locked'}-${name}`}
                    {...(movable ? segmentDragHandlers(s.allocationId!) : {})}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false
                        return
                      }
                      if (s.allocationId) setSelectedId(s.allocationId)
                    }}
                  >
                    <span>
                      {name} {formatDuration(s.minutes)}
                    </span>
                    {s.kind === 'bound' && <div className="timeline__handle" {...handleProps(s, block)} />}
                  </div>
                )
              })}
              {drop?.block.id === block.id && (
                <div className="timeline__marker" style={{ left: `${drop.markerLeft}%` }} data-testid="drop-marker" />
              )}
            </div>
          ))}
        </div>
      </div>

      {message && <p className="timeline__message">{message}</p>}

      {selected && selectedBlock && (
        <SegmentPanel
          allocation={selected}
          block={selectedBlock}
          locked={selectedLocked}
          blockRest={selected.mode === 'blockRest'}
          minutes={selected.mode === 'timeline' ? selected.value : (shownResult.minutes[selected.id] ?? 0)}
          maxMinutes={maxSegmentMinutes(selectedBlock, selected)}
          projectName={projectById.get(selected.projectId)?.name ?? '?'}
          color={projectById.get(selected.projectId)?.color}
          activityTypes={activityTypes.filter((a) => a.active || a.id === selected.activityTypeId)}
          onActivity={(activityTypeId) =>
            onChange((d) => ({
              ...d,
              allocations: d.allocations.map((a) => (a.id === selected.id ? { ...a, activityTypeId } : a)),
            }))
          }
          onDuration={(minutes) => {
            const max = maxSegmentMinutes(selectedBlock, selected)
            const clamped = resizeSegment(day.allocations, selected.id, minutes, max).find((a) => a.id === selected.id)!.value
            commitResize(selected.id, minutes, max)
            return clamped
          }}
          onAttach={() => setMode(selected, 'timeline')}
          onToggleBlockRest={() => setMode(selected, selected.mode === 'blockRest' ? 'timeline' : 'blockRest')}
          onNote={(note) =>
            onChange((d) => ({ ...d, allocations: d.allocations.map((a) => (a.id === selected.id ? { ...a, note } : a)) }))
          }
          onRemove={() => {
            onChange((d) => ({ ...d, allocations: d.allocations.filter((a) => a.id !== selected.id) }))
            setSelectedId(null)
          }}
          onClose={() => setSelectedId(null)}
        />
      )}

      {dragProject && (
        <div className="drag-ghost" style={{ left: chipDrag!.x, top: chipDrag!.y }} aria-hidden="true">
          <span className="dot" style={{ background: dragProject.color }} />
          {dragProject.name}
        </div>
      )}
      {draggedSegment && (
        <div className="drag-ghost" style={{ left: segmentDrag!.x, top: segmentDrag!.y }} aria-hidden="true">
          <span className="dot" style={{ background: projectById.get(draggedSegment.projectId)?.color }} />
          {segmentName(draggedSegment)}
        </div>
      )}
    </section>
  )
}

const SEGMENT_HINT: Record<TimelineSegment['kind'], string> = {
  bound: ' – ziehen zum Verschieben',
  blockRest: ' – Rest im Block, wächst und schrumpft mit',
  floating: ' – in der Liste fest eingestellt (gesperrt)',
  spill: ' – Teil des Tages-Rests (gesperrt)',
  open: '',
  future: ' – noch nicht vergangen (bis voraussichtlich Gehen)',
}

const MODE_TEXT: Record<Allocation['mode'], string> = {
  duration: 'feste Dauer (h:mm)',
  timeline: 'Zeitleiste',
  percent: 'Prozent des Tages',
  rest: 'Rest des Tages',
  blockRest: 'Rest im Block',
}

function SegmentPanel({
  allocation,
  block,
  locked,
  blockRest,
  minutes,
  maxMinutes,
  projectName,
  color,
  activityTypes,
  onActivity,
  onDuration,
  onAttach,
  onToggleBlockRest,
  onNote,
  onRemove,
  onClose,
}: {
  allocation: Allocation
  block: TimelineBlock
  /** Zeile ist unten fest eingestellt (h:mm, %, Rest) → hier nur Anzeige. */
  locked: boolean
  /** Zeile ist „Rest im Block“ → Dauer ergibt sich, hier nur Anzeige. */
  blockRest: boolean
  minutes: Minutes
  maxMinutes: Minutes
  projectName: string
  color: string | undefined
  activityTypes: ActivityType[]
  onActivity: (activityTypeId: string) => void
  /** Neue Dauer setzen; gibt die tatsächlich gesetzte (ggf. begrenzte) Dauer zurück. */
  onDuration: (minutes: Minutes) => Minutes
  onAttach: () => void
  onToggleBlockRest: () => void
  onNote: (note: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  return (
    <div className={`timeline-panel${locked ? ' is-locked' : ''}`} data-testid="segment-panel">
      <div className="timeline-panel__row">
        <span className="dot" style={{ background: color ?? 'transparent' }} />
        <strong>{projectName}</strong>
        <span className="muted small">{block.label}</span>
        {locked ? (
          <span className="badge badge--muted">gesperrt · {MODE_TEXT[allocation.mode]}</span>
        ) : blockRest ? (
          <span className="timeline-panel__duration">
            <span className="muted small">Dauer</span>
            <strong className="num" data-testid="panel-blockrest">
              {formatDuration(minutes)}
            </strong>
            <span className="muted small">Rest von {block.label}</span>
          </span>
        ) : (
          <label className="timeline-panel__duration">
            <span className="muted small">Dauer</span>
            <CommitInput
              className="input input--amount"
              aria-label="Dauer im Block"
              value={formatDuration(minutes)}
              onCommit={(text) => {
                const parsed = parseDuration(text)
                if (parsed === null) return null
                return formatDuration(onDuration(parsed))
              }}
            />
            <span className="muted small">max. {formatDuration(maxMinutes)}</span>
          </label>
        )}
        <button type="button" className="icon-btn icon-btn--subtle timeline-panel__close" aria-label="Schließen" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <div className="timeline-panel__row">
        {locked ? (
          <>
            <span className="muted small">
              {formatDuration(minutes)} – unten in der Liste fest eingestellt, hier gesperrt.
            </span>
            <button type="button" className="btn btn--small btn--primary" onClick={onAttach}>
              Auf Zeitleiste übernehmen
            </button>
          </>
        ) : activityTypes.length <= 3 ? (
          <Segmented
            size="small"
            ariaLabel="Tätigkeitsart"
            options={activityTypes.map((a) => ({ value: a.id, label: a.name }))}
            value={allocation.activityTypeId}
            onChange={onActivity}
          />
        ) : (
          <select
            className="input"
            aria-label="Tätigkeitsart"
            value={allocation.activityTypeId}
            onChange={(e) => onActivity(e.target.value)}
          >
            {activityTypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        {!locked && (
          <button
            type="button"
            className={`btn btn--small${blockRest ? ' btn--primary' : ''}`}
            aria-pressed={blockRest}
            title={blockRest ? 'Wieder feste Dauer (aktueller Wert)' : 'Bekommt die restliche Zeit dieses Blocks'}
            onClick={onToggleBlockRest}
          >
            Rest im Block
          </button>
        )}
        <button type="button" className="btn btn--small btn--ghost" onClick={onRemove}>
          <Icon name="trash" /> Entfernen
        </button>
      </div>
      <div className="timeline-panel__row timeline-panel__note">
        <NoteInput value={allocation.note} onCommit={onNote} />
      </div>
    </div>
  )
}
