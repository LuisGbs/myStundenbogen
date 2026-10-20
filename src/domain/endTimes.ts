import { analyzeBlocks } from './dayTotal'
import { clockToMinutes } from './duration'
import type { Day, Minutes, TemplateBlock } from './types'

/** Vorgeschriebene Pause: einmal am Tag mindestens so lange am Stück. */
export const MIN_BREAK_MINUTES = 30

/** Arbeitszeit der Vorlage „normaler Arbeitstag“ (z.B. 9:00) = Tagesziel mit Überstunden. */
export function templateMinutes(template: TemplateBlock[]): Minutes {
  return template.reduce((sum, b) => sum + Math.max(0, clockToMinutes(b.end) - clockToMinutes(b.start)), 0)
}

export interface EndTimes {
  /** heute schon gearbeitet (nur echte Stempel) */
  worked: Minutes
  /**
   * - running:     eingestempelt, Rechnung ab jetzt
   * - break:       in der Pause, Rechnung ab Rückkehr (frühestens nach der Mindestpause)
   * - not-started: noch nicht eingestempelt, Rechnung „wenn du jetzt kommst“
   */
  state: 'running' | 'break' | 'not-started'
  /** Ab wann weitergearbeitet wird (jetzt bzw. frühestmögliche Rückkehr). */
  resume: Minutes
  /** Eine Pause von mindestens 30 min ist schon genommen (oder läuft gerade lang genug). */
  breakDone: boolean
  /** Für die Pause eingerechnete Minuten (0, wenn schon genommen bzw. in `resume` enthalten). */
  breakAdded: Minutes
  /** Uhrzeit (Minuten), zu der `goal` erreicht ist; null = schon erreicht. */
  at: (goal: Minutes) => Minutes | null
}

/**
 * Bis wann muss ich heute arbeiten, um `goal` zu erreichen? Mit genau einer Pause
 * von mindestens 30 min am Tag: Ist noch keine genommen, wird sie eingerechnet;
 * läuft gerade eine Pause, geht es frühestens nach 30 min weiter.
 * null für erledigte Tage (ausgestempelt, nicht in der Pause) oder Gesamtzeit-Tage.
 */
export function endTimes(day: Day, nowMinutes: Minutes): EndTimes | null {
  if (day.timeMode !== 'blocks') return null
  const real = day.blocks.filter((b) => !b.planned)
  const worked = analyzeBlocks(real, nowMinutes).total
  const ranges = real
    .map((b) => ({ start: clockToMinutes(b.start), end: b.end === null ? nowMinutes : clockToMinutes(b.end) }))
    .sort((a, b) => a.start - b.start)
  const longestGap = ranges.reduce((max, r, i) => (i === 0 ? max : Math.max(max, r.start - ranges[i - 1].end)), 0)
  const running = real.some((b) => b.end === null)

  let state: EndTimes['state']
  let resume = nowMinutes
  let breakDone = longestGap >= MIN_BREAK_MINUTES
  let breakAdded = 0
  if (running) {
    state = 'running'
    if (!breakDone) breakAdded = MIN_BREAK_MINUTES
  } else if (ranges.length === 0) {
    state = 'not-started'
    breakAdded = MIN_BREAK_MINUTES
  } else {
    // Ausgestempelt: gilt als Pause, bis man wieder kommt
    state = 'break'
    const lastEnd = ranges.at(-1)!.end
    if (lastEnd > nowMinutes) return null
    if (!breakDone) {
      resume = Math.max(nowMinutes, lastEnd + MIN_BREAK_MINUTES)
      breakDone = nowMinutes - lastEnd >= MIN_BREAK_MINUTES
    }
  }
  return {
    worked,
    state,
    resume,
    breakDone,
    breakAdded,
    at: (goal) => (worked >= goal ? null : resume + (goal - worked) + breakAdded),
  }
}
