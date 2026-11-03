/** Anzeige der drei Felder: eigener Name, offizieller Name (Firmensoftware), Nummer. */
interface Named {
  name: string
  officialName?: string
  code?: string
}

/** Name in der Firmensoftware (leer = eigener Name). */
export function officialName(x: Named): string {
  return x.officialName?.trim() || x.name
}

/** „Offizieller Name · Nr.“ für kleine Hinweise. */
export function officialLabel(x: Named): string {
  return x.code ? `${officialName(x)} · ${x.code}` : officialName(x)
}

/** Gibt es zur Firmensoftware etwas zu sagen, das der eigene Name nicht schon zeigt? */
export function hasOfficialInfo(x: Named): boolean {
  return !!x.code || officialName(x) !== x.name
}

/**
 * Buchungsziel in der Firmensoftware: „Epis Allg. · 2295/90 / Engineering · 10“.
 * null, wenn das nichts Neues sagt (offizielle Namen = eigene, keine Nummern).
 */
export function bookingTarget(project: Named | undefined, activity: Named | undefined): string | null {
  const parts = [project, activity].filter((x): x is Named => !!x)
  if (!parts.some(hasOfficialInfo)) return null
  return parts.map(officialLabel).join(' / ')
}
