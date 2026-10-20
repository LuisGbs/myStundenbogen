import { todayISO } from '../domain/date'
import { DEFAULT_DAY_TEMPLATE } from '../domain/plan'
import { DEFAULT_WEEKLY_MAX } from '../domain/target'
import type { ActivityType, Settings } from '../domain/types'
import { db } from './db'

export function defaultSettings(): Settings {
  const target = 8 * 60 + 18 // 41,5 h / 5 Tage
  return {
    id: 'settings',
    weekdayTargets: [target, target, target, target, target, 0, 0],
    holidayRegion: 'CH-BL',
    holidayOverrides: {},
    customHolidays: [],
    balanceStart: { date: todayISO(), minutes: 0 },
    defaultFill: null,
    dayTemplate: DEFAULT_DAY_TEMPLATE.map((b) => ({ ...b })),
    weeklyMaxMinutes: DEFAULT_WEEKLY_MAX,
  }
}

export function defaultActivityTypes(): ActivityType[] {
  return [
    { id: 'buero', name: 'Büro', active: true, sortOrder: 0 },
    { id: 'meeting', name: 'Meeting', active: true, sortOrder: 1 },
  ]
}

/** Legt beim ersten Start die Standardwerte an. */
export async function seedDefaults(): Promise<void> {
  await db.transaction('rw', db.settings, db.activityTypes, async () => {
    if (!(await db.settings.get('settings'))) await db.settings.put(defaultSettings())
    if ((await db.activityTypes.count()) === 0) await db.activityTypes.bulkPut(defaultActivityTypes())
  })
}
