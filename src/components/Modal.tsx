import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
}

/** Modaler Dialog (natives <dialog>: Esc schließt, Fokus bleibt im Dialog). */
export function Modal({ title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog ref={ref} className="modal" aria-label={title} onClose={onClose}>
      <header className="modal__head">
        <h2>{title}</h2>
        <button type="button" className="icon-btn icon-btn--subtle" aria-label="Schließen" onClick={onClose}>
          <Icon name="x" />
        </button>
      </header>
      <div className="modal__body">{children}</div>
      <footer className="modal__foot">{footer}</footer>
    </dialog>
  )
}
