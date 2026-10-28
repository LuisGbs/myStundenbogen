import { expect, test } from '@playwright/test'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

const IMPORT_TEXT = `Klar, hier ist deine Liste:

# Epis
- [ ] Pläne prüfen
  - [ ] Erdgeschoss
  - [x] Dach
- [ ] !! Rückruf Statiker
  > Tel. 061 123 45 67

# Ohne Projekt
- [ ] Zahnarzt anrufen
`

test('Aufgaben: ★ wichtig, Info mit LLM-Text, Import mit Vorschau, keine Doppelten, Rückgängig, Export', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T08:00:00+01:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Epis', 'Revit']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }
  await page.getByRole('link', { name: 'Aufgaben', exact: true }).click()
  await page.getByTestId('tasks-nav-Epis').click()

  // ★: markierte Aufgabe steht oben
  const newTask = page.getByLabel('Neue Aufgabe')
  for (const title of ['Erste', 'Zweite']) {
    await newTask.fill(title)
    await newTask.press('Enter')
  }
  const cards = page.locator('[data-sort-list^="tasks-"] > [data-testid="task-card"]')
  const titles = () => cards.locator('input[aria-label="Aufgabe"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  await expect.poll(titles).toEqual(['Erste', 'Zweite'])
  await page.getByRole('button', { name: 'Zweite als wichtig markieren' }).click()
  await expect.poll(titles).toEqual(['Zweite', 'Erste'])
  await expect(page.getByRole('button', { name: 'Zweite als wichtig markieren' })).toHaveAttribute('aria-pressed', 'true')

  // Info: LLM-Text enthält die Projekte und landet in der Zwischenablage
  await page.getByRole('button', { name: 'Format & LLM-Hilfe' }).click()
  const info = page.getByRole('dialog', { name: 'Format & LLM-Hilfe' })
  await info.getByText('Diesen Text kopierst du').click()
  await expect(info.getByTestId('llm-prompt')).toContainText('MEINE PROJEKTE')
  await expect(info.getByTestId('llm-prompt')).toContainText('- Epis\n- Revit')
  await info.getByRole('button', { name: 'Text für das LLM kopieren' }).click()
  await expect(page.locator('.toast')).toContainText('Text für das LLM kopiert')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('- Epis\n- Revit')
  expect(clip.trimEnd().endsWith('MEINE TODO-LISTE')).toBe(true)

  // Import: Vorschau, Hinweis zur Einleitungszeile, „Ohne Projekt“ zuordnen
  await info.getByRole('button', { name: 'Zum Import …' }).click()
  const dialog = page.getByRole('dialog', { name: 'Aufgaben importieren' })
  await dialog.getByLabel('Importtext').fill(IMPORT_TEXT)
  const sections = dialog.getByTestId('task-import-section')
  await expect(sections).toHaveCount(2)
  await expect(sections.nth(0)).toContainText('2 Aufgaben und 2 Stichpunkte neu')
  await expect(sections.nth(1)).toContainText('bitte zuordnen')
  await expect(dialog.getByTestId('task-import-warnings')).toContainText('Zeile 1: Zeile nicht erkannt')
  await expect(dialog.getByTestId('task-import-summary')).toContainText('2 Aufgaben und 2 Stichpunkte')
  await dialog.getByLabel('Ziel für „Ohne Projekt“').selectOption({ label: '→ Revit' })
  await expect(dialog.getByTestId('task-import-summary')).toContainText('3 Aufgaben und 2 Stichpunkte')
  await dialog.getByRole('button', { name: 'Importieren' }).click()
  await expect(page.locator('.toast')).toContainText('3 Aufgaben importiert')

  // ★ aus „!!“ steht oben, Stichpunkte und Notiz sind da
  await expect.poll(titles).toEqual(['Zweite', 'Rückruf Statiker', 'Erste', 'Pläne prüfen'])
  await expect(cards.nth(1).getByLabel('Notiz zur Aufgabe', { exact: true }).last()).toHaveValue('Tel. 061 123 45 67')
  await expect(cards.nth(3).getByTestId('task-progress')).toHaveText('1/2')
  await expect(page.getByTestId('tasks-nav-Revit')).toContainText('1')

  // Nochmal importieren → alles schon vorhanden
  await page.getByRole('button', { name: 'Importieren …' }).click()
  await dialog.getByLabel('Importtext').fill(IMPORT_TEXT)
  await expect(sections.nth(0)).toContainText('2 schon vorhanden')
  await dialog.getByLabel('Ziel für „Ohne Projekt“').selectOption({ label: '→ Revit' })
  await expect(sections.nth(1)).toContainText('1 schon vorhanden')
  await expect(dialog.getByRole('button', { name: 'Importieren' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Schließen' }).click()

  // Export dieses Projekts → Text im Format
  await page.getByRole('button', { name: 'Exportieren …' }).click()
  const exportDialog = page.getByRole('dialog', { name: 'Aufgaben exportieren' })
  await exportDialog.getByRole('button', { name: 'Text kopieren' }).click()
  const exported = await page.evaluate(() => navigator.clipboard.readText())
  expect(exported).toBe(
    [
      '# Epis',
      '- [ ] !! Zweite',
      '- [ ] !! Rückruf Statiker',
      '  > Tel. 061 123 45 67',
      '- [ ] Erste',
      '- [ ] Pläne prüfen',
      '  - [ ] Erdgeschoss',
      '',
    ].join('\n'),
  )

  // Rückgängig nach einem Import entfernt genau diesen Import
  await page.getByRole('button', { name: 'Importieren …' }).click()
  await dialog.getByLabel('Importtext').fill('# Epis\n- [ ] Neu A\n- [ ] Neu B')
  await dialog.getByRole('button', { name: 'Importieren' }).click()
  await expect.poll(titles).toEqual(['Zweite', 'Rückruf Statiker', 'Erste', 'Pläne prüfen', 'Neu A', 'Neu B'])
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click()
  await expect.poll(titles).toEqual(['Zweite', 'Rückruf Statiker', 'Erste', 'Pläne prüfen'])
})
