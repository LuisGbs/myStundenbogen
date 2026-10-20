import { analyzeBlocks, type BlockIssue } from '../../domain/dayTotal'
import { clockToMinutes, formatDuration, formatSignedDuration, minutesToClock, nowClock, parseDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import { clockIn as clockInDay, confirmPlan, editBlock, hasPlannedBlocks } from '../../domain/plan'
import type { Day, ISODate, Minutes, TimeBlock, TimeMode } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput, TimeInput } from '../../components/inputs'
import { Segmented } from '../../components/Segmented'
import { href } from '../../lib/router'

/** Soll und Überstunden rund um diesen Tag. */
export interface DayBalance {
  target: Minutes
  /** Ist − Soll dieses Tages. */
  dayDiff: Minutes
  /** Ist für diesen Tag schon etwas erfasst (sonst zählt er mit 0 h)? */
  recorded: boolean
  /** Saldo nach diesem Tag; null für Tage in der Zukunft oder vor dem Startdatum. */
  after: Minutes | null
  /** Vergangene Arbeitstage ohne Eintrag (vor diesem Tag). */
  missingDays: ISODate[]
}

interface Props {
  day: Day
  isToday: boolean
  nowMinutes: Minutes | null
  worked: Minutes | null
  balance: DayBalance
  onChange: (fn: (day: Day) => Day) => void
}

const MODES = [
  { value: 'blocks' as const, label: 'Stempelzeiten', title: 'Kommen/Gehen, Pausen sind die Lücken' },
  { value: 'total' as const, label: 'Gesamtzeit', title: 'Arbeitszeit direkt eintragen' },
]

export function TimeSection({ day, isToday, nowMinutes, worked, balance, onChange }: Props) {
  const setMode = (mode: TimeMode) =>
    onChange((d) => ({
      ...d,
      timeMode: mode,
      // Beim Wechsel auf Gesamtzeit die bisher gestempelte Zeit übernehmen.
      totalMinutes: mode === 'total' && d.totalMinutes === null && worked ? worked : d.totalMinutes,
    }))

  return (
    <section className="card">
      <header className="card__head">
        <h2>Arbeitszeit</h2>
        <Segmented options={MODES} value={day.timeMode} onChange={setMode} ariaLabel="Art der Zeiterfassung" />
      </header>

      {day.timeMode === 'blocks' ? (
        <BlocksEditor day={day} isToday={isToday} nowMinutes={nowMinutes} onChange={onChange} />
      ) : (
        <TotalEditor day={day} onChange={onChange} />
      )}

      <BalanceLine balance={balance} />

      <div className="worked-total">
        <span>{day.timeMode === 'blocks' && hasPlannedBlocks(day) ? 'Gearbeitet (inkl. geplant)' : 'Gearbeitet'}</span>
        <strong className="num" data-testid="worked-total">
          {worked === null ? '–' : formatDuration(worked)}
        </strong>
      </div>
    </section>
  )
}

