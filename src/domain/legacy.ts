/**
 * Umstellungen alter Datenstände. Diese Funktionen bleiben für immer so, wie sie
 * sind – sie beschreiben, was ein bestimmter alter Stand bedeutete.
 */

interface AllocationV4 {
  mode: string
  blockId?: string
}

/**
 * Datenstand 4 → 5 (Dexie v6): Bis Stand 4 hieß „feste Dauer mit Block“ Zeitleiste
 * und „Rest mit Block“ Rest im Block. Ab Stand 5 sind das eigene Modi; eine Blockangabe
 * ist für alle Modi erlaubt und bedeutet nur noch „steht in diesem Block“.
 */
export function upgradeAllocationV5<T extends AllocationV4>(allocation: T): T {
  if (!allocation.blockId) return allocation
  if (allocation.mode === 'duration') return { ...allocation, mode: 'timeline' }
  if (allocation.mode === 'rest') return { ...allocation, mode: 'blockRest' }
  return allocation
}
