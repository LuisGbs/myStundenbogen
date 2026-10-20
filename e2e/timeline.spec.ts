import { expect, test } from '@playwright/test'

test('Zeitleiste: Projekt auf Block ziehen, Anteil per Slider, alternativ per Klick', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Alpha', 'Beta']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }

  await page.goto('/#/tag/2026-10-14')
  await expect(page.getByTestId('timeline')).toHaveCount(0) // ohne Zeiten keine Zeitleiste
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Block 1 Beginn').fill('07:45')
  await page.getByLabel('Block 1 Ende').fill('12:00')
  await page.getByRole('button', { name: 'Block', exact: true }).click()
  await page.getByLabel('Block 2 Beginn').fill('12:45')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')

  const timeline = page.getByTestId('timeline')
  await expect(timeline.getByTestId('timeline-block-0')).toContainText('07:45–12:00')
  await expect(timeline.getByTestId('timeline-block-1')).toContainText('12:45–16:48')

  // Beta auf den Nachmittag ziehen, Hälfte → 2:02 (½ von 4:03, gerundet)
  await timeline.getByTestId('timeline-chip-Beta').dragTo(timeline.getByTestId('timeline-block-1'))
  const draft = page.getByTestId('timeline-draft')
  await expect(draft).toBeVisible()
  await expect(draft.getByLabel('Projekt für die Zeitleiste')).toHaveValue(/.+/)
  await expect(draft.getByRole('radio', { name: '12:45–16:48' })).toHaveAttribute('aria-checked', 'true')
  await draft.getByRole('button', { name: '½' }).click()
  await expect(draft.getByTestId('draft-value')).toHaveText('50 % = 2:02')
  await draft.getByRole('button', { name: /Hinzufügen/ }).click()

  const rows = page.getByTestId('alloc-row')
  await expect(rows).toHaveCount(1)
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('2:02')
  await expect(timeline.locator('.timeline__segment', { hasText: 'Beta' })).toBeVisible()
  await expect(timeline.locator('.timeline__segment.is-open')).toHaveAttribute('title', 'offen 6:16')

  // Klick auf den Vormittag, Alpha wählen, Slider auf 50 % → 2:08
  await timeline.getByTestId('timeline-block-0').click()
  await draft.getByLabel('Projekt für die Zeitleiste').selectOption({ label: 'Alpha' })
  await draft.getByRole('radio', { name: 'Meeting' }).click()
  await draft.getByLabel('Anteil am Block').fill('50')
  await expect(draft.getByTestId('draft-value')).toHaveText('50 % = 2:08')
  await draft.getByRole('button', { name: /Hinzufügen/ }).click()

  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).getByTestId('alloc-result')).toHaveText('2:08')
  await expect(rows.nth(1).getByRole('radio', { name: 'Meeting' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('day-status')).toContainText('noch 4:08 offen')
  await page.screenshot({ path: 'test-results/zeitleiste.png', fullPage: true })
})
