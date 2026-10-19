import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const DATE = '2026-10-14'

async function addProject(page: Page, name: string, code = '') {
  await page.getByLabel('Projektname', { exact: true }).first().fill(name)
  if (code) await page.getByLabel('Projektnummer', { exact: true }).first().fill(code)
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
}

test('Projekt anlegen → Zeit stempeln → verteilen → Monat → Export/Import', async ({ page }) => {
  const foreignRequests: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173/') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) {
      foreignRequests.push(r.url())
    }
  })
  page.on('dialog', (d) => void d.accept())

  // Erster Start
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await expect(page.getByText('Automatische Sicherung ist noch nicht eingerichtet.')).toBeVisible()

  // Projekte
  await page.getByRole('link', { name: 'Projekte', exact: true }).click()
  await addProject(page, 'Alpha', 'P-100')
  await addProject(page, 'Beta')
  await addProject(page, 'Gamma')

  // Tag: zwei Stempel-Blöcke 07:45–12:00 und 12:45–16:48 = 8:18
  await page.goto(`/#/tag/${DATE}`)
  await expect(page.getByRole('heading', { name: 'Mi, 14.10.2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Block 1 Beginn').fill('07:45')
  await page.getByLabel('Block 1 Ende').fill('12:00')
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Block 2 Beginn').fill('12:45')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')

  // Alpha: 50 %
  await page.getByLabel('Projekt hinzufügen').selectOption({ label: 'Alpha (P-100)' })
  const rows = page.getByTestId('alloc-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('8:18') // erste Zeile = Rest
  await rows.nth(0).getByRole('radio', { name: '%' }).click()
  await rows.nth(0).getByLabel('Dauer oder Anteil').fill('50')
  await rows.nth(0).getByLabel('Dauer oder Anteil').press('Enter')
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('4:09')

  // Beta: 1:00 (über die Schnellauswahl)
  await page.locator('.chip', { hasText: 'Beta' }).click()
  await expect(rows).toHaveCount(2)
  await rows.nth(1).getByLabel('Dauer oder Anteil').fill('1:00')
  await rows.nth(1).getByLabel('Dauer oder Anteil').press('Enter')
  await expect(rows.nth(1).getByTestId('alloc-result')).toHaveText('1:00')
  await expect(page.getByTestId('day-status')).toContainText('noch 3:09 offen')

  // Gamma als Rest-Zeile, Meeting
  await page.locator('.chip', { hasText: 'Gamma' }).click()
  await expect(rows).toHaveCount(3)
  await rows.nth(2).getByRole('radio', { name: 'Meeting' }).click()
  await expect(rows.nth(2).getByTestId('alloc-result')).toHaveText('3:09')
  await expect(page.getByTestId('day-status')).toContainText('8:18 vollständig verteilt')

  // Arbeitszeit ändern → alles rechnet neu
  await page.getByLabel('Block 2 Ende').fill('17:30')
  await expect(page.getByTestId('worked-total')).toHaveText('9:00')
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('4:30')
  await expect(rows.nth(2).getByTestId('alloc-result')).toHaveText('3:30')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await expect(page.getByTestId('day-status')).toContainText('8:18 vollständig verteilt')
  await page.screenshot({ path: 'test-results/tag.png', fullPage: true })

  // Monat
  await page.goto('/#/monat/2026-10')
  await expect(page.getByTestId(`worked-${DATE}`)).toHaveText('8:18')
  const grid = page.getByTestId('month-grid')
  await expect(grid.getByText('Alpha')).toBeVisible()
  await expect(grid.locator('tr.sub-row', { hasText: 'Meeting' })).toContainText('3:09')
  await page.screenshot({ path: 'test-results/monat.png', fullPage: true })

  // Export → alles löschen (Import einer leeren Sicherung) → Import der Sicherung
  await page.getByRole('link', { name: 'Einstellungen', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Alles exportieren (JSON)' }).click()
  const download = await downloadPromise
  const exported = await readFile(await download.path(), 'utf8')
  const backup = JSON.parse(exported)
  expect(backup.app).toBe('stundenbogen')
  expect(backup.data.days).toHaveLength(1)

  const emptyBackup = JSON.stringify({ ...backup, data: { ...backup.data, days: [], projects: [] } })
  await importFile(page, emptyBackup)
  await page.goto('/#/monat/2026-10')
  await expect(page.getByText('noch keine gebuchten Stunden')).toBeVisible()

  await page.goto('/#/einstellungen')
  await importFile(page, exported)
  await page.goto('/#/monat/2026-10')
  await expect(page.getByTestId(`worked-${DATE}`)).toHaveText('8:18')
  await expect(grid.locator('tr.sub-row', { hasText: 'Meeting' })).toContainText('3:09')

  expect(foreignRequests).toEqual([])
})

async function importFile(page: Page, content: string) {
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Sicherung importieren …' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(content) })
  await expect(page.getByText('Sicherung importiert')).toBeVisible()
}
