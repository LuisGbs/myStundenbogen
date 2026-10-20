import { useRef, useState, type PointerEvent } from 'react'
import type { AllocationResult } from '../../domain/allocation'
import { formatDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import { blockShareMinutes, layoutTimeline, type TimelineLayout } from '../../domain/timeline'
import type { ActivityType, Day, Minutes, Project } from '../../domain/types'
import { Segmented } from '../../components/Segmented'
import { useProjectsByRecency } from './useProjectsByRecency'

interface Props {
  day: Day
  result: AllocationResult
  projects: Project[]
  activityTypes: ActivityType[]
  nowMinutes: Minutes | null
  onChange: (fn: (day: Day) => Day) => void
}

/** Offene Zuordnung: welches Projekt, welcher Block, welcher Anteil. */
interface Draft {
  projectId: string
  blockIndex: number
  activityTypeId: string
  share: number
}

/** Laufendes Ziehen eines Projekt-Chips (Pointer Events → Maus und Touch). */
interface Drag {
  projectId: string
  startX: number
  startY: number
  x: number
  y: number
  active: boolean
  overBlock: number | null
}

const SHARE_PRESETS = [
  { share: 25, label: '¼' },
  { share: 50, label: '½' },
  { share: 75, label: '¾' },
  { share: 100, label: 'Ganz' },
]

function blockAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-block-index]')
  return el ? Number(el.dataset.blockIndex) : null
}

