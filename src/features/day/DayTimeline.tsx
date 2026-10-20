import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { AllocationResult } from '../../domain/allocation'
import { summarizeDay } from '../../domain/day'
import { formatDuration, parseDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import {
  attachToBlock,
  insertSegment,
  isOnTimeline,
  layoutTimeline,
  maxSegmentMinutes,
  MIN_SEGMENT_MINUTES,
  resizeSegment,
  snapMinutes,
  SNAP_MINUTES,
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

/** Ziehen am rechten Rand eines Segments. */
interface Resize {
  allocationId: string
  blockMinutes: Minutes
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
  return { block, minute: block.start + ((x - rect.left) / rect.width) * block.minutes }
}

export function DayTimeline({ day, result, projects, activityTypes, nowMinutes, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects)
  const [chipDrag, setChipDrag] = useState<ChipDrag | null>(null)
  const chipDragRef = useRef<ChipDrag | null>(null)
  const [resize, setResize] = useState<Resize | null>(null)
  const resizeRef = useRef<Resize | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Block, in dem eine gesperrte Zeile angeklickt wurde (gebundene Zeilen kennen ihren Block selbst). */
  const [lockedBlockId, setLockedBlockId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Während des Ziehens am Rand: Vorschau mit der neuen Dauer (gespeichert wird beim Loslassen).
  const shownDay = resize
    ? { ...day, allocations: resizeSegment(day.allocations, resize.allocationId, resize.value, resize.blockMinutes) }
    : day
  if (resize?.committed) {
    const saved = day.allocations.find((a) => a.id === resize.allocationId)?.value
    const shown = shownDay.allocations.find((a) => a.id === resize.allocationId)?.value
    if (saved === undefined || saved === shown) setResize(null)
  }
  const shownResult = resize ? summarizeDay(shownDay, nowMinutes).allocation : result
  const layout = layoutTimeline(shownDay, shownResult, nowMinutes)
  if (!layout) return null

  const defaultTypeId = (activityTypes.find((a) => a.active) ?? activityTypes[0])?.id ?? ''
  const allocationById = new Map(shownDay.allocations.map((a) => [a.id, a]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const activityById = new Map(activityTypes.map((a) => [a.id, a]))

  const segmentName = (a: Allocation | undefined): string => {
    if (!a) return 'offen'
    const t = activityById.get(a.activityTypeId)
    return `${projectById.get(a.projectId)?.name ?? '?'}${t ? ` · ${t.name}` : ''}`
  }

  // ---------- Projekt in einen Block einfügen ----------

  const addToBlock = (projectId: string, block: TimelineBlock, minute: Minutes) => {
    const base = { id: newId(), projectId, activityTypeId: defaultTypeId, note: '' }
    if (!insertSegment(day.allocations, block, minute, base)) {
      setMessage(`Der Block ${block.label} ist schon voll belegt – zuerst ein Segment kürzen.`)
      return
    }
    setMessage(null)
    setSelectedId(base.id)
    onChange((d) => {
      const next = insertSegment(d.allocations, block, minute, base)
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
        const over = blockAt(e.clientX, e.clientY, layout.blocks)
        if (over) addToBlock(d.projectId, over.block, over.minute)
        return
      }
      // Einfacher Klick: hinten in den ersten Block mit freiem Platz.
      const target = layout.blocks.find((b) => b.minutes - b.boundMinutes >= MIN_SEGMENT_MINUTES) ?? layout.blocks[0]
      addToBlock(d.projectId, target, target.end)
    },
    onPointerCancel: () => updateChipDrag(null),
  })

  // ---------- Rand eines Segments ziehen ----------

  const commitResize = (allocationId: string, value: Minutes, blockMinutes: Minutes) => {
    setMessage(null)
    onChange((d) => ({ ...d, allocations: resizeSegment(d.allocations, allocationId, value, blockMinutes) }))
  }

  const updateResize = (next: Resize | null) => {
    resizeRef.current = next
    setResize(next)
  }

  const handleProps = (segment: TimelineSegment, block: TimelineBlock) => {
    const allocation = allocationById.get(segment.allocationId!)!
    return {
      role: 'slider',
      tabIndex: 0,
      'aria-label': `Dauer ${segmentName(allocation)}`,
      'aria-valuemin': MIN_SEGMENT_MINUTES,
      'aria-valuemax': maxSegmentMinutes(shownDay.allocations, allocation.id, block.minutes),
      'aria-valuenow': allocation.value,
      'aria-valuetext': formatDuration(allocation.value),
      onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        const frame = e.currentTarget.closest<HTMLElement>('[data-block-id]')!
        updateResize({
          allocationId: allocation.id,
          blockMinutes: block.minutes,
          startX: e.clientX,
          startValue: allocation.value,
          pxPerMinute: frame.getBoundingClientRect().width / block.minutes,
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
        commitResize(r.allocationId, r.value, r.blockMinutes)
      },
      onPointerCancel: () => updateResize(null),
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 1 : SNAP_MINUTES
        const delta = ({ ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step } as Record<string, number>)[e.key]
        if (delta === undefined) return
        e.preventDefault()
        commitResize(allocation.id, allocation.value + delta, block.minutes)
      },
    }
  }

  const blockIds = new Set(layout.blocks.map((b) => b.id))
  const selected = selectedId ? allocationById.get(selectedId) : undefined
  const selectedLocked = !!selected && !isOnTimeline(selected, blockIds)
  const selectedBlock = selected && layout.blocks.find((b) => b.id === (selectedLocked ? lockedBlockId : selected.blockId))
  const select = (allocationId: string, block: TimelineBlock, kind: TimelineSegment['kind']) => {
    setSelectedId(allocationId)
    setLockedBlockId(kind === 'floating' ? block.id : null)
  }
  const dragProject = chipDrag?.active ? projectById.get(chipDrag.projectId) : undefined

  return (
    <section className="card" data-testid="timeline">
      <header className="card__head">
        <h2>Zeitleiste</h2>
        <span className="muted small">Projekt in einen Block ziehen · rechten Rand ziehen zum Anpassen</span>
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

      <div className={`timeline${resize && !resize.committed ? ' is-resizing' : ''}`}>
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
                chipDrag?.overBlock === block.id && 'is-over',
                block.running && 'is-running',
                block.planned && 'is-planned',
                block.boundMinutes > block.minutes && 'is-overfull',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${block.left}%`, width: `${block.width}%` }}
            >
              {block.segments.map((s) => {
                const allocation = s.allocationId ? allocationById.get(s.allocationId) : undefined
                const color = allocation ? projectById.get(allocation.projectId)?.color : undefined
                const name = segmentName(allocation)
                return (
                  <div
                    key={`${s.allocationId ?? 'offen'}-${s.start}`}
                    className={[
                      'timeline__segment',
                      `is-${s.kind}`,
                      s.overflow && 'is-overflow',
                      s.allocationId === selectedId && 'is-selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ left: `${s.left}%`, width: `${s.width}%`, background: s.kind === 'open' ? undefined : color }}
                    title={`${name} ${formatDuration(s.minutes)}${s.kind === 'floating' ? ' – in der Liste fest eingestellt (gesperrt)' : ''}`}
                    data-testid={s.kind === 'bound' ? `segment-${name}` : s.kind === 'floating' ? `locked-${name}` : undefined}
                    onClick={() => s.allocationId && select(s.allocationId, block, s.kind)}
                  >
                    <span>
                      {name} {formatDuration(s.minutes)}
                    </span>
                    {s.kind === 'bound' && <div className="timeline__handle" {...handleProps(s, block)} />}
                  </div>
                )
              })}
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
          minutes={selectedLocked ? (shownResult.minutes[selected.id] ?? 0) : selected.value}
          maxMinutes={maxSegmentMinutes(shownDay.allocations, selected.id, selectedBlock.minutes)}
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
            const clamped = resizeSegment(day.allocations, selected.id, minutes, selectedBlock.minutes).find(
              (a) => a.id === selected.id,
            )!.value
            commitResize(selected.id, minutes, selectedBlock.minutes)
            return clamped
          }}
          onAttach={() => {
            const wanted = shownResult.minutes[selected.id] ?? 0
            if (!attachToBlock(day.allocations, selected.id, selectedBlock, wanted)) {
              setMessage(`Der Block ${selectedBlock.label} ist schon voll belegt – zuerst ein Segment kürzen.`)
              return
            }
            setMessage(null)
            onChange((d) => ({ ...d, allocations: attachToBlock(d.allocations, selected.id, selectedBlock, wanted) ?? d.allocations }))
          }}
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
    </section>
  )
}

const MODE_TEXT: Record<Allocation['mode'], string> = {
  duration: 'feste Dauer (h:mm)',
  percent: 'Prozent des Tages',
  rest: 'Rest des Tages',
}

function SegmentPanel({
  allocation,
  block,
  locked,
  minutes,
  maxMinutes,
  projectName,
  color,
  activityTypes,
  onActivity,
  onDuration,
  onAttach,
  onNote,
  onRemove,
  onClose,
}: {
  allocation: Allocation
  block: TimelineBlock
  /** Zeile ist unten fest eingestellt (h:mm, %, Rest) → hier nur Anzeige. */
  locked: boolean
  minutes: Minutes
  maxMinutes: Minutes
  projectName: string
  color: string | undefined
  activityTypes: ActivityType[]
  onActivity: (activityTypeId: string) => void
  /** Neue Dauer setzen; gibt die tatsächlich gesetzte (ggf. begrenzte) Dauer zurück. */
  onDuration: (minutes: Minutes) => Minutes
  onAttach: () => void
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
