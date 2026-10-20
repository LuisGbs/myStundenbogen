import { resolveAllocations, type AllocationResult } from './allocation'
import { blockDurations, workedMinutes } from './dayTotal'
import type { Day, ISODate, Minutes } from './types'

export function emptyDay(date: ISODate): Day {
  return {
    date,
    timeMode: 'blocks',
    blocks: [],
    totalMinutes: null,
    allocations: [],
    fillStrategy: 'none',
    absence: null,
    note: '',
    updatedAt: new Date(0).toISOString(),
  }
}

/** Ein Tag ohne jeden Inhalt (und mit Standard-Einstellungen) muss nicht gespeichert werden. */
export function isEmptyDay(day: Day): boolean {
  return (
    day.timeMode === 'blocks' &&
    day.fillStrategy === 'none' &&
    day.blocks.length === 0 &&
    day.totalMinutes === null &&
    day.allocations.length === 0 &&
    day.absence === null &&
    day.note.trim() === ''
  )
}

export interface DaySummary {
  worked: Minutes | null
  allocation: AllocationResult
}

export function summarizeDay(day: Day, nowMinutes: Minutes | null = null): DaySummary {
  const worked = workedMinutes(day, nowMinutes)
  return {
    worked,
    allocation: resolveAllocations(worked, day.allocations, day.fillStrategy, blockDurations(day, nowMinutes)),
  }
}
