import { expect, test, type Locator, type Page } from '@playwright/test'

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('Element nicht sichtbar')
  return b
}

/** Rechten Rand eines Segments um dx Pixel ziehen. */
async function dragHandle(page: Page, segment: Locator, dx: number) {
  const handle = await box(segment.getByRole('slider'))
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y, { steps: 3 })

  await page.mouse.move(x + dx, y, { steps: 3 })
  await page.mouse.up()
}

const minutesOf = async (slider: Locator) => Number(await slider.getAttribute('aria-valuenow'))

test('Zeitleiste: Projekte in Blöcke ziehen, Rand ziehen, Nachbarn rücken nach', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Reinigung', 'Epis', 'Boxer']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }

  await page.goto('/#/tag/2026-10-14')
  await expect(page.getByTestId('planned-block')).toHaveCount(2) // Vorlage – wird gleich überschrieben
  await page.getByLabel('Block 1 Beginn').fill('07:45')
  await page.getByLabel('Block 1 Ende').fill('12:00') // 4:15
  await page.getByLabel('Block 2 Beginn').fill('12:45')
  await page.getByLabel('Block 2 Ende').fill('16:48')
  await expect(page.getByTestId('worked-total')).toHaveText('8:18')

  const timeline = page.getByTestId('timeline')
  const morning = timeline.getByTestId('timeline-block-0')
  const orange = timeline.getByTestId('segment-Reinigung · Büro')
  const violet = timeline.getByTestId('segment-Epis · Büro')
  await expect(timeline.locator('.timeline__labels')).toContainText('07:45–12:00')

  // Reinigung in den Vormittag ziehen → füllt den Block
  await timeline.getByTestId('timeline-chip-Reinigung').dragTo(morning)
  await expect(orange).toContainText('4:15')

  // Rand nach links ziehen → ca. 1:00 (5-Minuten-Raster)
  const blockWidth = (await box(morning)).width
  await dragHandle(page, orange, -(195 / 255) * blockWidth)
  const orangeSlider = orange.getByRole('slider')
  const orangeMinutes = await minutesOf(orangeSlider)
  expect(orangeMinutes).toBeGreaterThanOrEqual(55)
  expect(orangeMinutes).toBeLessThanOrEqual(65)
  expect(orangeMinutes % 5).toBe(0)

  // Epis dahinter ablegen → bekommt den freien Rest des Blocks, dann per Tastatur auf 1:30
  await timeline.getByTestId('timeline-chip-Epis').dragTo(morning, { targetPosition: { x: blockWidth - 10, y: 20 } })
  const violetSlider = violet.getByRole('slider')
  await expect(violetSlider).toHaveAttribute('aria-valuenow', String(255 - orangeMinutes))
  await violetSlider.focus()
  for (let v = 255 - orangeMinutes; v > 90; v -= 5) {
    await violetSlider.press('ArrowLeft')
    await expect(violetSlider).toHaveAttribute('aria-valuenow', String(v - 5))
  }

  const expectFlush = async () => {
    const [o, v] = [await box(orange), await box(violet)]
    expect(Math.abs(o.x + o.width - v.x)).toBeLessThan(3) // keine Lücke
  }
  await expectFlush()

  // Orange kürzer → Violett rückt nach, bleibt 1:30
  await orangeSlider.focus()
  await orangeSlider.press('ArrowLeft')
  await expect(orangeSlider).toHaveAttribute('aria-valuenow', String(orangeMinutes - 5))
  await orangeSlider.press('ArrowLeft')
  await expect(orangeSlider).toHaveAttribute('aria-valuenow', String(orangeMinutes - 10))
  await expect(violetSlider).toHaveAttribute('aria-valuenow', '90')
  await expectFlush()

  // Orange länger ziehen, als Platz ist → stoppt, wenn Violett ans Blockende stößt
  await dragHandle(page, orange, blockWidth)
  await expect(orangeSlider).toHaveAttribute('aria-valuenow', String(255 - 90))
  await expect(violetSlider).toHaveAttribute('aria-valuenow', '90')
  await expectFlush()
  const [v, m] = [await box(violet), await box(morning)]
  expect(Math.abs(v.x + v.width - (m.x + m.width))).toBeLessThan(5)

  // Block ist voll → weiteres Projekt passt nicht hinein
  await timeline.getByTestId('timeline-chip-Boxer').dragTo(morning)
  await expect(timeline.getByText('ist schon voll belegt')).toBeVisible()

  // Segment anklicken → Panel: Meeting, Dauer direkt eintragen
  await violet.click({ position: { x: 10, y: 10 } })
  const panel = page.getByTestId('segment-panel')
  await panel.getByRole('radio', { name: 'Meeting' }).click()
  const violetMeeting = timeline.getByTestId('segment-Epis · Meeting')
  await panel.getByLabel('Dauer im Block').fill('1:04')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(violetMeeting.getByRole('slider')).toHaveAttribute('aria-valuenow', '64')
  // Mehr als in den Block passt → wird auf das Maximum begrenzt
  await panel.getByLabel('Dauer im Block').fill('5:00')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(violetMeeting.getByRole('slider')).toHaveAttribute('aria-valuenow', '90')
  await expect(panel.getByLabel('Dauer im Block')).toHaveValue('1:30')
  await panel.getByLabel('Dauer im Block').fill('1:04')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(violetMeeting.getByRole('slider')).toHaveAttribute('aria-valuenow', '64')

  // Die Zeilen unten zeigen dieselben Dauern
  const rows = page.getByTestId('alloc-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0).getByTestId('alloc-result')).toHaveText('2:45')
  await expect(rows.nth(1).getByTestId('alloc-result')).toHaveText('1:04')
  await page.screenshot({ path: 'test-results/zeitleiste.png', fullPage: true })

  // Einfacher Klick auf einen Chip: hinten in den ersten Block mit freiem Platz
  await timeline.getByTestId('timeline-chip-Boxer').click()
  await expect(timeline.getByTestId('segment-Boxer · Büro').getByRole('slider')).toHaveAttribute('aria-valuenow', '26')

  // Nach dem Einfügen ist das neue Segment ausgewählt → direkt entfernen
  await expect(panel).toContainText('Boxer')
  await panel.getByRole('button', { name: 'Entfernen' }).click()
  await expect(timeline.getByTestId('segment-Boxer · Büro')).toHaveCount(0)
  await expect(rows).toHaveCount(2)
})

