import { expect, test } from '@playwright/test'

test('Wochenbalken Tag für Tag: Gestempeltes blau, heute Rest + kommende Tage hellgrau', async ({ page }) => {
  // Donnerstag 12.11.2026, 09:20 – Mo/Di gestempelt, Mi vergessen, heute seit 07:13 eingestempelt
  await page.clock.install({ time: new Date('2026-11-12T07:13:00+01:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  for (const d of ['2026-11-09', '2026-11-10']) {
    await page.goto(`/#/tag/${d}`)
    await page.getByRole('button', { name: 'Plan übernehmen' }).click()
    await expect(page.getByTestId('worked-total')).toHaveText('9:00')
  }
  await page.goto('/#/tag/2026-11-12')
  await page.getByRole('button', { name: 'Kommen (jetzt)' }).click()
  await expect(page.getByLabel('Block 1 Beginn')).toHaveValue('07:13')
  await page.clock.fastForward('02:07:00')
  const pieces = page.getByTestId('week-day')
  const titles = () => pieces.evaluateAll((els) => els.map((el) => el.getAttribute('title')))
  await expect
    .poll(titles)
    .toEqual([
      'Mo 09.11.: 9:00 gestempelt',
      'Di 10.11.: 9:00 gestempelt',
      'Do 12.11.: 2:07 gestempelt',
      'Do 12.11.: 6:40 geplant',
      'Fr 13.11.: 9:00 geplant',
    ])
  await expect(page.getByTestId('week-worked')).toHaveText('20:07')
  await expect(page.getByTestId('week-planned')).toHaveText('(+ 15:40 geplant bis So)')
  await expect(page.getByTestId('week-forecast')).toHaveText('≈ 35:47 h')
  await expect(pieces.nth(1)).toHaveClass(/is-alt/)
  await expect(pieces.nth(3)).toHaveClass(/is-planned/)
  // laufender Block: Rest bis 11:33 als Hinweis; unten zählt er zum Geplanten mit
  await expect(page.getByTestId('running-planned')).toHaveText('+ 2:13 geplant bis 11:33')
  await expect(page.getByTestId('running-end-ghost')).toHaveAttribute('data-ghost', '11:33')
  await expect(page.getByLabel('Block 1 Ende')).toHaveValue('')
  await expect(page.getByTestId('planned-total')).toHaveText('+ 6:40 geplant')
  await expect(page.getByTestId('worked-total')).toHaveText('2:07')

  // Andere Tage derselben Woche: heute läuft im Wochenbalken genauso mit
  for (const other of ['2026-11-13', '2026-11-09']) {
    await page.goto(`/#/tag/${other}`)
    await expect(page.getByTestId('week-worked')).toHaveText('20:07')
    await expect.poll(titles).toContain('Do 12.11.: 2:07 gestempelt')
    await expect.poll(titles).toContain('Do 12.11.: 6:40 geplant')
    await expect(page.getByTestId('week-forecast')).toHaveText('≈ 35:47 h')
  }
})
