/** Datum im Format 'YYYY-MM-DD' (lokales Kalenderdatum, ohne Zeitzone). */
export type ISODate = string

/** Uhrzeit im Format 'HH:MM' (24 h). */
export type ClockTime = string

/** Dauer in ganzen Minuten. Alle Zeiten werden intern so gespeichert. */
export type Minutes = number

export interface Project {
  id: string
  name: string
  /** Projektnummer / Kostenstelle aus der Firmensoftware (optional). */
  code: string
  color: string
  active: boolean
  sortOrder: number
  createdAt: string
}

/** Unterteilung innerhalb eines Projekts, z.B. „Büro“ oder „Meeting“. */
export interface ActivityType {
  id: string
  name: string
  active: boolean
  sortOrder: number
}

export interface TimeBlock {
  id: string
  start: ClockTime
  /** null = Block läuft noch (eingestempelt, noch nicht ausgestempelt). */
  end: ClockTime | null
  /** Aus der Vorlage „normaler Arbeitstag“ – nur geplant, noch nicht gestempelt. */
  planned?: boolean
}

/** Ein Block der Vorlage für einen normalen Arbeitstag. */
export interface TemplateBlock {
  start: ClockTime
  end: ClockTime
}

/**
 * Wie eine Zeile ihre Zeit bekommt:
 * - duration: feste Dauer in Minuten (value = Minuten)
 * - percent:  Anteil an der Tageszeit (value = Prozent, z.B. 50)
 * - rest:     bekommt, was übrig bleibt (value wird ignoriert)
 */
export type AllocationMode = 'duration' | 'percent' | 'rest'

export interface Allocation {
  id: string
  projectId: string
  activityTypeId: string
  mode: AllocationMode
  value: number
  note: string
  /**
   * Stempel-Block, in dem die Zeile auf der Zeitleiste liegt (TimeBlock.id bzw.
   * 'gesamt' bei Gesamtzeit). Nur für feste Dauern; fehlt = frei verteilt.
   */
  blockId?: string
}

export type AbsenceKind = 'vacation' | 'sick' | 'paid-other' | 'comp-time'

export interface Absence {
  kind: AbsenceKind
  /** 1 = ganzer Tag, 0.5 = halber Tag */
  share: 1 | 0.5
}

/** blocks = Stempelzeiten, total = Gesamtzeit direkt eingetragen. */
export type TimeMode = 'blocks' | 'total'

/** Was mit nicht verteilter Zeit passiert, wenn es keine Rest-Zeile gibt. */
export type FillStrategy = 'none' | 'proportional'

export interface Day {
  date: ISODate
  timeMode: TimeMode
  blocks: TimeBlock[]
  /** Nur relevant bei timeMode = 'total'. null = noch nicht eingetragen. */
  totalMinutes: Minutes | null
  allocations: Allocation[]
  fillStrategy: FillStrategy
  absence: Absence | null
  note: string
  updatedAt: string
}

/** Arbeitsort für die gesetzlichen Feiertage. */
export type HolidayRegion = 'CH-BL' | 'DE-BW' | 'DE-BY' | 'DE-RP' | 'none'

export interface CustomHoliday {
  date: ISODate
  name: string
  share: 1 | 0.5
}

export interface Settings {
  id: 'settings'
  /** Soll-Zeit pro Wochentag in Minuten, Montag zuerst (Index 0 = Mo … 6 = So). */
  weekdayTargets: Minutes[]
  holidayRegion: HolidayRegion
  /** Feiertage der Vorlage ein-/ausschalten: key → aktiv. */
  holidayOverrides: Record<string, boolean>
  customHolidays: CustomHoliday[]
  /** Früher Startwert eines Gesamtsaldos – wird nicht mehr genutzt (bleibt für alte Sicherungen im Schema). */
  balanceStart: { date: ISODate; minutes: Minutes }
  /** Ziel für „Rest auf Standardprojekt“. */
  defaultFill: { projectId: string; activityTypeId: string } | null
  /** Vorlage für noch nicht gestempelte Arbeitstage (leer = keine Vorlage). */
  dayTemplate: TemplateBlock[]
  /** Höchstarbeitszeit pro Woche (Mo–So), z.B. 45 h nach Arbeitsgesetz. */
  weeklyMaxMinutes: Minutes
}
