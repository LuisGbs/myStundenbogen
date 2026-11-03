import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const DATE = '2026-10-14'

test('Drei Felder: eigener Name beim Erfassen, offizieller Name + Nr. für die Firmensoftware', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')

  // Projekt mit allen drei Feldern anlegen
  await page.getByLabel('Projektname', { exact: true }).first().fill('Rollen überarbeiten')
  await page.getByLabel('Offizieller Projektname', { exact: true }).first().fill('Epis Allg.')
  await page.getByLabel('Projektnummer', { exact: true }).first().fill('2295/90')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  const row = page.getByTestId('project-row')
  await expect(row.getByLabel('Projektname', { exact: true })).toHaveValue('Rollen überarbeiten')
  await expect(row.getByLabel('Offizieller Projektname')).toHaveValue('Epis Allg.')
  await expect(row.getByLabel('Projektnummer', { exact: true })).toHaveValue('2295/90')

  // Tätigkeit „Konzept“ = offiziell Engineering, Nr. 10
  await page.getByRole('button', { name: 'Tätigkeiten von Rollen überarbeiten' }).click()
  const acts = page.getByTestId('activities-Rollen überarbeiten')
  await page.getByLabel('Neue Tätigkeit für Rollen überarbeiten', { exact: true }).fill('Konzept')
  await page.getByLabel('Offizieller Name der neuen Tätigkeit für Rollen überarbeiten').fill('Engineering')
  await page.getByLabel('Nummer der neuen Tätigkeit für Rollen überarbeiten').fill('10')
  await acts.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(acts.getByLabel('Name der Tätigkeit', { exact: true })).toHaveCount(3)
  await expect(acts.getByLabel('Offizieller Name der Tätigkeit').nth(2)).toHaveValue('Engineering')
  // offizieller Name nachträglich in der kleinen Zeile ändern
  await acts.getByLabel('Offizieller Name der Tätigkeit').nth(0).fill('Allgemein')
  await acts.getByLabel('Offizieller Name der Tätigkeit').nth(0).press('Enter')

  // Tag: Auswahl mit eigenem Namen, darunter klein das Buchungsziel
  await page.goto(`/#/tag/${DATE}`)
  await page.getByLabel('Block 1 Beginn').fill('07:45')
  await page.getByLabel('Block 1 Ende').fill('12:00')
  await page.getByLabel('Block 2 Beginn').fill('12:45')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await page.getByLabel('Projekt hinzufügen').selectOption({ label: 'Rollen überarbeiten' })
  const allocRow = page.getByTestId('alloc-row').first()
  await allocRow.getByRole('radio', { name: 'Konzept' }).click()
  await expect(allocRow.getByTestId('alloc-official')).toHaveText('Epis Allg. · 2295/90 / Engineering · 10')

  // Monat: offiziell fett, eigener Name klein darunter
  await page.goto('/#/monat/2026-10')
  const grid = page.getByTestId('month-grid')
  const group = grid.locator('tr.group-row').first()
  await expect(group.locator('.group-row__name')).toHaveText('Epis Allg.')
  await expect(group.locator('.own-name')).toHaveText('Rollen überarbeiten')
  const sub = grid.locator('tr.sub-row', { hasText: 'Engineering' })
  await expect(sub.locator('.own-name')).toHaveText('Konzept')
  await expect(sub).toContainText('8:18')

  // Excel: offiziell vorn, eigene Namen hinten
  await page.getByRole('button', { name: 'Tabelle kopieren' }).click()
  const lines = (await page.evaluate(() => navigator.clipboard.readText())).split('\r\n').map((l) => l.split('\t'))
  expect(lines[0].slice(-3)).toEqual(['Summe', 'Mein Projekt', 'Meine Tätigkeit'])
  const line = lines.find((l) => l[2] === 'Engineering')!
  expect(line.slice(0, 4)).toEqual(['Epis Allg.', '2295/90', 'Engineering', '10'])
  expect(line.slice(-3)).toEqual(['8:18', 'Rollen überarbeiten', 'Konzept'])
})