test('Liste in zeitlicher Reihenfolge, Modus „Zeitleiste“ und gesperrte Zeilen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Revit', 'Reinigung', 'Weiterbildung']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
  await page.goto('/#/tag/2026-10-14')
  await page.getByLabel('Block 1 Beginn').fill('07:00')
  await page.getByLabel('Block 1 Ende').fill('11:00')
  await page.getByLabel('Block 2 Beginn').fill('12:00')
  await page.getByLabel('Block 2 Ende').fill('16:00')

  const timeline = page.getByTestId('timeline')
  const rows = page.getByTestId('alloc-row')
  const rowProjects = () => rows.locator('select[aria-label="Projekt"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLSelectElement).selectedOptions[0].textContent),
  )

  // Revit zuerst in den Nachmittag, danach Reinigung in den Vormittag
  await timeline.getByTestId('timeline-chip-Revit').dragTo(timeline.getByTestId('timeline-block-1'))
  await expect(timeline.getByTestId('segment-Revit · Büro')).toBeVisible()
  await timeline.getByTestId('timeline-chip-Reinigung').dragTo(timeline.getByTestId('timeline-block-0'))
  await expect(timeline.getByTestId('segment-Reinigung · Büro')).toBeVisible()
  // Liste sortiert zeitlich: Vormittag (Reinigung) vor Nachmittag (Revit)
  await expect.poll(rowProjects).toEqual(['Reinigung', 'Revit'])
  await expect(rows.nth(0).getByRole('radio', { name: 'Zeitleiste' })).toHaveAttribute('aria-checked', 'true')

  // Reinigung unten auf h:mm stellen → oben gesperrt, Dauer bleibt
  await rows.nth(0).getByRole('radio', { name: 'h:mm' }).click()
  await expect(timeline.getByTestId('segment-Reinigung · Büro')).toHaveCount(0)
  const locked = timeline.getByTestId('locked-Reinigung · Büro')
  await expect(locked).toBeVisible()
  await expect(locked.getByRole('slider')).toHaveCount(0) // kein Griff
  await expect.poll(rowProjects).toEqual(['Reinigung', 'Revit']) // bleibt an ihrem Platz (lineares Modell)

  // Gesperrte Zeile anklicken → Panel ohne Bearbeitung, „Auf Zeitleiste übernehmen“
  await locked.click()
  const panel = page.getByTestId('segment-panel')
  await expect(panel).toContainText('gesperrt')
  await expect(panel.getByLabel('Dauer im Block')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Auf Zeitleiste übernehmen' }).click()
  await expect(timeline.getByTestId('segment-Reinigung · Büro').getByRole('slider')).toHaveAttribute('aria-valuenow', '240')
  await expect.poll(rowProjects).toEqual(['Reinigung', 'Revit'])

  // Revit über das Panel auf 2:00 kürzen → Platz im Nachmittag
  await timeline.getByTestId('segment-Revit · Büro').click({ position: { x: 10, y: 10 } })
  await panel.getByLabel('Dauer im Block').fill('2:00')
  await panel.getByLabel('Dauer im Block').press('Enter')
  await expect(timeline.getByTestId('segment-Revit · Büro').getByRole('slider')).toHaveAttribute('aria-valuenow', '120')

  // Weiterbildung unten als Rest → füllt oben die freie Zeit gesperrt auf; per Modus „Zeitleiste“ übernehmen
  await page.getByLabel('Projekt hinzufügen').selectOption({ label: 'Weiterbildung' })
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(2).getByRole('radio', { name: 'Rest', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(timeline.getByTestId('locked-Weiterbildung · Büro')).toBeVisible()
  await rows.nth(2).getByRole('radio', { name: 'Zeitleiste' }).click()
  await expect(timeline.getByTestId('segment-Weiterbildung · Büro')).toBeVisible()
  await expect(page.getByTestId('day-status')).toContainText('8:00 vollständig verteilt')
  await page.screenshot({ path: 'test-results/zeitleiste-modus.png', fullPage: true })
})
