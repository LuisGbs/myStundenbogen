import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

interface Drag {
  id: string
  startY: number
  active: boolean
  /** undefined = (noch) kein Ziel; null = ans Ende */
  beforeId: string | null | undefined
}

/**
 * Sortieren per Griff ≡ (Maus/Touch ziehen oder Pfeiltasten ↑/↓) in einer Liste,
 * deren Einträge `data-sort-id` tragen und in einem Element mit `data-sort-list={list}` stehen.
 * `onDrop(id, beforeId)`: Eintrag vor `beforeId` setzen (null = ans Ende).
 */
export function useSortDrag(list: string, ids: string[], onDrop: (id: string, beforeId: string | null) => void) {
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const update = (next: Drag | null) => {
    dragRef.current = next
    setDrag(next)
  }

  const targetAt = (x: number, y: number): string | null | undefined => {
    const el = document.elementFromPoint(x, y)
    if (!el?.closest(`[data-sort-list="${list}"]`)) return undefined
    const row = el.closest<HTMLElement>('[data-sort-id]')
    if (!row) return undefined
    const i = ids.indexOf(row.dataset.sortId!)
    const rect = row.getBoundingClientRect()
    return y < rect.top + rect.height / 2 ? ids[i] : (ids[i + 1] ?? null)
  }

  const gripProps = (id: string) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      update({ id, startY: e.clientY, active: false, beforeId: undefined })
    },
    onPointerMove: (e: PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d) return
      const active = d.active || Math.abs(e.clientY - d.startY) > 4
      if (!active) return
      const beforeId = targetAt(e.clientX, e.clientY)
      if (!d.active || beforeId !== d.beforeId) update({ ...d, active, beforeId })
    },
    onPointerUp: () => {
      const d = dragRef.current
      update(null)
      if (d?.active && d.beforeId !== undefined) onDrop(d.id, d.beforeId)
    },
    onPointerCancel: () => update(null),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
      const i = ids.indexOf(id)
      if (e.key === 'ArrowUp' && i > 0) onDrop(id, ids[i - 1])
      else if (e.key === 'ArrowDown' && i < ids.length - 1) onDrop(id, ids[i + 2] ?? null)
      else return
      e.preventDefault()
    },
  })

  const active = drag?.active ? drag : null
  return {
    gripProps,
    /** Klassen für eine Zeile: wird gezogen / Einfügelinie davor. */
    rowClass: (id: string) =>
      [active?.id === id && 'is-dragging', active && active.beforeId === id && 'is-drop-before'].filter(Boolean).join(' '),
    /** Einfügelinie hinter dem letzten Eintrag. */
    dropAtEnd: !!active && active.beforeId === null,
    dragging: !!active,
  }
}