export function DayTimeline({ day, result, projects, activityTypes, nowMinutes, onChange }: Props) {
  const byRecency = useProjectsByRecency(day.date, projects)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)

  const layout = layoutTimeline(day, result, nowMinutes)
  if (!layout) return null

  const activeTypes = activityTypes.filter((a) => a.active)
  const defaultTypeId = (activeTypes[0] ?? activityTypes[0])?.id ?? ''

  const openDraft = (projectId: string | null, blockIndex: number | null) =>
    setDraft((prev) => ({
      projectId: projectId ?? prev?.projectId ?? byRecency[0]?.id ?? '',
      blockIndex: blockIndex ?? prev?.blockIndex ?? layout.blocks[0].index,
      activityTypeId: prev?.activityTypeId ?? defaultTypeId,
      share: prev?.share ?? 50,
    }))

  // Der Zeiger-Zustand steht im Ref (Handler lesen immer den aktuellen Stand),
  // der State nur für die Anzeige (Ghost-Chip, hervorgehobener Block).
  const updateDrag = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }
  const isDragged = (d: Drag, x: number, y: number) => d.active || Math.hypot(x - d.startX, y - d.startY) > 5

  const chipHandlers = (projectId: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      updateDrag({ projectId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false, overBlock: null })
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d) return
      const active = isDragged(d, e.clientX, e.clientY)
      updateDrag({ ...d, x: e.clientX, y: e.clientY, active, overBlock: active ? blockAt(e.clientX, e.clientY) : null })
    },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d) return
      if (!isDragged(d, e.clientX, e.clientY)) {
        openDraft(d.projectId, null) // einfacher Klick: Block im Panel wählen
      } else {
        const over = blockAt(e.clientX, e.clientY)
        if (over !== null) openDraft(d.projectId, over)
      }
      updateDrag(null)
    },
    onPointerCancel: () => updateDrag(null),
  })

  const allocationById = new Map(day.allocations.map((a) => [a.id, a]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const activityById = new Map(activityTypes.map((a) => [a.id, a]))
  const dragProject = drag?.active ? projectById.get(drag.projectId) : undefined

  return (
    <section className="card" data-testid="timeline">
      <header className="card__head">
        <h2>Zeitleiste</h2>
        <span className="muted small">Projekt auf einen Block ziehen – oder Block anklicken</span>
      </header>

      <div className="timeline__palette">
        {byRecency.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip timeline__chip"
            title="Auf einen Block ziehen"
            data-testid={`timeline-chip-${p.name}`}
            {...chipHandlers(p.id)}
          >
            <span className="dot" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      <TimelineBar
        layout={layout}
        overBlock={drag?.overBlock ?? null}
        targetBlock={draft?.blockIndex ?? null}
        onBlockClick={(index) => openDraft(null, index)}
        segmentLabel={(allocationId) => {
          if (allocationId === null) return { name: 'offen', color: null }
          const a = allocationById.get(allocationId)
          const p = a && projectById.get(a.projectId)
          const t = a && activityById.get(a.activityTypeId)
          return { name: `${p?.name ?? '?'}${t ? ` · ${t.name}` : ''}`, color: p?.color ?? null }
        }}
      />

      {draft && (
        <DraftPanel
          draft={draft}
          layout={layout}
          projects={projects.filter((p) => p.active)}
          activityTypes={activeTypes.length ? activeTypes : activityTypes}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onAdd={(minutes) => {
            const { projectId, activityTypeId } = draft
            onChange((d) => ({
              ...d,
              allocations: [
                ...d.allocations,
                { id: newId(), projectId, activityTypeId, mode: 'duration', value: minutes, note: '' },
              ],
            }))
            setDraft(null)
          }}
        />
      )}

      {dragProject && (
        <div className="drag-ghost" style={{ left: drag!.x, top: drag!.y }} aria-hidden="true">
          <span className="dot" style={{ background: dragProject.color }} />
          {dragProject.name}
        </div>
      )}
    </section>
  )
}

function TimelineBar({
  layout,
  overBlock,
  targetBlock,
  onBlockClick,
  segmentLabel,
}: {
  layout: TimelineLayout
  overBlock: number | null
  targetBlock: number | null
  onBlockClick: (index: number) => void
  segmentLabel: (allocationId: string | null) => { name: string; color: string | null }
}) {
  const pos = (s: { left: number; width: number }) => ({ left: `${s.left}%`, width: `${s.width}%` })
  return (
    <div className="timeline">
      <div className="timeline__caption">{layout.mode === 'clock' ? 'Stempelzeiten' : 'Arbeitszeit'}</div>
      <div className="timeline__track timeline__track--blocks">
        {layout.breaks.map((b) => (
          <div
            key={`pause-${b.start}`}
            className="timeline__break"
            style={pos(b)}
            title={`Pause ${formatDuration(b.end - b.start)}`}
          />
        ))}
        {layout.blocks.map((b) => (
          <button
            key={b.index}
            type="button"
            data-block-index={b.index}
            data-testid={`timeline-block-${b.index}`}
            className={[
              'timeline__block',
              overBlock === b.index && 'is-over',
              targetBlock === b.index && 'is-target',
              b.running && 'is-running',
            ]
              .filter(Boolean)
              .join(' ')}
            style={pos(b)}
            aria-label={`${b.label} (${formatDuration(b.minutes)}) – Projekt zuordnen`}
            onClick={() => onBlockClick(b.index)}
          >
            <span className="timeline__block-label">{b.label}</span>
            {layout.mode === 'clock' && <span className="timeline__block-minutes num">{formatDuration(b.minutes)}</span>}
          </button>
        ))}
      </div>
      <div className="timeline__caption">Verteilung auf Projekte</div>
      <div className="timeline__track timeline__track--segments">
        {layout.segments.map((s, i) => {
          const { name, color } = segmentLabel(s.allocationId)
          return (
            <div
              key={i}
              className={`timeline__segment${s.allocationId === null ? ' is-open' : ''}`}
              style={{ ...pos(s), background: color ?? undefined }}
              title={`${name} ${formatDuration(s.minutes)}`}
            >
              <span>
                {name} {formatDuration(s.minutes)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DraftPanel({
  draft,
  layout,
  projects,
  activityTypes,
  onChange,
  onCancel,
  onAdd,
}: {
  draft: Draft
  layout: TimelineLayout
  projects: Project[]
  activityTypes: ActivityType[]
  onChange: (draft: Draft) => void
  onCancel: () => void
  onAdd: (minutes: Minutes) => void
}) {
  const block = layout.blocks.find((b) => b.index === draft.blockIndex) ?? layout.blocks[0]
  const minutes = blockShareMinutes(block.minutes, draft.share)
  const project = projects.find((p) => p.id === draft.projectId)

  return (
    <div className="timeline-draft" data-testid="timeline-draft">
      <div className="timeline-draft__row">
        <span className="dot" style={{ background: project?.color ?? 'transparent' }} />
        <select
          className="input"
          aria-label="Projekt für die Zeitleiste"
          value={draft.projectId}
          onChange={(e) => onChange({ ...draft, projectId: e.target.value })}
        >
          {!project && <option value="">Projekt wählen …</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.code ? ` (${p.code})` : ''}
            </option>
          ))}
        </select>
        {activityTypes.length <= 3 ? (
          <Segmented
            size="small"
            ariaLabel="Tätigkeitsart"
            options={activityTypes.map((a) => ({ value: a.id, label: a.name }))}
            value={draft.activityTypeId}
            onChange={(activityTypeId) => onChange({ ...draft, activityTypeId })}
          />
        ) : (
          <select
            className="input"
            aria-label="Tätigkeitsart"
            value={draft.activityTypeId}
            onChange={(e) => onChange({ ...draft, activityTypeId: e.target.value })}
          >
            {activityTypes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {layout.blocks.length > 1 && (
        <div className="timeline-draft__row">
          <span className="muted small">Block</span>
          <Segmented
            size="small"
            ariaLabel="Block"
            options={layout.blocks.map((b) => ({ value: String(b.index), label: b.label }))}
            value={String(block.index)}
            onChange={(v) => onChange({ ...draft, blockIndex: Number(v) })}
          />
        </div>
      )}

      <div className="timeline-draft__row">
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          step={5}
          aria-label="Anteil am Block"
          value={draft.share}
          onChange={(e) => onChange({ ...draft, share: Number(e.target.value) })}
        />
        <span className="timeline-draft__value num" data-testid="draft-value">
          {draft.share} % = {formatDuration(minutes)}
        </span>
        <span className="timeline-draft__presets">
          {SHARE_PRESETS.map((s) => (
            <button
              key={s.share}
              type="button"
              className={`btn btn--small${draft.share === s.share ? ' is-active' : ''}`}
              onClick={() => onChange({ ...draft, share: s.share })}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>

      <div className="button-row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!project || minutes === 0}
          onClick={() => onAdd(minutes)}
        >
          Hinzufügen ({formatDuration(minutes)})
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
