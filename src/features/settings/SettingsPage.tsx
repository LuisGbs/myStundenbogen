import { useEffect, useState } from 'react'
import { todayISO } from '../../domain/date'
import { clockToMinutes, formatDuration, minutesToClock } from '../../domain/duration'
import { isValidTemplate } from '../../domain/plan'
import type { ActivityType, Project, Settings, TemplateBlock } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { TimeInput } from '../../components/inputs'
import { useToast } from '../../components/Toast'
import { downloadFile, formatDateTime, pickTextFile } from '../../lib/browser'
import {
  connectFolder,
  disconnectFolder,
  pickFolder,
  reconnectFolder,
  writeBackupNow,
} from '../../storage/backup'
import { backupFileName, collectBackup, ImportError, parseBackup, restoreBackup, serializeBackup } from '../../storage/exportImport'
import { useActivityTypes, useBackupState, useProjects, useSettings } from '../../storage/hooks'
import { updateSettings } from '../../storage/repo'

export function SettingsPage() {
  const settings = useSettings()
  const projects = useProjects()
  const activityTypes = useActivityTypes()
  const [toast, showToast] = useToast()
  if (!settings || !projects || !activityTypes) return null
  return (
    <div className="page page--narrow">
      <BackupCard showToast={showToast} />
      <ExportImportCard showToast={showToast} />
      <TemplateCard settings={settings} />
      <FillCard settings={settings} projects={projects} activityTypes={activityTypes} />
      <PrivacyCard />
      {toast}
    </div>
  )
}

function BackupCard({ showToast }: { showToast: (m: string) => void }) {
  const state = useBackupState()

  const choose = async () => {
    try {
      await connectFolder(await pickFolder())
      showToast('Sicherungsordner verbunden')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) showToast('Ordner konnte nicht verbunden werden')
    }
  }

  return (
    <section className="card">
      <header className="card__head">
        <h2>Automatische Sicherung</h2>
      </header>
      {state.kind === 'unsupported' && (
        <p>
          Dein Browser kann nicht direkt in einen Ordner speichern. Das geht nur in <strong>Chrome</strong> oder{' '}
          <strong>Edge</strong>. Exportiere hier sonst regelmäßig eine Sicherung.
        </p>
      )}
      {state.kind === 'off' && (
        <>
          <p>
            Wähle einen Ordner auf deinem PC (z.B. <em>Dokumente/Stundenbogen</em>). Die App speichert dort nach jeder
            Änderung automatisch <code>stundenbogen.json</code> und zusätzlich eine Tagessicherung im Unterordner{' '}
            <code>backups</code> (die letzten 30 Tage).
          </p>
          <button type="button" className="btn btn--primary" onClick={choose}>
            <Icon name="folder" /> Ordner wählen …
          </button>
        </>
      )}
      {state.kind === 'needs-permission' && (
        <>
          <p>
            Chrome braucht deine Bestätigung, um wieder in den Ordner <strong>{state.folder}</strong> zu speichern.
          </p>
          <button type="button" className="btn btn--primary" onClick={() => void reconnectFolder()}>
            Sicherung fortsetzen
          </button>
        </>
      )}
      {state.kind === 'error' && (
        <>
          <p className="text-danger">
            Die letzte Sicherung in <strong>{state.folder}</strong> ist fehlgeschlagen: {state.message}
          </p>
          <div className="button-row">
            <button type="button" className="btn btn--primary" onClick={() => void writeBackupNow()}>
              Erneut versuchen
            </button>
            <button type="button" className="btn" onClick={choose}>
              Anderen Ordner wählen …
            </button>
          </div>
        </>
      )}
      {state.kind === 'ok' && (
        <>
          <p>
            <Icon name="check" /> Aktiv – Ordner <strong>{state.folder}</strong>
            <br />
            <span className="muted">
              {state.saving
                ? 'Speichert …'
                : state.lastSavedAt
                  ? `Zuletzt gesichert: ${formatDateTime(state.lastSavedAt)}`
                  : 'Noch nicht gesichert'}
            </span>
          </p>
          <div className="button-row">
            <button type="button" className="btn" onClick={() => void writeBackupNow().then(() => showToast('Gesichert'))}>
              Jetzt sichern
            </button>
            <button type="button" className="btn" onClick={choose}>
              Anderen Ordner wählen …
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => void disconnectFolder()}>
              Trennen
            </button>
          </div>
        </>
      )}
      <PersistentStorageNote />
    </section>
  )
}

function PersistentStorageNote() {
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted)
  }, [])
  if (persisted === null) return null
  return (
    <p className="muted small">
      Browser-Speicher:{' '}
      {persisted
        ? 'dauerhaft – der Browser löscht die Daten nicht von sich aus.'
        : 'nicht dauerhaft garantiert. Die automatische Sicherung schützt dich trotzdem.'}
    </p>
  )
}

