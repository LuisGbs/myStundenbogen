import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function start(page: Page, projects: [string, string][]) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const [name, code] of projects) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByLabel('Projektnummer', { exact: true }).first().fill(code)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
}

test('Projektliste exportieren und bei einer Kollegin ohne Dubletten importieren', async ({ page, browser }) => {
  // Ich: drei Projekte, zwei davon exportieren
  await start(page, [
    ['Alpha', 'P-1'],
    ['Beta', 'P-2'],
    ['Gamma', ''],
  ])
  await page.getByRole('button', { name: 'Exportieren …' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Projekte exportieren' })
  await expect(exportDialog).toContainText('keine Stunden und keine Tage')
  await exportDialog.getByRole('checkbox').nth(2).uncheck()
  const downloadPromise = page.waitForEvent('download')
  await exportDialog.getByRole('button', { name: 'Exportieren', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^stundenbogen-projekte-\d{4}-\d{2}-\d{2}\.json$/)
  const file = JSON.parse(await readFile(await download.path(), 'utf8'))
  expect(file.projects.map((p: { name: string }) => p.name)).toEqual(['Alpha', 'Beta'])
  expect(file.days).toBeUndefined()

  // Kollegin (eigener, leerer Browser): hat „Alpha AG“ mit derselben Nummer schon
  const colleague = await (await browser.newContext()).newPage()
  await start(colleague, [['Alpha AG', 'P-1']])
  const chooserPromise = colleague.waitForEvent('filechooser')
  await colleague.getByRole('button', { name: 'Importieren …' }).click()
  await (await chooserPromise).setFiles({
    name: 'projekte.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  })

  const importDialog = colleague.getByRole('dialog', { name: 'Projekte importieren' })
  const items = importDialog.getByTestId('import-project')
  await expect(items).toHaveCount(2)
  await expect(items.nth(0)).toContainText('schon vorhanden')
  await expect(items.nth(0).getByRole('checkbox')).not.toBeChecked()
  await expect(items.nth(1)).toContainText('neu')
  await expect(items.nth(1).getByRole('checkbox')).toBeChecked()
  await expect(importDialog.getByTestId('import-summary')).toContainText('1 von 2 Projekten, 0 von 2 Tätigkeitsarten')
  await colleague.screenshot({ path: 'test-results/projekte-import.png' })
  await importDialog.getByRole('button', { name: 'Übernehmen' }).click()

  await expect(colleague.getByText('1 Projekte und 0 Tätigkeitsarten übernommen')).toBeVisible()
  await expect(colleague.locator('.item-row input[aria-label="Projektname"]')).toHaveCount(2)
  await expect(colleague.locator('.item-row input[aria-label="Projektname"]').nth(1)).toHaveValue('Beta')
})
