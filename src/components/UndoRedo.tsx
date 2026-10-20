import { useEffect } from 'react'
import { formatDateLong } from '../domain/date'
import type { ISODate } from '../domain/types'
import { href, navigate, useRoute } from '../lib/router'
import { redo, undo } from '../storage/history'
import { useHistory } from '../storage/hooks'
import { Icon } from './Icon'
import { useToast } from './Toast'

/** In Textfeldern bleibt Strg+Z das normale Rückgängig des Browsers für den getippten Text. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  if (!(target instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'range', 'button', 'color', 'file'].includes(target.type)
}

/** Knöpfe ↶ ↷ für die obere Leiste, inkl. Strg+Z / Strg+Y (bzw. Strg+Shift+Z). */
export function UndoRedo() {
  const { canUndo, canRedo } = useHistory()
  const route = useRoute()
  const [toast, showToast] = useToast()
  const shownDate = route.page === 'day' ? route.date : null

  const run = async (action: () => Promise<ISODate | null>, verb: string) => {
    const date = await action()
    if (!date) return
    showToast(`${verb}: Änderung am ${formatDateLong(date)}`)
    // Änderungen an Tagen sieht man in der Tagesansicht – dorthin springen, wenn es ein anderer Tag ist.
    if (route.page === 'day' && date !== shownDate) navigate(href.day(date))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void run(undo, 'Rückgängig')
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        void run(redo, 'Wiederholt')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="undo-redo">
      <button
        type="button"
        className="icon-btn icon-btn--subtle"
        aria-label="Rückgängig"
        title="Rückgängig (Strg+Z)"
        disabled={!canUndo}
        onClick={() => void run(undo, 'Rückgängig')}
      >
        <Icon name="undo" size={18} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--subtle"
        aria-label="Wiederholen"
        title="Wiederholen (Strg+Y)"
        disabled={!canRedo}
        onClick={() => void run(redo, 'Wiederholt')}
      >
        <Icon name="redo" size={18} />
      </button>
      {toast}
    </div>
  )
}
