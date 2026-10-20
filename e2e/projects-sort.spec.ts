import { expect, test } from '@playwright/test'

test('Projekte per Griff ≡ sortieren (Maus und Pfeiltasten), bleibt nach dem Neuladen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Alpha', 'Beta', 'Gamma']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
  const rows = page.getByTestId('project-row')
  const names = () => rows.locator('input[aria-label="Projektname"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  await expect.poll(names).toEqual(['Alpha', 'Beta', 'Gamma'])

  // Gamma am Griff packen und über Alpha ziehen
  const grip = page.getByRole('button', { name: 'Gamma verschieben' })
  const g = (await grip.boundingBox())!
  const alpha = (await rows.nth(0).boundingBox())!
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await page.mouse.move(g.x + g.width / 2, alpha.y + 10, { steps: 8 })
  await expect(rows.nth(0)).toHaveClass(/is-drop-before/)
  await page.mouse.up()
  await expect.poll(names).toEqual(['Gamma', 'Alpha', 'Beta'])

  // Pfeiltaste: Gamma eins nach unten
  await page.getByRole('button', { name: 'Gamma verschieben' }).press('ArrowDown')
  await expect.poll(names).toEqual(['Alpha', 'Gamma', 'Beta'])

  await page.reload()
  await expect.poll(names).toEqual(['Alpha', 'Gamma', 'Beta'])
})
