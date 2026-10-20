import { expect, test } from '@playwright/test'

test('„Gerade“: Projekt läuft mit, Wechsel hält das alte an, Ausstempeln beendet es', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T07:05:00+02:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Epis', 'Revit']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
  await page.goto('/#/tag/2026-10-20')

  const card = page.getByTestId('now-working')
  const active = page.getByTestId('now-active')
  const time = page.getByTestId('now-active-time')
  const rows = page.getByTestId('alloc-row')

  // Noch nicht eingestempelt: Projekt antippen = Kommen + loslegen
  await expect(card).toContainText('jetzt einstempeln und loslegen')
  await card.getByTestId('now-chip-Epis').click()
  await expect(active).toContainText('Epis')
  await expect(page.getByLabel('Block 1 Beginn')).toHaveValue('07:05')
  await expect(page.getByRole('button', { name: 'Gehen (jetzt)' })).toBeVisible()

  // Eine Stunde später: Epis läuft mit
  await page.clock.fastForward('01:00:00')
  await expect(time).toHaveText('1:00')

  // Wechsel zu Revit: Epis bleibt mit 1:00 stehen
  await card.getByTestId('now-chip-Revit').click()
  await expect(active).toContainText('Revit')
  await expect(time).toHaveText('0:00')
  await page.clock.fastForward('00:30:00')
  await expect(time).toHaveText('0:30')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('1:00')
  await expect(rows.nth(0).getByRole('radio', { name: 'Zeitleiste' })).toHaveAttribute('aria-checked', 'true')
  await expect(rows.nth(1).getByRole('radio', { name: 'Block-Rest' })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: 'test-results/gerade.png', fullPage: true })

  // Anhalten: Revit bleibt mit 0:30 stehen, danach ist nichts aktiv
  await active.getByRole('button', { name: 'Anhalten' }).click()
  await expect(active).toHaveCount(0)
  await expect(rows.nth(1).getByTestId('alloc-result')).toHaveText('0:30')
  await expect(rows.nth(1).getByRole('radio', { name: 'Zeitleiste' })).toHaveAttribute('aria-checked', 'true')

  // Wieder Epis, 15 min, dann ausstempeln → Epis behält genau die 15 min
  await card.getByTestId('now-chip-Epis').click()
  await page.clock.fastForward('00:15:00')
  await expect(time).toHaveText('0:15')
  await page.getByRole('button', { name: 'Gehen (jetzt)' }).click()
  await expect(active).toHaveCount(0)
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(2).getByTestId('alloc-result')).toHaveText('0:15')
  // Vormittag 07:05–08:50 voll verteilt; der Nachmittag ist noch die Vorlage (geplant)
  await expect(page.getByLabel('Block 1 Ende')).toHaveValue('08:50')
  await expect(page.getByTestId('day-status')).toContainText('1:45 von 6:12 verteilt')
})
