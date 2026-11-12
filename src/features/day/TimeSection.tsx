import { formatDateShort } from '../../domain/date'
import { analyzeBlocks, type BlockIssue } from '../../domain/dayTotal'
import { clockToMinutes, formatDuration, formatSignedDuration, minutesToClock, nowClock, parseDuration } from '../../domain/duration'
import { newId } from '../../domain/id'
import { clockIn as clockInDay, confirmPlan, editBlock, hasPlannedBlocks } from '../../domain/plan'
import { MIN_BREAK_MINUTES, type EndTimes } from '../../domain/endTimes'
import { runningRest, type ExpectedEnd } from '../../domain/forecast'
import type { WeekDayBar, WeekSummary } from '../../domain/target'
import type { Day, Minutes, TimeBlock, TimeMode } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput, TimeInput } from '../../components/inputs'
import { Segmented } from '../../components/Segmented'

/** Soll und Überstunden dieses Tages und seiner Woche (bewusst kein Gesamtsaldo). */
export interface DayBalance {
  target: Minutes
  /** Ist − Soll dieses Tages. */
  dayDiff: Minutes
  /** Ist für diesen Tag schon etwas erfasst? */
  recorded: boolean
  /** Woche Mo–So: gearbeitet, Soll, Höchstarbeitszeit. */
  week: WeekSummary
  /** Wochenbalken Tag für Tag: gestempelt (blau) und geplant (hellgrau). */
  weekBars: WeekDayBar[]
  /** Eingestempelt: so sähe es aus, wenn man wie vorgesehen geht. */
  forecast: {
    expected: ExpectedEnd
    worked: Minutes
    dayDiff: Minutes
    week: WeekSummary
  } | null
  /** Nur heute: bis wann für Soll bzw. Ziel arbeiten. */
  endTimes: EndTimes | null
  /** Tagesziel mit Überstunden (Arbeitszeit der Vorlage, z.B. 9:00). */
  goal: Minutes
}

interface Props {
  day: Day
  isToday: boolean
  nowMinutes: Minutes | null
  /** Gestempelte Zeit (ohne geplante Blöcke); null = noch nichts gestempelt */
  worked: Minutes | null
  /** Noch geplante Zeit (graue Vorlage-Blöcke) – nur als Hinweis */
  planned: Minutes
  balance: DayBalance
  onChange: (fn: (day: Day) => Day) => void
}

const MODES = [
  { value: 'blocks' as const, label: 'Stempelzeiten', title: 'Kommen/Gehen, Pausen sind die Lücken' },
  { value: 'total' as const, label: 'Gesamtzeit', title: 'Arbeitszeit direkt eintragen' },
]

export function TimeSection({ day, isToday, nowMinutes, worked, planned, balance, onChange }: Props) {
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
        <BlocksEditor
          day={day}
          isToday={isToday}
          nowMinutes={nowMinutes}
          expected={balance.forecast?.expected ?? null}
          onChange={onChange}
        />
      ) : (
        <TotalEditor day={day} onChange={onChange} />
      )}

      <BalanceLine balance={balance} />
      {balance.endTimes && (
        <EndTimesView
          ends={balance.endTimes}
          target={balance.target}
          goal={balance.goal}
          forecast={balance.forecast}
          onPlan={(blockId, value) =>
            // „Geplant“ (voraussichtlich gehen): null = zurück auf die Vorlage
            onChange((d) => ({
              ...d,
              blocks: d.blocks.map((b) => {
                if (b.id !== blockId) return b
                const { expectedEnd: _old, ...rest } = b
                return value ? { ...rest, expectedEnd: value } : rest
              }),
            }))
          }
        />
      )}

      <div className="worked-total">
        {planned > 0 && (
          <span className="muted small" data-testid="planned-total" title="Graue Blöcke aus der Vorlage – zählen erst, wenn gestempelt">
            + {formatDuration(planned)} geplant
          </span>
        )}
        <span>Gearbeitet</span>
        <strong className="num" data-testid="worked-total">
          {worked === null ? '–' : formatDuration(worked)}
        </strong>
      </div>
    </section>
  )
}

