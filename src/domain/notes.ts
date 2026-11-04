/** Notizen an Buchungen: mehrere Punkte mit „ · “ getrennt. */

const SEPARATOR = ' · '
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')

/** Steht `text` schon als eigener Punkt in der Notiz? (Groß/klein egal) */
export function noteContains(note: string, text: string): boolean {
  const wanted = norm(text)
  return wanted !== '' && note.split(SEPARATOR).some((part) => norm(part) === wanted)
}

/** Hängt `text` an die Notiz an – leer oder schon enthalten: unverändert. */
export function appendNote(note: string, text: string): string {
  const clean = text.trim()
  if (!clean || noteContains(note, clean)) return note
  return note.trim() ? `${note.trim()}${SEPARATOR}${clean}` : clean
}