function ExportImportCard({ showToast }: { showToast: (m: string) => void }) {
  const exportAll = async () => {
    downloadFile(backupFileName(todayISO()), serializeBackup(await collectBackup()), 'application/json')
  }

  const importFile = async () => {
    const text = await pickTextFile()
    if (text === null) return
    try {
      const file = parseBackup(text)
      const { projects, days } = file.data
      const ok = confirm(
        `Sicherung mit ${projects.length} Projekten und ${days.length} Tagen importieren?\n\nAlle aktuellen Daten in der App werden dabei ersetzt.`,
      )
      if (!ok) return
      await restoreBackup(file)
      showToast('Sicherung importiert')
    } catch (e) {
      alert(e instanceof ImportError ? e.message : 'Import fehlgeschlagen.')
    }
  }

  return (
    <section className="card">
      <header className="card__head">
        <h2>Export / Import</h2>
      </header>
      <p className="muted">
        Komplette Sicherung als Datei – z.B. zum Wiederherstellen, falls die Browserdaten gelöscht wurden.
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => void exportAll()}>
          <Icon name="download" /> Alles exportieren (JSON)
        </button>
        <button type="button" className="btn" onClick={() => void importFile()}>
          <Icon name="upload" /> Sicherung importieren …
        </button>
      </div>
    </section>
  )
}

function FillCard({ settings, projects, activityTypes }: { settings: Settings; projects: Project[]; activityTypes: ActivityType[] }) {
  const value = settings.defaultFill ? `${settings.defaultFill.projectId}|${settings.defaultFill.activityTypeId}` : ''
  const combos = projects
    .filter((p) => p.active || p.id === settings.defaultFill?.projectId)
    .flatMap((p) => activityTypes.map((a) => ({ p, a })))
  return (
    <section className="card">
      <header className="card__head">
        <h2>Auffüllen</h2>
      </header>
      <label className="field">
        <span className="field__label">Standardprojekt für „Rest auf Standardprojekt“</span>
        <select
          className="input"
          value={value}
          onChange={(e) => {
            const [projectId, activityTypeId] = e.target.value.split('|')
            void updateSettings({ defaultFill: projectId ? { projectId, activityTypeId } : null })
          }}
        >
          <option value="">– keins –</option>
          {combos.map(({ p, a }) => (
            <option key={`${p.id}|${a.id}`} value={`${p.id}|${a.id}`}>
              {p.name} · {a.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}

function TemplateCard({ settings }: { settings: Settings }) {
  const template = settings.dayTemplate ?? []
  const save = (next: TemplateBlock[]) => void updateSettings({ dayTemplate: next })
  const update = (i: number, patch: Partial<TemplateBlock>) => save(template.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const valid = isValidTemplate(template)

  return (
    <section className="card">
      <header className="card__head">
        <h2>Normaler Arbeitstag (Vorlage)</h2>
      </header>
      <p className="muted small">
        Solange an einem Arbeitstag noch nichts gestempelt ist, werden diese Zeiten grau als <em>geplant</em>{' '}
        vorbelegt. So kannst du Projekte schon grob verteilen und die echten Stempel später nachtragen.
      </p>
      <div className="blocks">
        {template.map((b, i) => (
          <div key={i} className="block-row">
            <TimeInput
              className="input input--time"
              aria-label={`Vorlage Block ${i + 1} Beginn`}
              value={b.start}
              onCommit={(start) => update(i, { start })}
            />
            <span className="block-row__dash">–</span>
            <TimeInput
              className="input input--time"
              aria-label={`Vorlage Block ${i + 1} Ende`}
              value={b.end}
              onCommit={(end) => update(i, { end })}
            />
            <span className="block-row__duration num">
              {formatDuration(Math.max(0, clockToMinutes(b.end) - clockToMinutes(b.start)))}
            </span>
            <button
              type="button"
              className="icon-btn icon-btn--subtle"
              aria-label={`Vorlage Block ${i + 1} entfernen`}
              onClick={() => save(template.filter((_, j) => j !== i))}
            >
              <Icon name="x" />
            </button>
          </div>
        ))}
        {!valid && <p className="text-danger small">Ein Ende liegt vor dem Beginn.</p>}
        <div className="button-row">
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              const lastEnd = template.at(-1)?.end ?? '07:30'
              const start = minutesToClock(Math.min(clockToMinutes(lastEnd) + 30, 22 * 60))
              save([...template, { start, end: minutesToClock(clockToMinutes(start) + 60) }])
            }}
          >
            <Icon name="plus" /> Block
          </button>
          {template.length === 0 && <span className="muted small">Keine Vorlage – leere Tage bleiben leer.</span>}
        </div>
        <p className="muted small">
          Summe: {formatDuration(template.reduce((sum, b) => sum + Math.max(0, clockToMinutes(b.end) - clockToMinutes(b.start)), 0))}{' '}
          · gilt nur an Tagen mit Soll-Zeit (Mo–Fr)
        </p>
      </div>
    </section>
  )
}

function PrivacyCard() {
  return (
    <section className="card">
      <header className="card__head">
        <h2>Datenschutz</h2>
      </header>
      <ul className="plain-list">
        <li>Alle Daten liegen nur in diesem Browser auf deinem PC und in deinem Sicherungsordner.</li>
        <li>Die App sendet nichts an einen Server – das verhindert der Browser zusätzlich technisch (Content-Security-Policy).</li>
        <li>GitHub Pages liefert nur das Programm aus, nie deine Daten.</li>
      </ul>
    </section>
  )
}
