import { useMemo, useSyncExternalStore } from 'react'
import { isISODate, isYearMonth, todayISO, yearMonthOf, type YearMonth } from '../domain/date'
import type { ISODate } from '../domain/types'

/**
 * Minimales Hash-Routing (#/tag/2026-10-19, #/monat/2026-10, …).
 * Funktioniert auf GitHub Pages ohne Server-Konfiguration.
 */
export type Route =
  | { page: 'day'; date: ISODate }
  | { page: 'month'; month: YearMonth }
  | { page: 'projects' }
  | { page: 'settings' }

export function parseRoute(hash: string, today: ISODate = todayISO()): Route {
  const [page, param = ''] = hash.replace(/^#\/?/, '').split('/')
  switch (page) {
    case 'monat':
      return { page: 'month', month: isYearMonth(param) ? param : yearMonthOf(today) }
    case 'projekte':
      return { page: 'projects' }
    case 'einstellungen':
      return { page: 'settings' }
    default:
      return { page: 'day', date: isISODate(param) ? param : today }
  }
}

export const href = {
  today: () => '#/tag',
  day: (date: ISODate) => `#/tag/${date}`,
  month: (month?: YearMonth) => (month ? `#/monat/${month}` : '#/monat'),
  projects: () => '#/projekte',
  settings: () => '#/einstellungen',
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return useMemo(() => parseRoute(hash), [hash])
}

export function navigate(to: string): void {
  window.location.hash = to
}
