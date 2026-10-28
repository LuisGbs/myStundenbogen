import { useCallback, useRef, useState, type ReactNode } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

/**
 * Kurze Bestätigungsmeldung („In die Zwischenablage kopiert“), optional mit
 * einer Aktion („Rückgängig“) – dann bleibt sie etwas länger stehen.
 */
export function useToast(): [ReactNode, (message: string, action?: ToastAction) => void] {
  const [toast, setToast] = useState<{ message: string; action?: ToastAction } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((message: string, action?: ToastAction) => {
    setToast({ message, action })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 2500)
  }, [])
  const node = toast ? (
    <div className="toast" role="status">
      {toast.message}
      {toast.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            toast.action!.onClick()
            setToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  ) : null
  return [node, show]
}