function BlocksEditor({
  day,
  isToday,
  nowMinutes,
  expected,
  onChange,
}: Omit<Props, 'worked' | 'planned' | 'balance'> & { expected: ExpectedEnd | null }) {
  // laufender Block: Rest bis „voraussichtlich gehen“ als grauer Hinweis
  const rest = runningRest(expected, nowMinutes)
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
            {(() => {
              const endInput = (className: string) => (
                <TimeInput
                  className={className}
                  aria-label={`Block ${i + 1} Ende`}
                  value={block.end ?? ''}
                  onCommit={(end) => updateBlock(block.id, { end })}
                />
              )
              // Laufender Block: voraussichtliches Ende hellgrau im leeren Feld (wie geplante Zeiten)
              const ghost =
                isRunning(block) && expected?.blockId === block.id && rest > 0 ? minutesToClock(expected.end) : null
              return ghost ? (
                <span className="block-row__ghost" data-ghost={ghost} data-testid="running-end-ghost">
                  {endInput('input input--time is-ghost')}
                </span>
              ) : (
                endInput('input input--time')
              )
            })()}
            <span className={`block-row__duration num${isRunning(block) ? ' is-running' : ''}`}>
              {analysis.perBlock[i] === null ? '–' : formatDuration(analysis.perBlock[i]!)}
              {isRunning(block) && <span className="badge badge--live">läuft</span>}
              {isRunning(block) && expected?.blockId === block.id && rest > 0 && (
                <span className="block-row__planned" data-testid="running-planned">
                  + {formatDuration(rest)} geplant bis {minutesToClock(expected.end)}
                </span>
              )}
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
  const { target, dayDiff, recorded } = balance
  return (
    <div className="balance-line" data-testid="balance-line">
      <span>
        Soll <strong className="num">{formatDuration(target)}</strong>
      </span>
      <span className={dayDiff < 0 ? 'is-minus' : dayDiff > 0 ? 'is-plus' : undefined}>
        Tag <strong className="num" data-testid="day-diff">{formatSignedDuration(dayDiff)}</strong>
        {!recorded && target > 0 && <span className="muted"> (noch nichts erfasst)</span>}
      </span>
      <WeekLine week={balance.week} bars={balance.weekBars} />
    </div>
  )
}

/**
 * Die eine „Gehen“-Zeile: bis wann für Soll und Ziel arbeiten (inkl. vorgeschriebener
 * Pause) und – eingestempelt – „Geplant“ (voraussichtlich gehen) mit dem Tageswert.
 */
function EndTimesView({
  ends,
  target,
  goal,
  forecast,
  onPlan,
}: {
  ends: EndTimes
  target: Minutes
  goal: Minutes
  forecast: DayBalance['forecast']
  onPlan: (blockId: string, value: string | null) => void
}) {
  const runningBlockId = forecast?.expected.blockId ?? null
  const goals = [
    { key: 'soll', label: 'Soll', minutes: target },
    { key: 'ziel', label: 'Ziel', minutes: goal },
  ].filter((g, i, all) => g.minutes > 0 && (i === 0 || g.minutes !== all[0].minutes))
  if (goals.length === 0) return null

  let note: string
  if (ends.state === 'break' && !ends.breakDone) note = `Pause läuft – weiter frühestens um ${minutesToClock(ends.resume)}`
  else if (ends.state === 'break') note = 'wenn du jetzt wieder kommst · Pause ✓'
  else if (ends.state === 'not-started') note = `wenn du jetzt kommst · inkl. ${MIN_BREAK_MINUTES} min Pause`
  else if (ends.breakAdded > 0) note = `inkl. ${MIN_BREAK_MINUTES} min Pause (noch nicht genommen)`
  else note = 'Pause ✓'

  return (
    <div className="end-times" data-testid="end-times">
      <span className="end-times__title">Gehen</span>
      {goals.map((g) => {
        const at = ends.at(g.minutes)
        const text = at === null ? '✓ erreicht' : at >= 24 * 60 ? '–' : minutesToClock(at)
        const content = (
          <>
            <span className="end-times__label">
              {g.label} {formatDuration(g.minutes)}
            </span>
            <strong className="num" data-testid={`end-${g.key}`}>
              {text}
            </strong>
          </>
        )
        return runningBlockId && at !== null && at < 24 * 60 ? (
          <button
            key={g.key}
            type="button"
            className="end-times__tile"
            title="Als „Geplant“ übernehmen"
            onClick={() => onPlan(runningBlockId, minutesToClock(at))}
          >
            {content}
          </button>
        ) : (
          <span key={g.key} className={`end-times__tile${at === null ? ' is-done' : ''}`}>
            {content}
          </span>
        )
      })}
      {forecast && (
        <span className="end-times__plan">
          <span className="end-times__label">Geplant</span>
          <TimeInput
            className="input input--time"
            aria-label="Voraussichtlich gehen um"
            title="Wann gehst du voraussichtlich? (z.B. passend zum Zug)"
            value={forecast.expected.planned === null ? '' : minutesToClock(forecast.expected.planned)}
            onCommit={(value) => onPlan(forecast.expected.blockId, value)}
          />
          {forecast.expected.custom && (
            <button
              type="button"
              className="icon-btn icon-btn--subtle"
              aria-label="Voraussichtliches Gehen zurücksetzen"
              title="Zurück auf die Vorlage"
              onClick={() => onPlan(forecast.expected.blockId, null)}
            >
              <Icon name="undo" />
            </button>
          )}
          {forecast.expected.isPast ? (
            <span className="muted small">(vorbei)</span>
          ) : (
            <span className="small" data-testid="forecast-line">
              → <strong className="num" data-testid="forecast-worked">{formatDuration(forecast.worked)}</strong> (
              <strong
                className={`num ${forecast.dayDiff < 0 ? 'is-minus' : forecast.dayDiff > 0 ? 'is-plus' : ''}`}
                data-testid="forecast-diff"
              >
                {formatSignedDuration(forecast.dayDiff)}
              </strong>
              ){forecast.week.toMax < 0 && <span className="is-minus"> · Woche über {formatDuration(forecast.week.max)} h!</span>}
            </span>
          )}
        </span>
      )}
      <span className="muted small" data-testid="end-note">
        {note}
      </span>
    </div>
  )
}

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

