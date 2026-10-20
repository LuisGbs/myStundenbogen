import { useEffect, useState, type FormEvent } from 'react'
import { formatDateLong, isISODate, todayISO, weekdayName } from '../../domain/date'
import {
  clockToMinutes,
  formatDuration,
  minutesToClock,
  parseDuration,
} from '../../domain/duration'
import { HOLIDAY_REGIONS, holidaysInYear } from '../../domain/holidays'
import { isValidTemplate } from '../../domain/plan'
import { weeklyTarget } from '../../domain/target'
import type { ActivityType, HolidayRegion, Minutes, Project, Settings, TemplateBlock } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { CommitInput, TimeInput } from '../../components/inputs'
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
import { changeSettings, updateSettings } from '../../storage/repo'

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
      <WorkTimeCard settings={settings} />
      <HolidayCard settings={settings} />
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

function WorkTimeCard({ settings }: { settings: Settings }) {
  const setTarget = (index: number, minutes: Minutes) =>
    void changeSettings((s) => ({ weekdayTargets: s.weekdayTargets.map((m, i) => (i === index ? minutes : m)) }))

  return (
    <section className="card">
      <header className="card__head">
        <h2>Soll-Arbeitszeit &amp; Woche</h2>
        <span className="muted small">
          Woche: <strong className="num">{formatDuration(weeklyTarget(settings))}</strong>
        </span>
      </header>
      <div className="weekday-targets">
        {settings.weekdayTargets.map((minutes, i) => (
          <label key={i} className="field">
            <span className="field__label">{weekdayName(i)}</span>
            <CommitInput
              className="input input--amount"
              aria-label={`Soll ${weekdayName(i)}`}
              value={formatDuration(minutes)}
              onCommit={(text) => {
                const parsed = text.trim() === '' ? 0 : parseDuration(text)
                if (parsed === null) return null
                setTarget(i, parsed)
                return formatDuration(parsed)
              }}
            />
          </label>
        ))}
      </div>
      <div className="balance-start">
        <label className="field">
          <span className="field__label">Höchstarbeitszeit / Woche</span>
          <CommitInput
            className="input input--amount"
            aria-label="Höchstarbeitszeit pro Woche"
            value={formatDuration(settings.weeklyMaxMinutes ?? 45 * 60)}
            onCommit={(text) => {
              const minutes = parseDuration(text)
              if (minutes === null || minutes <= 0) return null
              void updateSettings({ weeklyMaxMinutes: minutes })
              return formatDuration(minutes)
            }}
          />
        </label>
      </div>
      <p className="muted small">
        Pro Tag und pro Woche zeigt die App, wie viel du über oder unter dem Soll liegst und wie viel bis zur
        Höchstarbeitszeit noch geht. Einen Gesamtsaldo führt sie bewusst nicht – der kommt aus der Firmensoftware.
        Feiertage haben kein Soll.
      </p>
    </section>
  )
}

