import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { pickTextFile } from '../../lib/browser'
import { connectFolder, isBackupSupported, MAIN_FILE, pickFolder, readMainFile } from '../../storage/backup'
import { ImportError, parseBackup, restoreBackup } from '../../storage/exportImport'
import { seedDefaults } from '../../storage/seed'

/** Erster Start (oder Browserdaten gelöscht): neu beginnen oder Sicherung wiederherstellen. */
export function Welcome() {
  const [error, setError] = useState<string | null>(null)

  const restoreFromText = async (text: string) => {
    const file = parseBackup(text)
    await restoreBackup(file)
    await seedDefaults()
  }

  const fromFolder = async () => {
    setError(null)
    try {
      const dir = await pickFolder()
      const text = await readMainFile(dir)
      if (text === null) {
        setError(`In diesem Ordner liegt keine „${MAIN_FILE}“.`)
        return
      }
      await restoreFromText(text)
      await connectFolder(dir)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof ImportError ? e.message : 'Wiederherstellen fehlgeschlagen.')
    }
  }

  const fromFile = async () => {
    setError(null)
    const text = await pickTextFile()
    if (text === null) return
    try {
      await restoreFromText(text)
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Import fehlgeschlagen.')
    }
  }

  return (
    <div className="welcome">
      <div className="card welcome__card">
        <h1>Willkommen beim Stundenbogen</h1>
        <p>
          Hier notierst du jeden Tag schnell, wie lange du gearbeitet hast und auf welche Projekte die Zeit gehört. Am
          Monatsende hast du eine saubere Tabelle zum Übertragen.
        </p>
        <p className="muted small">
          Deine Daten bleiben ausschließlich auf diesem PC – im Browser und auf Wunsch zusätzlich in einem Ordner deiner
          Wahl.
        </p>

        <div className="welcome__actions">
          <button type="button" className="btn btn--primary btn--large" onClick={() => void seedDefaults()}>
            Neu beginnen
          </button>
          {isBackupSupported() && (
            <button type="button" className="btn btn--large" onClick={() => void fromFolder()}>
              <Icon name="folder" /> Aus Sicherungsordner wiederherstellen
            </button>
          )}
          <button type="button" className="btn btn--large" onClick={() => void fromFile()}>
            <Icon name="upload" /> Sicherungsdatei importieren
          </button>
        </div>
        {error && <p className="text-danger">{error}</p>}
      </div>
    </div>
  )
}
