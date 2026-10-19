import { useState, type InputHTMLAttributes } from 'react'

/**
 * Hält einen lokalen Entwurf, solange das Feld fokussiert ist, und übernimmt
 * neue Werte von außen nur, wenn nicht gerade getippt wird. Nötig, weil die
 * Daten asynchron aus der Datenbank zurückkommen.
 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value)
  const [synced, setSynced] = useState(value)
  const [focused, setFocused] = useState(false)
  if (!focused && value !== synced) {
    setSynced(value)
    setDraft(value)
  }
  return { draft, setDraft, focused, setFocused }
}

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'>

interface CommitInputProps extends BaseInputProps {
  value: string
  /**
   * Wird bei Enter/Verlassen des Feldes aufgerufen. Gibt den neu anzuzeigenden
   * Text zurück oder null, wenn die Eingabe ungültig ist.
   */
  onCommit: (text: string) => string | null
}

/** Textfeld, das erst bei Enter oder beim Verlassen speichert (Esc = verwerfen). */
export function CommitInput({ value, onCommit, className, onFocus, onKeyDown, ...rest }: CommitInputProps) {
  const { draft, setDraft, setFocused } = useDraft(value)
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    setFocused(false)
    if (draft === value) {
      setInvalid(false)
      return
    }
    const shown = onCommit(draft)
    if (shown === null) {
      setInvalid(true)
    } else {
      setInvalid(false)
      setDraft(shown)
    }
  }

  return (
    <input
      {...rest}
      type="text"
      className={[className, invalid ? 'is-invalid' : ''].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => {
        setFocused(true)
        e.target.select()
        onFocus?.(e)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          setInvalid(false)
          // Erst nach dem Zurücksetzen verlassen, damit nichts gespeichert wird.
          const input = e.currentTarget
          setTimeout(() => input.blur())
        }
        onKeyDown?.(e)
      }}
    />
  )
}

interface TimeInputProps extends BaseInputProps {
  value: string
  onCommit: (value: string) => void
}

/** Uhrzeit-Feld (HH:MM), speichert jede vollständige Eingabe sofort. */
export function TimeInput({ value, onCommit, ...rest }: TimeInputProps) {
  const { draft, setDraft, setFocused } = useDraft(value)
  return (
    <input
      {...rest}
      type="time"
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value && e.target.value !== value) onCommit(e.target.value)
      }}
    />
  )
}

interface ColorInputProps extends BaseInputProps {
  value: string
  onCommit: (value: string) => void
}

export function ColorInput({ value, onCommit, ...rest }: ColorInputProps) {
  const { draft, setDraft, setFocused } = useDraft(value)
  return (
    <input
      {...rest}
      type="color"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false)
        if (draft !== value) onCommit(draft)
      }}
    />
  )
}
