import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { initBackup } from './storage/backup'
import './styles/base.css'
import './styles/components.css'

// Browser bitten, die Daten nicht automatisch zu löschen (Chrome entscheidet ohne Nachfrage).
void navigator.storage?.persist?.()
void initBackup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
