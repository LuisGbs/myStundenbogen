import { expect, test } from '@playwright/test'

// Der echte Ordner-Dialog lässt sich nicht automatisieren. Stattdessen liefert
// showDirectoryPicker hier das private Dateisystem des Browsers (OPFS) – dieselbe
// API, sodass Schreiben, Tagessicherung und Wiederherstellung echt getestet werden.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { showDirectoryPicker: () => navigator.storage.getDirectory() })
  })
})

async function readFolderFile(page: import('@playwright/test').Page, path: string[]): Promise<string | null> {
  return page.evaluate(async (parts) => {
    try {
      let dir = await navigator.storage.getDirectory()
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p)
      return await (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).text()
    } catch {
      return null
    }
  }, path)
}

test('automatische Sicherung in den Ordner und Wiederherstellung daraus', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()

  // Ordner verbinden → Banner verschwindet, Status „gesichert“
  await page.getByRole('button', { name: 'Ordner wählen …' }).click()
  await expect(page.getByText('Automatische Sicherung ist noch nicht eingerichtet.')).toBeHidden()
  await expect(page.locator('.topbar__backup')).toContainText('gesichert')

  // Änderung → wird nach kurzer Verzögerung in die Datei geschrieben
  await page.goto('/#/projekte')
  await page.getByLabel('Projektname', { exact: true }).first().fill('Sicherungstest')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect
    .poll(async () => (await readFolderFile(page, ['stundenbogen.json'])) ?? '', { timeout: 10_000 })
    .toContain('Sicherungstest')

  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  expect(await readFolderFile(page, ['backups', `stundenbogen-${today}.json`])).toContain('Sicherungstest')

  // Browserdaten „verloren“ → Wiederherstellung aus dem Ordner
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('stundenbogen')
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      }),
  )
  await page.goto('/')
  await page.reload()
  await page.getByRole('button', { name: 'Aus Sicherungsordner wiederherstellen' }).click()
  await page.goto('/#/projekte')
  await expect(page.locator('.item-row input[aria-label="Projektname"]')).toHaveValue('Sicherungstest')
  await expect(page.locator('.topbar__backup')).toContainText('gesichert')
})
