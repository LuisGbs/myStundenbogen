import { expect, test } from '@playwright/test'

test('geplanter Arbeitstag: Vorlage grau vorbelegt, Projekte verteilen, echte Stempel nachtragen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  await page.getByLabel('Projektname', { exact: true }).first().fill('Revit')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.locator('.item-row input[aria-label="Projektname"]')).toHaveValue('Revit')

  // Mittwoch, noch nichts gestempelt → Vorlage 07:00–11:33 + 12:03–16:30 (= 9:00) als „geplant“
  await page.goto('/#/tag/2026-10-14')
  const planned = page.getByTestId('planned-block')
  await expect(planned).toHaveCount(2)
  await expect(page.getByTestId('plan-note')).toContainText('noch nicht gestempelt')
  await expect(page.getByLabel('Block 1 Beginn')).toHaveValue('07:00')
  await expect(page.getByLabel('Block 2 Ende')).toHaveValue('16:30')
  // Geplantes zählt noch nicht als gearbeitet – steht nur als Hinweis daneben
  await expect(page.getByTestId('worked-total')).toHaveText('–')
  await expect(page.getByTestId('planned-total')).toHaveText('+ 9:00 geplant')
  // Wochenbalken: Geplantes hellgrau hinter dem Gestempelten
  await expect(page.getByTestId('week-worked')).toHaveText('0:00')
  await expect(page.getByTestId('week-planned')).toHaveText('(+ 9:00 geplant)')
  await expect(page.locator('.week-line__fill.is-planned')).toHaveCount(1)
  const timeline = page.getByTestId('timeline')
  await expect(timeline.locator('.timeline__block.is-planned')).toHaveCount(2)
  await expect(timeline.locator('.timeline__labels')).toContainText('geplant')

  // Schon grob planen: Projekt auf den geplanten Nachmittag ziehen
  await timeline.getByTestId('timeline-chip-Revit').dragTo(timeline.getByTestId('timeline-block-1'))
  await expect(timeline.getByTestId('segment-Revit · Büro').getByRole('slider')).toHaveAttribute('aria-valuenow', '267')
  await expect(planned).toHaveCount(2) // weiterhin geplant

  // Monat zeigt den Tag als geplant (kursiv/grau, ~)
  await page.goto('/#/monat/2026-10')
  await expect(page.getByTestId('worked-2026-10-14')).toHaveClass(/is-planned/)
  await page.goto('/#/tag/2026-10-14')

  // Echten Stempel nachtragen → dieser Block ist nicht mehr geplant, das Projekt bleibt am Block
  await page.getByLabel('Block 1 Beginn').fill('07:12')
  await expect(planned).toHaveCount(1)
  await expect(page.getByTestId('plan-note')).toBeVisible()
  // gestempelt 07:12–11:33 = 4:21, der Nachmittag (4:27) ist noch geplant
  await expect(page.getByTestId('worked-total')).toHaveText('4:21')
  await expect(page.getByTestId('planned-total')).toHaveText('+ 4:27 geplant')
  await expect(page.getByTestId('week-planned')).toHaveText('(+ 4:27 geplant)')
  await page.getByLabel('Block 2 Ende').fill('16:00')
  await expect(planned).toHaveCount(0)
  await expect(page.getByTestId('plan-note')).toHaveCount(0)
  await expect(timeline.getByTestId('segment-Revit · Büro')).toBeVisible()
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')
  await expect(page.getByTestId('planned-total')).toHaveCount(0)

  // Samstag → keine Vorlage
  await page.goto('/#/tag/2026-10-17')
  await expect(page.getByTestId('planned-block')).toHaveCount(0)

  // Donnerstag: Plan direkt übernehmen
  await page.goto('/#/tag/2026-10-15')
  await expect(planned).toHaveCount(2)
  await page.getByRole('button', { name: 'Plan übernehmen' }).click()
  await expect(planned).toHaveCount(0)
  await expect(page.getByTestId('worked-total')).toHaveText('9:00')

  // Vorlage in den Einstellungen ändern → gilt für neue Tage
  await page.goto('/#/einstellungen')
  await page.getByLabel('Vorlage Block 2 Ende').fill('16:00')
  await page.goto('/#/tag/2026-10-16')
  await expect(page.getByLabel('Block 2 Ende')).toHaveValue('16:00')
  await expect(page.getByTestId('planned-total')).toHaveText('+ 8:30 geplant')

  // Feiertag (Auffahrt 2026, Basel-Landschaft) → keine Vorlage
  await page.goto('/#/tag/2026-05-14')
  await expect(page.getByTestId('holiday-badge')).toContainText('Auffahrt')
  await expect(page.getByTestId('planned-block')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/geplant.png', fullPage: true })
})
