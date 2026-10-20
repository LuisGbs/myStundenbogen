import { expect, test } from '@playwright/test'

test('Eingestempelt: Zeitleiste bis voraussichtlich Gehen, Vorhersage, eigenes Ende, nach 16:30 nichts Komisches', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-20T12:07:00+02:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/tag/2026-10-20')

  // Noch nicht gekommen: „wenn du jetzt kommst“ (12:07 + 8:18 + 0:30)
  await expect(page.getByTestId('end-soll')).toHaveText('20:55')
  await expect(page.getByTestId('end-note')).toContainText('wenn du jetzt kommst')

  // Vormittag 07:06–11:33 gestempelt, nach der Pause um 12:07 eingestempelt
  await page.getByLabel('Block 1 Beginn').fill('07:06')
  await expect(page.getByTestId('planned-block')).toHaveCount(1)
  await page.getByRole('button', { name: 'Kommen (jetzt)' }).click()
  await expect(page.getByLabel('Block 2 Beginn')).toHaveValue('12:07')
  await page.clock.fastForward('01:00:00') // 13:07

  const timeline = page.getByTestId('timeline')
  const future = timeline.getByTestId('timeline-future')
  const expectedInput = page.getByLabel('Voraussichtlich gehen um')
  await expect(future).toContainText('bis 16:30')
  await expect(future).toContainText('noch 3:23')
  await expect(timeline.locator('.timeline__labels')).toContainText('12:07–jetzt (bis ~16:30)')
  await expect(expectedInput).toHaveValue('16:30')
  await expect(page.getByTestId('forecast-worked')).toHaveText('8:50')
  await expect(page.getByTestId('forecast-diff')).toHaveText('+0:32')
  // Gehen um: Soll 8:18 → 15:58, Ziel 9:00 → 16:40 (Pause 11:33–12:07 genommen)
  await expect(page.getByTestId('end-soll')).toHaveText('15:58')
  await expect(page.getByTestId('end-ziel')).toHaveText('16:40')
  await expect(page.getByTestId('end-note')).toHaveText('Pause ✓')
  await page.screenshot({ path: 'test-results/vorhersage.png', fullPage: true })
  // Antippen übernimmt die Zeit als „voraussichtlich bis“
  await page.getByTestId('end-ziel').click()
  await expect(expectedInput).toHaveValue('16:40')
  await expect(page.getByTestId('forecast-worked')).toHaveText('9:00')
  await page.getByRole('button', { name: 'Voraussichtliches Gehen zurücksetzen' }).click()
  await expect(expectedInput).toHaveValue('16:30')

  // Eigener Zug um 16:52 → 9:12, bleibt nach dem Neuladen
  await expectedInput.fill('16:52')
  await expect(page.getByTestId('forecast-worked')).toHaveText('9:12')
  await expect(future).toContainText('bis 16:52')
  await page.reload()
  await expect(page.getByLabel('Voraussichtlich gehen um')).toHaveValue('16:52')
  await page.getByRole('button', { name: 'Voraussichtliches Gehen zurücksetzen' }).click()
  await expect(page.getByLabel('Voraussichtlich gehen um')).toHaveValue('16:30')

  // Nach 16:30 noch da: kein grauer Teil, Hinweis „vorbei“, Block wächst einfach mit
  await page.clock.fastForward('03:53:00') // 17:00
  await expect(future).toHaveCount(0)
  await expect(page.getByText('(vorbei)')).toBeVisible()
  await expect(page.getByTestId('forecast-line')).toHaveCount(0)
  await expect(timeline.locator('.timeline__labels')).toContainText('12:07–jetzt')

  // Ausstempeln → kein „voraussichtlich“ mehr
  await page.getByRole('button', { name: 'Gehen (jetzt)' }).click()
  await expect(page.getByLabel('Voraussichtlich gehen um')).toHaveCount(0)
  await expect(page.getByLabel('Block 2 Ende')).toHaveValue('17:00')
})
