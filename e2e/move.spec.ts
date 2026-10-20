import { expect, test, type Locator, type Page } from '@playwright/test'

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('Element nicht sichtbar')
  return b
}

/** Segment am Körper (nicht am Rand) packen und an (x, y) loslassen. */
async function dragSegment(page: Page, segment: Locator, to: { x: number; y: number }) {
  const b = await box(segment)
  const from = { x: b.x + 8, y: b.y + b.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 10, from.y + 2, { steps: 2 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await expect(page.getByTestId('drop-marker')).toBeVisible()
  await page.mouse.up()
}

const selectedProjects = (rows: Locator) =>
  rows.locator('select[aria-label="Projekt"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLSelectElement).selectedOptions[0].textContent),
  )

test('Segmente verschieben, Liste nach Blöcken, Rest im Block, Σ bei gleichem Projekt', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Reinigung', 'Revit']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
  await page.goto('/#/tag/2026-10-14')
  await page.getByLabel('Block 1 Beginn').fill('07:00')
  await page.getByLabel('Block 1 Ende').fill('11:00')
  await page.getByLabel('Block 2 Beginn').fill('12:00')
  await page.getByLabel('Block 2 Ende').fill('16:00')
  await expect(page.getByTestId('worked-total')).toHaveText('8:00')

  const timeline = page.getByTestId('timeline')
  const morning = timeline.getByTestId('timeline-block-0')
  const afternoon = timeline.getByTestId('timeline-block-1')
  const panel = page.getByTestId('segment-panel')
  const groups = page.locator('.alloc-group')
  const reinigung = timeline.getByTestId('segment-Reinigung · Büro')
  const revit = timeline.getByTestId('segment-Revit · Büro')

  // Reinigung und Revit in den Vormittag, je 1:00
  await timeline.getByTestId('timeline-chip-Reinigung').dragTo(morning)
  await panel.getByLabel('Dauer im Block').fill('1:00')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(reinigung.getByRole('slider')).toHaveAttribute('aria-valuenow', '60')
  const mb = await box(morning)
  await timeline.getByTestId('timeline-chip-Revit').dragTo(morning, { targetPosition: { x: mb.width - 10, y: 10 } })
  await panel.getByLabel('Dauer im Block').fill('1:00')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(revit.getByRole('slider')).toHaveAttribute('aria-valuenow', '60')
  // Liste ist nach Blöcken gruppiert
  await expect(groups.nth(0).locator('.alloc-group__head')).toHaveText('07:00–11:00')
  await expect.poll(() => selectedProjects(groups.nth(0).getByTestId('alloc-row'))).toEqual(['Reinigung', 'Revit'])

  // 1) Revit als Ganzes vor Reinigung ziehen
  const rb = await box(reinigung)
  await dragSegment(page, revit, { x: rb.x + 4, y: rb.y + rb.height / 2 })
  await expect.poll(() => selectedProjects(groups.nth(0).getByTestId('alloc-row'))).toEqual(['Revit', 'Reinigung'])
  expect((await box(revit)).x).toBeLessThan((await box(reinigung)).x)
  await expect(revit.getByRole('slider')).toHaveAttribute('aria-valuenow', '60') // Dauer bleibt

  // 2) Reinigung in den Nachmittag ziehen → steht unten unter dem Nachmittag
  const ab = await box(afternoon)
  await dragSegment(page, reinigung, { x: ab.x + ab.width / 2, y: ab.y + ab.height / 2 })
  await expect(afternoon.getByTestId('segment-Reinigung · Büro')).toBeVisible()
  await expect(groups.nth(1).locator('.alloc-group__head')).toHaveText('12:00–16:00')
  await expect.poll(() => selectedProjects(groups.nth(1).getByTestId('alloc-row'))).toEqual(['Reinigung'])

  // 3) Revit auch nach der Pause → zwei Zeilen, beide mit Σ
  await timeline.getByTestId('timeline-chip-Revit').dragTo(afternoon, { targetPosition: { x: ab.width - 10, y: 10 } })
  const afternoonRows = groups.nth(1).getByTestId('alloc-row')
  await expect.poll(() => selectedProjects(afternoonRows)).toEqual(['Reinigung', 'Revit'])
  await expect(page.getByTestId('alloc-combined')).toHaveCount(2)
  await expect(page.getByTestId('alloc-combined').first()).toHaveText('Σ 4:00') // 1:00 + 3:00

  // 4) Revit am Nachmittag auf „Block-Rest“ → wächst/schrumpft mit
  const revitPm = afternoonRows.nth(1)
  await revitPm.getByRole('radio', { name: 'Block-Rest' }).click()
  await expect(revitPm.getByRole('radio', { name: 'Block-Rest' })).toHaveAttribute('aria-checked', 'true')
  await expect(revitPm.getByTestId('alloc-result')).toHaveText('3:00')
  const reinigungSlider = afternoon.getByTestId('segment-Reinigung · Büro').getByRole('slider')
  await reinigungSlider.focus()
  await reinigungSlider.press('ArrowRight')
  await expect(reinigungSlider).toHaveAttribute('aria-valuenow', '65')
  await expect(revitPm.getByTestId('alloc-result')).toHaveText('2:55')
  await expect(afternoon.getByTestId('segment-Revit · Büro')).toHaveClass(/is-blockRest/)
  // Nachmittag voll (1:05 + 2:55), am Vormittag ist neben Revit noch 3:00 frei
  await expect(page.getByTestId('day-status')).toContainText('5:00 von 8:00 verteilt · noch 3:00 offen')
  await page.screenshot({ path: 'test-results/verschieben-blockrest.png', fullPage: true })

  // Panel: „Rest im Block“ ist aktiv, Dauer nur Anzeige
  await afternoon.getByTestId('segment-Revit · Büro').click({ position: { x: 10, y: 10 } })
  await expect(panel.getByRole('button', { name: 'Rest im Block' })).toHaveAttribute('aria-pressed', 'true')
  await expect(panel.getByTestId('panel-blockrest')).toHaveText('2:55')
  await expect(panel.getByLabel('Dauer im Block')).toHaveCount(0)

  // 5) Per Griff und Pfeiltaste nach „Ohne Zeitleiste“ → wird Tages-Rest
  await page.waitForTimeout(1100) // eigener Schritt im Rückgängig-Verlauf
  await revitPm.getByRole('button', { name: 'Zeile verschieben' }).focus()
  await page.keyboard.press('ArrowDown')
  const free = page.getByTestId('alloc-group-frei')
  await expect(free.getByTestId('alloc-row')).toHaveCount(1)
  await expect(free.getByRole('radio', { name: 'Rest', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(free.getByTestId('alloc-result')).toHaveText('5:55') // 8:00 − 1:00 − 1:05

  // 6) Strg+Z macht das Verschieben rückgängig
  await page.keyboard.press('Control+z')
  await expect(free).toHaveCount(0)
  await expect(groups.nth(1).getByTestId('alloc-row').nth(1).getByRole('radio', { name: 'Block-Rest' })).toHaveAttribute(
    'aria-checked',
    'true',
  )

  // 7) „.5“ im Wert-Feld = 0:30
  const revitAm = groups.nth(0).getByTestId('alloc-row').nth(0)
  await revitAm.getByLabel('Dauer oder Anteil').fill('.5')
  await revitAm.getByLabel('Dauer oder Anteil').press('Enter')
  await expect(revitAm.getByTestId('alloc-result')).toHaveText('0:30')
})