function HolidayCard({ settings }: { settings: Settings }) {
  const [year, setYear] = useState(() => Number(todayISO().slice(0, 4)))
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [share, setShare] = useState<1 | 0.5>(1)
  const holidays = holidaysInYear(year, settings)

  const toggle = (key: string, enabled: boolean) =>
    void changeSettings((s) => ({ holidayOverrides: { ...s.holidayOverrides, [key]: enabled } }))
  const removeCustom = (customDate: string) =>
    void changeSettings((s) => ({ customHolidays: s.customHolidays.filter((c) => c.date !== customDate) }))
  const addCustom = (e: FormEvent) => {
    e.preventDefault()
    if (!isISODate(date) || !name.trim()) return
    const entry = { date, name: name.trim(), share }
    void changeSettings((s) => ({ customHolidays: [...s.customHolidays.filter((c) => c.date !== entry.date), entry] }))
    setName('')
    setDate('')
  }

  return (
    <section className="card">
      <header className="card__head">
        <h2>Feiertage</h2>
      </header>
      <label className="field">
        <span className="field__label">Arbeitsort</span>
        <select
          className="input"
          aria-label="Arbeitsort"
          value={settings.holidayRegion}
          onChange={(e) => void updateSettings({ holidayRegion: e.target.value as HolidayRegion })}
        >
          {(Object.keys(HOLIDAY_REGIONS) as HolidayRegion[]).map((r) => (
            <option key={r} value={r}>
              {HOLIDAY_REGIONS[r].label}
            </option>
          ))}
        </select>
      </label>

      <div className="holiday-year">
        <button type="button" className="icon-btn icon-btn--subtle" aria-label="Vorheriges Jahr" onClick={() => setYear(year - 1)}>
          <Icon name="chevron-left" />
        </button>
        <strong className="num">{year}</strong>
        <button type="button" className="icon-btn icon-btn--subtle" aria-label="Nächstes Jahr" onClick={() => setYear(year + 1)}>
          <Icon name="chevron-right" />
        </button>
      </div>

      {holidays.length === 0 ? (
        <p className="muted">Keine Feiertage.</p>
      ) : (
        <ul className="check-list" data-testid="holiday-list">
          {holidays.map((h) => (
            <li key={h.key + h.date}>
              <div className="check-row">
                {h.custom ? (
                  <span className="holiday-custom-mark" title="Eigener Tag">
                    <Icon name="check" />
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    aria-label={`${h.name} als Feiertag`}
                    onChange={(e) => toggle(h.key, e.target.checked)}
                  />
                )}
                <span className="num holiday-date">{formatDateLong(h.date)}</span>
                <span className={`check-row__name${h.enabled ? '' : ' muted'}`}>{h.name}</span>
                {h.share < 1 && <span className="badge badge--muted">½ Tag</span>}
                {h.custom && <span className="badge badge--new">eigener Tag</span>}
                {h.custom && (
                  <button
                    type="button"
                    className="icon-btn icon-btn--subtle holiday-remove"
                    aria-label={`${h.name} entfernen`}
                    onClick={() => removeCustom(h.date)}
                  >
                    <Icon name="x" />
                  </button>
                )}
                {h.note && <span className="check-row__hint">{h.note}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="add-form holiday-add" onSubmit={addCustom}>
        <input type="date" className="input" aria-label="Eigener Feiertag Datum" value={date} onChange={(e) => setDate(e.target.value)} />
        <input
          className="input add-form__name"
          placeholder="Eigener freier Tag, z.B. Heiligabend"
          aria-label="Eigener Feiertag Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="input"
          aria-label="Eigener Feiertag Umfang"
          value={String(share)}
          onChange={(e) => setShare(e.target.value === '0.5' ? 0.5 : 1)}
        >
          <option value="1">ganzer Tag</option>
          <option value="0.5">halber Tag</option>
        </select>
        <button type="submit" className="btn" disabled={!name.trim() || !isISODate(date)}>
          <Icon name="plus" /> Hinzufügen
        </button>
      </form>
      <p className="muted small">An Feiertagen gibt es kein Soll und keine Vorlage „normaler Arbeitstag“; an halben Tagen das halbe Soll.</p>
    </section>
  )
}

function TemplateCard({ settings }: { settings: Settings }) {
  const template = settings.dayTemplate ?? []
  // Immer auf dem gespeicherten Stand aufbauen (schnelles Ändern von Beginn und Ende hintereinander).
  const changeTemplate = (fn: (current: TemplateBlock[]) => TemplateBlock[]) =>
    void changeSettings((s) => ({ dayTemplate: fn(s.dayTemplate ?? []) }))
  const update = (i: number, patch: Partial<TemplateBlock>) =>
    changeTemplate((current) => current.map((b, j) => (j === i ? { ...b, ...patch } : b)))
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
              onClick={() => changeTemplate((current) => current.filter((_, j) => j !== i))}
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
              changeTemplate((current) => {
                const lastEnd = current.at(-1)?.end ?? '07:30'
                const start = minutesToClock(Math.min(clockToMinutes(lastEnd) + 30, 22 * 60))
                return [...current, { start, end: minutesToClock(clockToMinutes(start) + 60) }]
              })
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
