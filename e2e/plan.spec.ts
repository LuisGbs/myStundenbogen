import { expect, test } from '@playwright/test'

test('geplanter Arbeitstag: Vorlage grau vorbelegt, Projekte verteilen, echte Stempel nachtragen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  await page.getByLabel('Projektname', { exact: true }).first().fill('Revit')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]')).toHaveValue('Revit')

  // Mittwoch, noch nichts gestempelt → Vorlage 07:00–11:33 + 12:03–15:48 (= 8:18) als „geplant“
  await page.goto('/#/tag/2026-10-14')
  const planned = page.getByTestId('planned-block')
  await expect(planned).toHaveCount(2)
  await expect(page.getByTestId('plan-note')).toContainText('noch nicht gestempelt')
  await expect(page.getByLabel('Block 1 Beginn')).toHaveValue('07:00')
  await expect(page.getByLabel('Block 2 Ende')).toHaveValue('15:48')
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')
  const timeline = page.getByTestId('timeline')
  await expect(timeline.locator('.timeline__block.is-planned')).toHaveCount(2)
  await expect(timeline.locator('.timeline__labels')).toContainText('geplant')

  // Schon grob planen: Projekt auf den geplanten Nachmittag ziehen
  await timeline.getByTestId('timeline-chip-Revit').dragTo(timeline.getByTestId('timeline-block-1'))
  await expect(timeline.getByTestId('segment-Revit · Büro').getByRole('slider')).toHaveAttribute('aria-valuenow', '225')
  await expect(planned).toHaveCount(2) // weiterhin geplant

  // Monat zeigt den Tag als geplant (kursiv/grau, ~)
  await page.goto('/#/monat/2026-10')
  await expect(page.getByTestId('worked-2026-10-14')).toHaveClass(/is-planned/)
  await page.goto('/#/tag/2026-10-14')

  // Echten Stempel nachtragen → dieser Block ist nicht mehr geplant, das Projekt bleibt am Block
  await page.getByLabel('Block 1 Beginn').fill('07:12')
  await expect(planned).toHaveCount(1)
  await expect(page.getByTestId('plan-note')).toBeVisible()
  await page.getByLabel('Block 2 Ende').fill('16:00')
  await expect(planned).toHaveCount(0)
  await expect(page.getByTestId('plan-note')).toHaveCount(0)
  await expect(timeline.getByTestId('segment-Revit · Büro')).toBeVisible()
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')

  // Samstag → keine Vorlage
  await page.goto('/#/tag/2026-10-17')
  await expect(page.getByTestId('planned-block')).toHaveCount(0)

  // Donnerstag: Plan direkt übernehmen
  await page.goto('/#/tag/2026-10-15')
  await expect(planned).toHaveCount(2)
  await page.getByRole('button', { name: 'Plan übernehmen' }).click()
  await expect(planned).toHaveCount(0)
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')

  // Vorlage in den Einstellungen ändern → gilt für neue Tage
  await page.goto('/#/einstellungen')
  await page.getByLabel('Vorlage Block 2 Ende').fill('16:00')
  await page.goto('/#/tag/2026-10-16')
  await expect(page.getByLabel('Block 2 Ende')).toHaveValue('16:00')
  await expect(page.getByTestId('worked-total')).toHaveText('8:30')

  // Feiertag (Auffahrt 2026, Basel-Landschaft) → keine Vorlage
  await page.goto('/#/tag/2026-05-14')
  await expect(page.getByTestId('holiday-badge')).toContainText('Auffahrt')
  await expect(page.getByTestId('planned-block')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/geplant.png', fullPage: true })
})
