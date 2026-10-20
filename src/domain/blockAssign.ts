import type { Allocation, Minutes } from './types'

/** Ein gültiger Block des Tages (in zeitlicher Reihenfolge übergeben). */
export interface BlockSize {
  id: string
  minutes: Minutes
}

/** Feste Minuten einer Zeile (Dauer, Prozent); null = Rest/Block-Rest (füllt den Block). */
export type FixedMinutes = (allocation: Allocation) => Minutes | null

/**
 * Ordnet jede Zeile einem Block zu – in der Reihenfolge der Liste:
 * - Eine gültige `blockId` gilt. Liegt der Block später als der bisherige, rückt
 *   der „Cursor“ dorthin.
 * - Zeilen ohne (gültige) `blockId` – alte Daten, gelöschter Block, Wechsel
 *   Gesamtzeit ↔ Stempel – fließen in den Block des Cursors; ist er mit festen
 *   Dauern schon voll, in den nächsten. Rest-Zeilen füllen ihren Block.
 * Ohne Blöcke: alles null.
 */
export function assignBlocks(
  allocations: Allocation[],
  blocks: BlockSize[],
  fixedMinutes: FixedMinutes,
): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  if (blocks.length === 0) {
    for (const a of allocations) result[a.id] = null
    return result
  }
  const index = new Map(blocks.map((b, i) => [b.id, i]))
  const used = blocks.map(() => 0)
  let cursor = 0
  for (const a of allocations) {
    let b = a.blockId !== undefined ? index.get(a.blockId) : undefined
    if (b === undefined) {
      while (cursor < blocks.length - 1 && used[cursor] >= blocks[cursor].minutes) cursor++
      b = cursor
    } else if (b > cursor) {
      cursor = b
    }
    result[a.id] = blocks[b].id
    const fixed = fixedMinutes(a)
    used[b] = fixed === null ? Math.max(used[b], blocks[b].minutes) : used[b] + fixed
  }
  return result
}
