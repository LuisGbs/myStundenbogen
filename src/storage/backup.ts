import { todayISO } from '../domain/date'
import { db, dataTables } from './db'
import { backupFileName, collectBackup, serializeBackup } from './exportImport'

/**
 * Automatische Sicherung in einen Ordner auf dem PC (File System Access API,
 * nur Chrome/Edge). Nach jeder Änderung wird – leicht verzögert – geschrieben:
 *   <Ordner>/stundenbogen.json                     aktueller Stand
 *   <Ordner>/backups/stundenbogen-YYYY-MM-DD.json   Stand pro Tag (die letzten 30)
 */

export type BackupState =
  | { kind: 'unsupported' }
  | { kind: 'off' }
  | { kind: 'needs-permission'; folder: string }
  | { kind: 'ok'; folder: string; lastSavedAt: string | null; saving: boolean }
  | { kind: 'error'; folder: string; message: string }

const HANDLE_KEY = 'backupDirectory'
const LAST_SAVED_KEY = 'backupLastSavedAt'
export const MAIN_FILE = 'stundenbogen.json'
const BACKUP_DIR = 'backups'
const KEEP_DAILY = 30
const DEBOUNCE_MS = 1500

// ---------- Status (für useSyncExternalStore) ----------

let state: BackupState = { kind: 'off' }
const listeners = new Set<() => void>()

function setState(next: BackupState) {
  state = next
  listeners.forEach((l) => l())
}

export function subscribeBackup(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getBackupState(): BackupState {
  return state
}

// ---------- Ordner-Zugriff ----------

export function isBackupSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const entry = await db.meta.get(HANDLE_KEY)
  return (entry?.value as FileSystemDirectoryHandle | undefined) ?? null
}

async function lastSavedAt(): Promise<string | null> {
  return ((await db.meta.get(LAST_SAVED_KEY))?.value as string | undefined) ?? null
}

export async function pickFolder(): Promise<FileSystemDirectoryHandle> {
  return window.showDirectoryPicker!({ id: 'stundenbogen', mode: 'readwrite', startIn: 'documents' })
}

/** Liest stundenbogen.json aus einem Ordner (für die Wiederherstellung). */
export async function readMainFile(dir: FileSystemDirectoryHandle): Promise<string | null> {
  try {
    const file = await (await dir.getFileHandle(MAIN_FILE)).getFile()
    return await file.text()
  } catch {
    return null
  }
}

/** Ordner merken und sofort sichern. */
export async function connectFolder(dir: FileSystemDirectoryHandle): Promise<void> {
  await db.meta.put({ key: HANDLE_KEY, value: dir })
  setState({ kind: 'ok', folder: dir.name, lastSavedAt: await lastSavedAt(), saving: false })
  await writeBackupNow()
}

/** Nach einem Neustart muss Chrome die Berechtigung evtl. neu bestätigen (Klick nötig). */
export async function reconnectFolder(): Promise<void> {
  const dir = await loadHandle()
  if (!dir) return
  const permission = await dir.requestPermission({ mode: 'readwrite' })
  if (permission === 'granted') {
    setState({ kind: 'ok', folder: dir.name, lastSavedAt: await lastSavedAt(), saving: false })
    await writeBackupNow()
  } else {
    setState({ kind: 'needs-permission', folder: dir.name })
  }
}

export async function disconnectFolder(): Promise<void> {
  await db.meta.delete(HANDLE_KEY)
  setState({ kind: 'off' })
}

// ---------- Schreiben ----------

async function writeFile(dir: FileSystemDirectoryHandle, name: string, text: string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

async function pruneDailyBackups(dir: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = []
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && /^stundenbogen-\d{4}-\d{2}-\d{2}\.json$/.test(name)) names.push(name)
  }
  names.sort()
  for (const name of names.slice(0, Math.max(0, names.length - KEEP_DAILY))) {
    await dir.removeEntry(name)
  }
}

let writeChain: Promise<void> = Promise.resolve()

/** Schreibt sofort (Aufrufe werden nacheinander abgearbeitet, nie parallel). */
export function writeBackupNow(): Promise<void> {
  writeChain = writeChain.then(doWrite, doWrite)
  return writeChain
}

async function doWrite(): Promise<void> {
  const dir = await loadHandle()
  if (!dir) return
  if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    setState({ kind: 'needs-permission', folder: dir.name })
    return
  }
  setState({ kind: 'ok', folder: dir.name, lastSavedAt: await lastSavedAt(), saving: true })
  try {
    const text = serializeBackup(await collectBackup())
    await writeFile(dir, MAIN_FILE, text)
    const daily = await dir.getDirectoryHandle(BACKUP_DIR, { create: true })
    await writeFile(daily, backupFileName(todayISO()), text)
    await pruneDailyBackups(daily)
    const now = new Date().toISOString()
    await db.meta.put({ key: LAST_SAVED_KEY, value: now })
    setState({ kind: 'ok', folder: dir.name, lastSavedAt: now, saving: false })
  } catch (e) {
    setState({ kind: 'error', folder: dir.name, message: e instanceof Error ? e.message : String(e) })
  }
}

let timer: ReturnType<typeof setTimeout> | null = null

export function scheduleBackup(): void {
  if (state.kind === 'off' || state.kind === 'unsupported') return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void writeBackupNow()
  }, DEBOUNCE_MS)
}

function flushPending(): void {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  void writeBackupNow()
}

// ---------- Start ----------

let initialized = false

export async function initBackup(): Promise<void> {
  if (initialized) return
  initialized = true
  if (!isBackupSupported()) {
    setState({ kind: 'unsupported' })
    return
  }

  // Jede Änderung an den Nutzdaten löst eine (verzögerte) Sicherung aus.
  for (const table of dataTables()) {
    table.hook('creating', () => scheduleBackup())
    table.hook('updating', () => scheduleBackup())
    table.hook('deleting', () => scheduleBackup())
  }
  // Beim Schließen/Wechseln des Tabs ausstehende Änderungen sofort schreiben.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPending()
  })

  const dir = await loadHandle()
  if (!dir) {
    setState({ kind: 'off' })
    return
  }
  const permission = await dir.queryPermission({ mode: 'readwrite' })
  setState(
    permission === 'granted'
      ? { kind: 'ok', folder: dir.name, lastSavedAt: await lastSavedAt(), saving: false }
      : { kind: 'needs-permission', folder: dir.name },
  )
}