/**
 * Wochenbalken Tag für Tag: Gestempeltes in Blau (Tage abwechselnd heller/dunkler),
 * noch Geplantes (Rest von heute, kommende Tage) in Hellgrau. Skala bis zur
 * Höchstarbeitszeit, Striche bei Soll und Max.
 */
function WeekLine({ week, bars }: { week: WeekSummary; bars: WeekDayBar[] }) {
  const plannedTotal = bars.reduce((sum, b) => sum + b.planned, 0)
  const forecast = week.worked + plannedTotal
  const scale = Math.max(week.max, forecast, week.target, 1)
  const share = (m: Minutes) => Math.min(100, (m / scale) * 100)
  const pct = (m: Minutes) => `${share(m)}%`
  // Stücke in Reihenfolge: je Tag erst gestempelt, dann geplant
  const pieces = bars.flatMap((b, i) => {
    const label = `${WEEKDAY_SHORT[i]} ${formatDateShort(b.date)}`
    return [
      b.stamped > 0 && {
        key: `${b.date}-s`,
        minutes: b.stamped,
        className: `week-line__day${i % 2 ? ' is-alt' : ''}${b.isToday ? ' is-today' : ''}${week.toMax < 0 ? ' is-over' : ''}`,
        title: `${label}: ${formatDuration(b.stamped)} gestempelt`,
        day: WEEKDAY_SHORT[i],
      },
      b.planned > 0 && {
        key: `${b.date}-p`,
        minutes: b.planned,
        className: `week-line__day is-planned${b.isToday ? ' is-today' : ''}`,
        title: `${label}: ${formatDuration(b.planned)} geplant`,
        day: b.stamped > 0 ? '' : WEEKDAY_SHORT[i],
      },
    ].filter((p): p is Exclude<typeof p, false> => !!p)
  })
  return (
    <div className="week-line" data-testid="week-line">
      <div className="week-line__text">
        <span>
          KW {week.weekNumber} ({formatDateShort(week.from)}–{formatDateShort(week.to)}): gearbeitet{' '}
          <strong className="num" data-testid="week-worked">{formatDuration(week.worked)}</strong> h
          {plannedTotal > 0 && (
            <span className="muted" data-testid="week-planned">
              {' '}
              (+ {formatDuration(plannedTotal)} geplant bis So)
            </span>
          )}
        </span>
        <span className={week.toTarget <= 0 ? 'is-plus' : undefined}>
          {week.toTarget > 0 ? (
            <>
              bis Soll {formatDuration(week.target)} noch{' '}
              <strong className="num" data-testid="week-to-target">{formatDuration(week.toTarget)}</strong> h
            </>
          ) : (
            <>
              Soll {formatDuration(week.target)} erreicht{' '}
              <strong className="num" data-testid="week-to-target">{formatSignedDuration(-week.toTarget)}</strong>
            </>
          )}
        </span>
        <span className={week.toMax < 0 ? 'is-minus' : undefined}>
          {week.toMax >= 0 ? (
            <>
              bis max. {formatDuration(week.max)} noch{' '}
              <strong className="num" data-testid="week-to-max">{formatDuration(week.toMax)}</strong> h
            </>
          ) : (
            <>
              Höchstarbeitszeit {formatDuration(week.max)} überschritten um{' '}
              <strong className="num" data-testid="week-to-max">{formatDuration(-week.toMax)}</strong>
            </>
          )}
        </span>
        {week.toMax >= 0 && forecast > week.max && (
          <span className="is-minus small" data-testid="week-plan-over">
            Plan liegt {formatDuration(forecast - week.max)} über der Höchstarbeitszeit
          </span>
        )}
      </div>
      <div className="week-line__bar" data-testid="week-bar">
        {pieces.map((p) => (
          <div
            key={p.key}
            className={p.className}
            style={{ width: pct(p.minutes) }}
            title={p.title}
            data-testid="week-day"
            aria-label={p.title}
          />
        ))}
        <div className="week-line__mark" style={{ left: pct(week.target) }} title={`Soll ${formatDuration(week.target)}`} />
        <div className="week-line__mark is-max" style={{ left: pct(week.max) }} title={`Max. ${formatDuration(week.max)}`} />
      </div>
      <div className="week-line__days" aria-hidden="true">
        {pieces.map((p) => (
          <span key={p.key} style={{ width: pct(p.minutes) }}>
            {share(p.minutes) >= 4 ? p.day : ''}
          </span>
        ))}
        {plannedTotal > 0 && (
          <span
            className="week-line__total"
            data-testid="week-forecast"
            title={`So viele Stunden wären es am Ende der Woche laut Plan (${formatDuration(week.worked)} gestempelt + ${formatDuration(plannedTotal)} geplant)`}
          >
            ≈ {formatDuration(forecast)} h
          </span>
        )}
      </div>
    </div>
  )
}