function BlocksEditor({ day, isToday, nowMinutes, onChange }: Omit<Props, 'worked' | 'balance'>) {
  const analysis = analyzeBlocks(day.blocks, nowMinutes)
  const running = day.blocks.find((b) => b.end === null)
  const isRunning = (b: TimeBlock) => b.end === null && analysis.running

  const setBlocks = (fn: (blocks: TimeBlock[]) => TimeBlock[]) => onChange((d) => ({ ...d, blocks: fn(d.blocks) }))
  // Jede geänderte Uhrzeit macht einen geplanten Block zum echten Stempel.
  const updateBlock = (id: string, patch: Partial<Pick<TimeBlock, 'start' | 'end'>>) =>
    setBlocks((blocks) => blocks.map((b) => (b.id === id ? editBlock(b, patch) : b)))
  const removeBlock = (id: string) => setBlocks((blocks) => blocks.filter((b) => b.id !== id))

  const addBlock = () =>
    setBlocks((blocks) => {
      // Neuer Block beginnt standardmäßig eine halbe Stunde nach dem letzten Ende.
      const lastEnd = blocks.at(-1)?.end
      const start = lastEnd ? minutesToClock(Math.min(clockToMinutes(lastEnd) + 30, 23 * 60 + 59)) : '08:00'
      return [...blocks, { id: newId(), start, end: null }]
    })
  const clockIn = () => onChange((d) => clockInDay(d, newId()))
  const planned = hasPlannedBlocks(day)
  const clockOut = () => running && updateBlock(running.id, { end: nowClock() })

  return (
    <div className="blocks">
      {planned && (
        <div className="plan-note" data-testid="plan-note">
          <span>
            <strong>Geplant</strong> – Vorlage „normaler Arbeitstag“, noch nicht gestempelt. Grau = nicht final; trag
            die echten Zeiten nach oder übernimm den Plan.
          </span>
          <button type="button" className="btn btn--small" onClick={() => onChange(confirmPlan)}>
            <Icon name="check" /> Plan übernehmen
          </button>
        </div>
      )}
      {day.blocks.length === 0 && (
        <p className="muted">Noch keine Stempelzeiten. {isToday ? 'Stempel ein oder trag die Zeiten nach.' : ''}</p>
      )}
      {day.blocks.map((block, i) => {
        const issues = analysis.issues.filter((issue) => issueConcerns(issue, block.id))
        return (
          <div
            key={block.id}
            className={`block-row${issues.length ? ' has-issue' : ''}${block.planned ? ' is-planned' : ''}`}
            data-testid={block.planned ? 'planned-block' : 'block'}
          >
            <TimeInput
              className="input input--time"
              aria-label={`Block ${i + 1} Beginn`}
              value={block.start}
              onCommit={(start) => updateBlock(block.id, { start })}
            />
            <span className="block-row__dash">–</span>
            <TimeInput
              className="input input--time"
              aria-label={`Block ${i + 1} Ende`}
              value={block.end ?? ''}
              onCommit={(end) => updateBlock(block.id, { end })}
            />
            <span className={`block-row__duration num${isRunning(block) ? ' is-running' : ''}`}>
              {analysis.perBlock[i] === null ? '–' : formatDuration(analysis.perBlock[i]!)}
              {isRunning(block) && <span className="badge badge--live">läuft</span>}
              {block.planned && <span className="badge badge--muted">geplant</span>}
            </span>
            <button
              type="button"
              className="icon-btn icon-btn--subtle"
              aria-label={`Block ${i + 1} entfernen`}
              title="Block entfernen"
              onClick={() => removeBlock(block.id)}
            >
              <Icon name="x" />
            </button>
            {issues.length > 0 && <span className="block-row__issue">{issues.map(issueText).join(' · ')}</span>}
          </div>
        )
      })}

      <div className="blocks__actions">
        {isToday &&
          (running ? (
            <button type="button" className="btn btn--primary" onClick={clockOut}>
              <Icon name="stop" /> Gehen (jetzt)
            </button>
          ) : (
            <button type="button" className="btn btn--primary" onClick={clockIn}>
              <Icon name="play" /> Kommen (jetzt)
            </button>
          ))}
        <button type="button" className="btn" onClick={addBlock}>
          <Icon name="plus" /> Block
        </button>
      </div>
    </div>
  )
}

function issueConcerns(issue: BlockIssue, blockId: string): boolean {
  return issue.kind === 'overlap' ? issue.blockIds[1] === blockId : issue.blockId === blockId
}

function issueText(issue: BlockIssue): string {
  switch (issue.kind) {
    case 'end-before-start':
      return 'Ende liegt vor dem Beginn'
    case 'overlap':
      return 'Überschneidet sich mit dem vorherigen Block'
    case 'open':
      return 'Ende fehlt noch'
  }
}

function TotalEditor({ day, onChange }: Pick<Props, 'day' | 'onChange'>) {
  return (
    <div className="total-editor">
      <label className="field">
        <span className="field__label">Gesamte Arbeitszeit</span>
        <CommitInput
          className="input input--duration"
          placeholder="z.B. 8:18"
          aria-label="Gesamte Arbeitszeit"
          value={day.totalMinutes === null ? '' : formatDuration(day.totalMinutes)}
          onCommit={(text) => {
            if (text.trim() === '') {
              onChange((d) => ({ ...d, totalMinutes: null }))
              return ''
            }
            const minutes = parseDuration(text)
            if (minutes === null) return null
            onChange((d) => ({ ...d, totalMinutes: minutes }))
            return formatDuration(minutes)
          }}
        />
      </label>
      <p className="muted small">Formate: 8:18 · 8,3 · 8h18 · 498m</p>
    </div>
  )
}

function BalanceLine({ balance }: { balance: DayBalance }) {
  const { target, dayDiff, recorded, after, missingDays } = balance
  return (
    <div className="balance-line" data-testid="balance-line">
      <span>
        Soll <strong className="num">{formatDuration(target)}</strong>
      </span>
      <span className={dayDiff < 0 ? 'is-minus' : dayDiff > 0 ? 'is-plus' : undefined}>
        Tag <strong className="num" data-testid="day-diff">{formatSignedDuration(dayDiff)}</strong>
        {!recorded && target > 0 && <span className="muted"> (noch nichts erfasst)</span>}
      </span>
      {after !== null && (
        <span className={after < 0 ? 'is-minus' : after > 0 ? 'is-plus' : undefined}>
          Überstunden-Saldo <strong className="num" data-testid="balance-after">{formatSignedDuration(after)}</strong>
        </span>
      )}
      {missingDays.length > 0 && (
        <a className="balance-line__missing" href={href.day(missingDays[0])}>
          {missingDays.length === 1 ? '1 Arbeitstag' : `${missingDays.length} Arbeitstage`} ohne Eintrag (zählen mit 0 h)
        </a>
      )}
    </div>
  )
}
