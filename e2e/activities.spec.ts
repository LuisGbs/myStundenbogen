import { expect, test, type Page } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const DATE = '2026-10-14'

async function addProject(page: Page, name: string) {
  await page.getByLabel('Projektname', { exact: true }).first().fill(name)
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
}

test('Tätigkeiten je Projekt: eigene Auswahl am Tag, Projektwechsel, Nummer im Monat und Excel', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  await addProject(page, 'Epis')
  await addProject(page, 'Revit')

  // Epis: + Engineering (10); Revit: Büro löschen → nur Meeting
  await page.getByRole('button', { name: 'Tätigkeiten von Epis' }).click()
  const epis = page.getByTestId('activities-Epis')
  await expect(epis.getByLabel('Name der Tätigkeit', { exact: true })).toHaveCount(2) // Kopie der Standardliste
  await page.getByLabel('Neue Tätigkeit für Epis', { exact: true }).fill('Engineering')
  await page.getByLabel('Nummer der neuen Tätigkeit für Epis').fill('10')
  await epis.getByRole('button', { name: 'Hinzufügen' }).click()
  await expect(epis.getByLabel('Name der Tätigkeit', { exact: true })).toHaveCount(3)
  // Standard: automatisch die erste aktive, dann Engineering fest – Reihenfolge bleibt
  const standard = (name: string) => epis.getByRole('button', { name: `${name} als Standard` })
  await expect(standard('Büro')).toHaveAttribute('aria-pressed', 'true')
  await standard('Engineering').click()
  await expect(standard('Engineering')).toHaveAttribute('aria-pressed', 'true')
  await expect(standard('Büro')).toHaveAttribute('aria-pressed', 'false')
  await expect
    .poll(() => epis.getByLabel('Name der Tätigkeit', { exact: true }).evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value)))
    .toEqual(['Büro', 'Meeting', 'Engineering'])
  await page.getByRole('button', { name: 'Tätigkeiten von Revit' }).click()
  const revit = page.getByTestId('activities-Revit')
  await revit.getByRole('button', { name: 'Büro löschen' }).click()
  await expect(revit.getByLabel('Name der Tätigkeit', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Tätigkeiten von Revit' })).toContainText('Tätigkeiten (1)')

  // Tag: Gesamtzeit 8:18
  await page.goto(`/#/tag/${DATE}`)
  await page.getByLabel('Block 1 Beginn').fill('07:45')
  await page.getByLabel('Block 1 Ende').fill('12:00')
  await page.getByLabel('Block 2 Beginn').fill('12:45')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')
  const rows = page.getByTestId('alloc-row')
  await page.getByLabel('Projekt hinzufügen').selectOption({ label: 'Epis' })
  await expect(rows).toHaveCount(1)
  const radios = (i: number) =>
    rows.nth(i).getByRole('radiogroup', { name: 'Tätigkeit' }).getByRole('radio').allInnerTexts()
  await expect.poll(() => radios(0)).toEqual(['Büro', 'Meeting', 'Engineering'])
  // Standard-Tätigkeit ist vorgewählt
  await expect(rows.nth(0).getByRole('radio', { name: 'Engineering' })).toBeChecked()

  await page.getByLabel('Projekt hinzufügen').selectOption({ label: 'Revit' })
  await expect(rows).toHaveCount(2)
  await expect.poll(() => radios(1)).toEqual(['Meeting'])
  await rows.nth(1).getByLabel('Dauer oder Anteil').fill('1:00')
  await rows.nth(1).getByLabel('Dauer oder Anteil').press('Enter')
  await expect(rows.nth(1).getByTestId('alloc-result')).toHaveText('1:00')

  // Projektwechsel: Revit · Meeting → Epis · Meeting (gleicher Name) → zurück
  await rows.nth(1).getByLabel('Projekt').selectOption({ label: 'Epis' })
  await expect.poll(() => radios(1)).toEqual(['Büro', 'Meeting', 'Engineering'])
  await expect(rows.nth(1).getByRole('radio', { name: 'Meeting' })).toBeChecked()
  await rows.nth(1).getByRole('radio', { name: 'Engineering' }).click()
  await rows.nth(1).getByLabel('Projekt').selectOption({ label: 'Revit' })
  await expect(rows.nth(1).getByRole('radio', { name: 'Meeting' })).toBeChecked()
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('7:18')

  // Monat: Tätigkeit mit Nummer, Excel-Text mit eigener Spalte
  await page.goto('/#/monat/2026-10')
  const grid = page.getByTestId('month-grid')
  const engineering = grid.locator('tr.sub-row', { hasText: 'Engineering' })
  await expect(engineering).toContainText('10')
  await expect(engineering).toContainText('7:18')
  await page.getByRole('button', { name: 'Tabelle kopieren' }).click()
  const text = await page.evaluate(() => navigator.clipboard.readText())
  const lines = text.split('\r\n').map((l) => l.split('\t'))
  expect(lines[0].slice(0, 4)).toEqual(['Projekt', 'Nr.', 'Tätigkeit', 'Tätigkeit Nr.'])
  expect(lines.find((l) => l[2] === 'Engineering')?.slice(0, 4)).toEqual(['Epis', '', 'Engineering', '10'])
  expect(lines.find((l) => l[0] === 'Revit')?.slice(0, 3)).toEqual(['Revit', '', 'Meeting'])
})

