import { assignBlocks, type BlockSize } from './blockAssign'
import { formatDuration, formatPercent, isPlainNumber, parseAmount } from './duration'
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
  /** Block je Zeile (Allocation-ID → Block-ID); null = der Tag hat keine Blöcke. */
  blockOf: Record<string, string | null>
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

/** Feste Dauer (gesperrt „h:mm“ oder auf der Zeitleiste)? */
export function isFixedMode(mode: AllocationMode): boolean {
  return mode === 'duration' || mode === 'timeline'
}

/**
 * Verteilt die Tageszeit auf die Zeilen eines Tages.
 * 1. Feste Dauern zählen direkt, Prozent-Zeilen bekommen ihren Anteil an der Tageszeit.
 * 2. Jede Zeile gehört zu einem Block (assignBlocks). „Rest im Block“-Zeilen teilen
 *    sich, was in ihrem Block neben allen festen Zeilen (h:mm, Zeitleiste, %) frei ist.
 * 3. Rest-Zeilen teilen sich, was vom Tag übrig bleibt. Gibt es keine und ist
 *    „proportional“ aktiv, wird der Rest anteilig auf alle Zeilen aufgeschlagen.
 * 4. Rundung auf ganze Minuten, Summe bleibt exakt.
 * `blocks` = gültige Blöcke in zeitlicher Reihenfolge (siehe dayTotal.blockDurations).
 */
export function resolveAllocations(
  total: Minutes | null,
  allocations: Allocation[],
  fillStrategy: FillStrategy,
  blocks: BlockSize[] = [],
): AllocationResult {
  const fixedOf = (a: Allocation): Minutes | null => {
    if (isFixedMode(a.mode)) return a.value
    if (a.mode === 'percent') return total === null ? 0 : (total * a.value) / 100
    return null
  }
  const blockOf = assignBlocks(allocations, blocks, fixedOf)

  if (allocations.length === 0) {
    const t = total ?? 0
    return { total, minutes: {}, blockOf, allocated: 0, open: t, status: t > 0 ? 'open' : 'empty' }
  }

  if (total === null) {
    const minutes: Record<string, Minutes | null> = {}
    let allocated = 0
    for (const a of allocations) {
      if (isFixedMode(a.mode)) {
        minutes[a.id] = a.value
        allocated += a.value
      } else {
        minutes[a.id] = null
      }
    }
    return { total, minutes, blockOf, allocated, open: 0, status: 'no-total' }
  }

  const exact = allocations.map((a) => fixedOf(a) ?? 0)

  // Rest im Block: freier Platz des Blocks neben allen festen Zeilen, je Block auf Minuten gerundet.
  for (const block of blocks) {
    const inBlock = allocations.flatMap((a, i) => (blockOf[a.id] === block.id ? [i] : []))
    const rests = inBlock.filter((i) => allocations[i].mode === 'blockRest')
    if (rests.length === 0) continue
    const fixed = inBlock.reduce((s, i) => s + (fixedOf(allocations[i]) ?? 0), 0)
    const free = Math.max(block.minutes - fixed, 0)
    roundPreservingSum(rests.map(() => free / rests.length)).forEach((m, k) => (exact[rests[k]] = m))
  }

  const fixedSum = exact.reduce((s, v) => s + v, 0)
  const remainder = total - fixedSum
  // Ein Block-Rest ohne Block (Tag ohne Blöcke) verhält sich wie ein Tages-Rest.
  const restIndices = allocations.flatMap((a, i) =>
    a.mode === 'rest' || (a.mode === 'blockRest' && blockOf[a.id] === null) ? [i] : [],
  )

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
  return { total, minutes, blockOf, allocated, open, status }
}

/**
 * Wechselt den Modus einer Zeile und behält dabei – wenn möglich – die
 * tatsächlich berechnete Zeit bei (z.B. 4:09 von 8:18 → 50 %). Block und
 * Position bleiben, wie sie sind.
 */
export function changeAllocationMode(
  allocation: Allocation,
  mode: AllocationMode,
  resolvedMinutes: Minutes | null,
  total: Minutes | null,
): Allocation {
  if (mode === allocation.mode) return allocation
  if (mode === 'rest' || mode === 'blockRest') return { ...allocation, mode, value: 0 }
  if (isFixedMode(mode)) {
    const value = isFixedMode(allocation.mode) ? allocation.value : (resolvedMinutes ?? 0)
    return { ...allocation, mode, value }
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
  if (allocation.mode === 'percent' && isPlainNumber(trimmed)) {
    return { ...allocation, value: Number(trimmed.replace(',', '.')) }
  }
  const isRest = allocation.mode === 'rest' || allocation.mode === 'blockRest'
  if (trimmed === '') return isRest ? allocation : { ...allocation, value: 0 }
  const parsed = parseAmount(trimmed)
  if (!parsed) return null
  switch (parsed.kind) {
    case 'rest':
      return { ...allocation, mode: 'rest', value: 0 }
    case 'percent':
      return { ...allocation, mode: 'percent', value: parsed.percent }
    case 'duration': {
      // Zeitleisten-/Blockrest-Zeilen bleiben auf der Zeitleiste, sonst feste Dauer (gesperrt)
      const onTimeline = allocation.mode === 'timeline' || allocation.mode === 'blockRest'
      return { ...allocation, mode: onTimeline ? 'timeline' : 'duration', value: parsed.minutes }
    }
  }
}

/** Anzeigetext des Wert-Felds einer Zeile: '1:30', '50 %' oder '' bei Rest. */
export function formatAllocationValue(allocation: Allocation): string {
  if (isFixedMode(allocation.mode)) return formatDuration(allocation.value)
  if (allocation.mode === 'percent') return formatPercent(allocation.value)
  return ''
}

/**
 * Modus für eine neu hinzugefügte Zeile: Gibt es noch keine Rest-Zeile,
 * wird die neue Zeile zur Rest-Zeile (ein Klick = „der Rest des Tages“).
 */
export function modeForNewAllocation(allocations: Allocation[]): AllocationMode {
  return hasDayRest(allocations) ? 'duration' : 'rest'
}

/** Gibt es eine Rest-Zeile für den ganzen Tag? „Rest im Block“ zählt nicht. */
export function hasDayRest(allocations: Allocation[]): boolean {
  return allocations.some((a) => a.mode === 'rest')
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
