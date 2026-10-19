import { useCallback, useRef, useState, type ReactNode } from 'react'

/** Kurze Bestätigungsmeldung („In die Zwischenablage kopiert“). */
export function useToast(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2500)
  }, [])
  const node = message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null
  return [node, show]
}
