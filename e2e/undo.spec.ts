import { expect, test } from '@playwright/test'

test('Rückgängig/Wiederholen per Strg+Z / Strg+Y und Knopf', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  await page.getByLabel('Projektname', { exact: true }).first().fill('Alpha')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]')).toHaveValue('Alpha')

  await page.goto('/#/tag/2026-10-14')
  const undoButton = page.getByRole('button', { name: 'Rückgängig' })
  await expect(undoButton).toBeDisabled()

  await page.getByRole('radio', { name: 'Gesamtzeit' }).click()
  await page.getByLabel('Gesamte Arbeitszeit').fill('8:00')
  await page.getByLabel('Gesamte Arbeitszeit').press('Enter')
  await expect(page.getByTestId('worked-total')).toHaveText('8:00')

  // Projekt in die Zeitleiste, dann per Tastatur am Griff verkürzen
  const timeline = page.getByTestId('timeline')
  await timeline.getByTestId('timeline-chip-Alpha').dragTo(timeline.getByTestId('timeline-block-0'))
  const handle = timeline.getByTestId('segment-Alpha · Büro').getByRole('slider')
  await expect(handle).toHaveAttribute('aria-valuenow', '480')
  await page.waitForTimeout(1100) // neuer Schritt im Verlauf
  await handle.focus()
  await handle.press('ArrowLeft')
  await expect(handle).toHaveAttribute('aria-valuenow', '475')
  await handle.press('ArrowLeft')
  await expect(handle).toHaveAttribute('aria-valuenow', '470')

  // Strg+Z nimmt beide Pfeil-Schritte auf einmal zurück (ein Schritt im Verlauf)
  await page.keyboard.press('Control+z')
  await expect(handle).toHaveAttribute('aria-valuenow', '480')
  await expect(page.getByText('Rückgängig: Änderung am Mi, 14.10.2026')).toBeVisible()

  // Noch einmal → Segment wieder weg
  await page.keyboard.press('Control+z')
  await expect(timeline.getByTestId('segment-Alpha · Büro')).toHaveCount(0)

  // Strg+Y → wieder da
  await page.keyboard.press('Control+y')
  await expect(handle).toHaveAttribute('aria-valuenow', '480')

  // Knopf in der oberen Leiste
  await undoButton.click()
  await expect(timeline.getByTestId('segment-Alpha · Büro')).toHaveCount(0)
  await page.getByRole('button', { name: 'Wiederholen' }).click()
  await expect(handle).toHaveAttribute('aria-valuenow', '480')

  // In einem Textfeld bleibt Strg+Z beim Text – die App wird nicht zurückgesetzt
  const total = page.getByLabel('Gesamte Arbeitszeit')
  await total.click()
  await total.press('End')
  await total.pressSequentially('5')
  await total.press('Control+z')
  await expect(timeline.getByTestId('segment-Alpha · Büro')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/undo.png' })
})
