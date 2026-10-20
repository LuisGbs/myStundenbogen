import { Icon } from './components/Icon'
import { UndoRedo } from './components/UndoRedo'
import { DayPage } from './features/day/DayPage'
import { MonthPage } from './features/month/MonthPage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { Welcome } from './features/welcome/Welcome'
import { href, useRoute, type Route } from './lib/router'
import { connectFolder, pickFolder, reconnectFolder, writeBackupNow, type BackupState } from './storage/backup'
import { useBackupState, useSettings } from './storage/hooks'

export default function App() {
  const settings = useSettings()
  const route = useRoute()

  if (settings === undefined) return null
  if (settings === null) return <Welcome />

  return (
    <div className="app">
      <header className="topbar">
        <a className="topbar__brand" href={href.today()}>
          <img src="./favicon.svg" alt="" width={24} height={24} />
          Stundenbogen
        </a>
        <nav className="topbar__nav" aria-label="Hauptnavigation">
          <NavLink route={route} page="day" to={href.today()} label="Tag" />
          <NavLink route={route} page="month" to={href.month()} label="Monat" />
          <NavLink route={route} page="projects" to={href.projects()} label="Projekte" />
          <NavLink route={route} page="settings" to={href.settings()} label="Einstellungen" />
        </nav>
        <div className="topbar__end">
          <UndoRedo />
          <BackupIndicator />
        </div>
      </header>
      <BackupBanner />
      <main className="main">
        {route.page === 'day' && <DayPage key={route.date} date={route.date} />}
        {route.page === 'month' && <MonthPage month={route.month} />}
        {route.page === 'projects' && <ProjectsPage />}
        {route.page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

function NavLink({ route, page, to, label }: { route: Route; page: Route['page']; to: string; label: string }) {
  const active = route.page === page
  return (
    <a href={to} className={active ? 'is-active' : undefined} aria-current={active ? 'page' : undefined}>
      {label}
    </a>
  )
}

function BackupIndicator() {
  const state = useBackupState()
  if (state.kind !== 'ok') return null
  return (
    <a className="topbar__backup" href={href.settings()} title={`Automatische Sicherung in „${state.folder}“`}>
      <Icon name="check" size={14} /> {state.saving ? 'sichert …' : 'gesichert'}
    </a>
  )
}

function BackupBanner() {
  const state = useBackupState()
  const message = bannerMessage(state)
  if (!message) return null

  const action = async () => {
    try {
      if (state.kind === 'off') await connectFolder(await pickFolder())
      else if (state.kind === 'needs-permission') await reconnectFolder()
      else if (state.kind === 'error') await writeBackupNow()
    } catch {
      // Abbruch im Ordner-Dialog: nichts zu tun.
    }
  }

  return (
    <div className={`banner banner--${state.kind}`} role="status">
      <Icon name={state.kind === 'error' ? 'alert' : 'folder'} />
      <span>{message.text}</span>
      {message.action && (
        <button type="button" className="btn btn--small" onClick={() => void action()}>
          {message.action}
        </button>
      )}
      {state.kind === 'unsupported' && (
        <a className="btn btn--small btn--ghost" href={href.settings()}>
          Zum Export
        </a>
      )}
    </div>
  )
}

function bannerMessage(state: BackupState): { text: string; action?: string } | null {
  switch (state.kind) {
    case 'off':
      return { text: 'Automatische Sicherung ist noch nicht eingerichtet.', action: 'Ordner wählen …' }
    case 'needs-permission':
      return { text: `Sicherung in „${state.folder}“ pausiert – Chrome braucht kurz deine Bestätigung.`, action: 'Fortsetzen' }
    case 'error':
      return { text: `Sicherung fehlgeschlagen: ${state.message}`, action: 'Erneut versuchen' }
    case 'unsupported':
      return { text: 'Automatische Sicherung geht nur in Chrome/Edge – bitte regelmäßig exportieren.' }
    case 'ok':
      return null
  }
}