test('alte Sicherung (Stand 8, globale Tätigkeitsarten) wird umgestellt – Buchungen bleiben gleich', async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  const backup = {
    app: 'stundenbogen',
    schemaVersion: 8,
    exportedAt: '2026-10-30T10:00:00.000Z',
    data: {
      projects: [
        { id: 'p-epis', name: 'Epis', code: 'E-1', color: '#2563eb', active: true, sortOrder: 0, createdAt: '' },
        { id: 'p-nie', name: 'Nie gebucht', code: '', color: '#16a34a', active: true, sortOrder: 1, createdAt: '' },
      ],
      activityTypes: [
        { id: 'buero', name: 'Büro', active: true, sortOrder: 0 },
        { id: 'meeting', name: 'Meeting', active: true, sortOrder: 1 },
      ],
      days: [
        {
          date: DATE,
          timeMode: 'total',
          blocks: [],
          totalMinutes: 498,
          allocations: [
            { id: 'a1', projectId: 'p-epis', activityTypeId: 'meeting', mode: 'duration', value: 90, note: '' },
            { id: 'a2', projectId: 'p-epis', activityTypeId: 'buero', mode: 'rest', value: 0, note: '' },
          ],
          fillStrategy: 'none',
          absence: null,
          note: '',
          updatedAt: '',
        },
      ],
      settings: { id: 'settings' },
      tasks: [],
    },
  }
  await page.goto('/#/einstellungen')
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Sicherung importieren …' }).click()
  await (await chooserPromise).setFiles({
    name: 'alt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await expect(page.getByText('Sicherung importiert')).toBeVisible()

  await page.goto('/#/monat/2026-10')
  const grid = page.getByTestId('month-grid')
  await expect(grid.locator('tr.sub-row', { hasText: 'Meeting' })).toContainText('1:30')
  await expect(grid.locator('tr.sub-row', { hasText: 'Büro' })).toContainText('6:48')

  await page.goto(`/#/tag/${DATE}`)
  const rows = page.getByTestId('alloc-row')
  await expect(rows.nth(0).getByRole('radio', { name: 'Meeting' })).toBeChecked()
  await expect(rows.nth(1).getByRole('radio', { name: 'Büro' })).toBeChecked()

  await page.goto('/#/projekte')
  await expect(page.getByRole('button', { name: 'Tätigkeiten von Epis' })).toContainText('Tätigkeiten (2)')
  await expect(page.getByRole('button', { name: 'Tätigkeiten von Nie gebucht' })).toContainText('Tätigkeiten (2)')
  await expect(page.getByTestId('activities-Standardliste').getByLabel('Name der Tätigkeit', { exact: true })).toHaveCount(2)
})
