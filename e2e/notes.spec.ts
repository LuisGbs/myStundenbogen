import { expect, test } from '@playwright/test'

test('Notiz pro Eintrag: in der Zeile, im Zeitleisten-Panel und als Tooltip im Monat', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  await page.getByLabel('Projektname', { exact: true }).first().fill('Revit')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]')).toHaveValue('Revit')

  await page.goto('/#/tag/2026-10-14')
  const timeline = page.getByTestId('timeline')
  await timeline.getByTestId('timeline-chip-Revit').dragTo(timeline.getByTestId('timeline-block-0'))
  const row = page.getByTestId('alloc-row').first()

  // Notiz über den ✎-Knopf in der Zeile
  await expect(row.getByLabel('Notiz zum Eintrag')).toHaveCount(0)
  await row.getByRole('button', { name: 'Notiz' }).click()
  await row.getByLabel('Notiz zum Eintrag').fill('Ticket 4711 – Modell prüfen')
  await row.getByLabel('Notiz zum Eintrag').press('Enter')
  await expect(row.getByRole('button', { name: 'Notiz' })).toHaveClass(/has-note/) // gespeichert

  // bleibt nach dem Neuladen sichtbar und steht auch im Panel der Zeitleiste
  await page.reload()
  await expect(page.getByTestId('alloc-row').first().getByLabel('Notiz zum Eintrag')).toHaveValue('Ticket 4711 – Modell prüfen')
  await timeline.getByTestId('segment-Revit · Büro').click({ position: { x: 10, y: 10 } })
  const panelNote = page.getByTestId('segment-panel').getByLabel('Notiz zum Eintrag')
  await expect(panelNote).toHaveValue('Ticket 4711 – Modell prüfen')
  await panelNote.fill('Ticket 4711')
  await panelNote.press('Enter')
  await expect(page.getByTestId('alloc-row').first().getByLabel('Notiz zum Eintrag')).toHaveValue('Ticket 4711')

  // Monat: Zelle mit Markierung und Notiz im Tooltip
  await page.goto('/#/monat/2026-10')
  const cell = page.locator('tr.sub-row td.has-note')
  await expect(cell).toHaveCount(1)
  await expect(cell).toHaveAttribute('title', 'Ticket 4711')
})
