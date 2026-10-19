import { useEffect, useState } from 'react'

/** Bietet einen Text als Datei zum Herunterladen an. */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Öffnet den Datei-Dialog und liefert den Inhalt der gewählten Datei. */
export function pickTextFile(accept = '.json,application/json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      resolve(file ? await file.text() : null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/** Aktuelle Uhrzeit, die sich im angegebenen Intervall aktualisiert (null = nie). */
export function useNow(intervalMs: number | null): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (intervalMs === null) return
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Kleine UI-Einstellung im Browser merken (z.B. ein Filter). Nie für Nutzdaten verwenden. */
export function useLocalPreference<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(`stundenbogen.${key}`)
      return stored === null ? initial : (JSON.parse(stored) as T)
    } catch {
      return initial
    }
  })
  const update = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(`stundenbogen.${key}`, JSON.stringify(next))
    } catch {
      // Ohne localStorage geht nur das Merken verloren.
    }
  }
  return [value, update]
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
