import { formatDuration, formatPercent, parseAmount } from './duration'
import type { Allocation, AllocationMode, FillStrategy, Minutes } from './types'

/**
 * - empty:    keine Zeilen, keine Zeit
 * - no-total: Zeilen vorhanden, aber die Tageszeit fehlt noch (Prozent/Rest unberechenbar)
 * - ok:       Tageszeit exakt verteilt
 * - open:     es ist noch Zeit übrig
 * - over:     mehr verteilt, als gearbeitet wurde
 */
export type AllocationStatus = 'empty' | 'no-total' | 'ok' | 'open' | 'over'

export interface AllocationResult {
  total: Minutes | null
  /** Minuten je Zeile (Allocation-ID → Minuten); null = ohne Tageszeit nicht berechenbar. */
  minutes: Record<string, Minutes | null>
  allocated: Minutes
  /** total − allocated; negativ = überbucht. 0, wenn keine Tageszeit bekannt ist. */
  open: Minutes
  status: AllocationStatus
}

const EPS = 1e-9

/**
 * Rundet auf ganze Minuten, sodass die Summe erhalten bleibt
 * (Largest-Remainder-Verfahren). Ganzzahlige Werte bleiben unverändert.
 */
export function roundPreservingSum(values: number[]): number[] {
  const floors = values.map((v) => Math.floor(v + EPS))
  const target = Math.round(values.reduce((a, b) => a + b, 0))
  let units = target - floors.reduce((a, b) => a + b, 0)
  const order = values
    .map((v, i) => ({ i, frac: v - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  const result = [...floors]
  for (const { i, frac } of order) {
    if (units <= 0) break
    if (frac > EPS) {
      result[i] += 1
      units -= 1
    }
  }
  return result
}

/**
 * Verteilt die Tageszeit auf die Zeilen eines Tages.
 * 1. Feste Dauern zählen direkt, Prozent-Zeilen bekommen ihren Anteil an der Tageszeit.
 * 2. Rest-Zeilen teilen sich, was übrig bleibt. Gibt es keine und ist „proportional“
 *    aktiv, wird der Rest anteilig auf alle Zeilen aufgeschlagen.
 * 3. Rundung auf ganze Minuten, Summe bleibt exakt.
 */
export function resolveAllocations(
  total: Minutes | null,
  allocations: Allocation[],
  fillStrategy: FillStrategy,
): AllocationResult {
  if (allocations.length === 0) {
    const t = total ?? 0
    return { total, minutes: {}, allocated: 0, open: t, status: t > 0 ? 'open' : 'empty' }
  }

  if (total === null) {
    const minutes: Record<string, Minutes | null> = {}
    let allocated = 0
    for (const a of allocations) {
      if (a.mode === 'duration') {
        minutes[a.id] = a.value
        allocated += a.value
      } else {
        minutes[a.id] = null
      }
    }
    return { total, minutes, allocated, open: 0, status: 'no-total' }
  }

  const exact = allocations.map((a) => {
    if (a.mode === 'duration') return a.value
    if (a.mode === 'percent') return (total * a.value) / 100
    return 0
  })
  const fixedSum = exact.reduce((s, v) => s + v, 0)
  const remainder = total - fixedSum
  const restIndices = allocations.flatMap((a, i) => (a.mode === 'rest' ? [i] : []))

  if (restIndices.length > 0) {
    const share = Math.max(remainder, 0) / restIndices.length
    for (const i of restIndices) exact[i] = share
  } else if (fillStrategy === 'proportional' && remainder > 0 && fixedSum > 0) {
    for (let i = 0; i < exact.length; i++) exact[i] += (remainder * exact[i]) / fixedSum
  }

  const rounded = roundPreservingSum(exact)
  const minutes: Record<string, Minutes | null> = {}
  allocations.forEach((a, i) => (minutes[a.id] = rounded[i]))
  const allocated = rounded.reduce((s, v) => s + v, 0)
  const open = total - allocated
  const status: AllocationStatus =
    total === 0 && allocated === 0 ? 'empty' : open === 0 ? 'ok' : open > 0 ? 'open' : 'over'
  return { total, minutes, allocated, open, status }
}

/**
 * Wechselt den Modus einer Zeile und behält dabei – wenn möglich – die
 * tatsächlich berechnete Zeit bei (z.B. 4:09 von 8:18 → 50 %).
 */
export function changeAllocationMode(
  allocation: Allocation,
  mode: AllocationMode,
  resolvedMinutes: Minutes | null,
  total: Minutes | null,
): Allocation {
  if (mode === allocation.mode) return allocation
  if (mode === 'rest') return { ...allocation, mode, value: 0 }
  if (mode === 'duration') {
    return { ...allocation, mode, value: resolvedMinutes ?? 0 }
  }
  const percent =
    total && resolvedMinutes !== null ? Math.round((resolvedMinutes / total) * 1000) / 10 : 0
  return { ...allocation, mode, value: percent }
}

/**
 * Wendet eine Eingabe aus dem Wert-Feld einer Zeile an ('1:30', '50%', 'rest', '' …).
 * Im %-Modus gilt eine nackte Zahl als Prozent („50“ = 50 %). null = ungültige Eingabe.
 *
 * Muss gegen den zuletzt gespeicherten Stand der Zeile laufen (innerhalb von
 * updateDay), damit ein eben erst umgeschalteter Modus schon berücksichtigt ist.
 */
export function applyAmountInput(allocation: Allocation, text: string): Allocation | null {
  const trimmed = text.trim()
  if (allocation.mode === 'percent' && /^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return { ...allocation, value: Number(trimmed.replace(',', '.')) }
  }
  if (trimmed === '') return allocation.mode === 'rest' ? allocation : { ...allocation, value: 0 }
  const parsed = parseAmount(trimmed)
  if (!parsed) return null
  switch (parsed.kind) {
    case 'rest':
      return { ...allocation, mode: 'rest', value: 0 }
    case 'percent':
      return { ...allocation, mode: 'percent', value: parsed.percent }
    case 'duration':
      return { ...allocation, mode: 'duration', value: parsed.minutes }
  }
}

/** Anzeigetext des Wert-Felds einer Zeile: '1:30', '50 %' oder '' bei Rest. */
export function formatAllocationValue(allocation: Allocation): string {
  if (allocation.mode === 'duration') return formatDuration(allocation.value)
  if (allocation.mode === 'percent') return formatPercent(allocation.value)
  return ''
}

/**
 * Modus für eine neu hinzugefügte Zeile: Gibt es noch keine Rest-Zeile,
 * wird die neue Zeile zur Rest-Zeile (ein Klick = „der Rest des Tages“).
 */
export function modeForNewAllocation(allocations: Allocation[]): AllocationMode {
  return allocations.some((a) => a.mode === 'rest') ? 'duration' : 'rest'
}

/**
 * „Rest auf Standardprojekt“: Gibt es die Kombination schon, wird sie zur
 * Rest-Zeile, sonst wird eine neue Rest-Zeile angehängt.
 */
export function applyDefaultFill(
  allocations: Allocation[],
  target: { projectId: string; activityTypeId: string },
  newId: string,
): Allocation[] {
  const existing = allocations.find(
    (a) => a.projectId === target.projectId && a.activityTypeId === target.activityTypeId,
  )
  if (existing) {
    return allocations.map((a) => (a === existing ? { ...a, mode: 'rest', value: 0 } : a))
  }
  return [
    ...allocations,
    { id: newId, ...target, mode: 'rest', value: 0, note: '' },
  ]
}
