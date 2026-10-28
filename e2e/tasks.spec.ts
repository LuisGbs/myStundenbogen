import { expect, test } from '@playwright/test'

test('Aufgaben-Reiter: Aufgaben + Stichpunkte, abhaken, sortieren, löschen/rückgängig, „Gerade“ zeigt offene Punkte', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-28T08:00:00+01:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()
  await page.goto('/#/projekte')
  for (const name of ['Epis', 'Revit']) {
    await page.getByLabel('Projektname', { exact: true }).first().fill(name)
    await page.getByRole('button', { name: 'Anlegen' }).click()
    await expect(page.locator('.item-row input[aria-label="Projektname"]').last()).toHaveValue(name)
  }

  // Reiter Aufgaben → Projekt Epis
  await page.getByRole('link', { name: 'Aufgaben', exact: true }).click()
  await page.getByTestId('tasks-nav-Epis').click()
  const newTask = page.getByLabel('Neue Aufgabe')
  await newTask.fill('Pläne prüfen')
  await newTask.press('Enter')
  await newTask.fill('Mail an Bauherr')
  await newTask.press('Enter')
  // nur die offenen Aufgaben (Erledigte stehen eingeklappt darunter)
  const cards = page.locator('[data-sort-list^="tasks-"] > [data-testid="task-card"]')
  await expect(cards).toHaveCount(2)
  const titles = () => cards.locator('input[aria-label="Aufgabe"]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
  await expect.poll(titles).toEqual(['Pläne prüfen', 'Mail an Bauherr'])
  await expect(page.getByTestId('tasks-nav-Epis')).toContainText('2')

  // Stichpunkte: über das Feld, dann Enter im Stichpunkt → neuer direkt darunter
  const plans = cards.nth(0)
  const addItem = plans.getByLabel('Stichpunkt zu Pläne prüfen hinzufügen')
  await addItem.fill('Erdgeschoss')
  await addItem.press('Enter')
  await addItem.fill('Dach')
  await addItem.press('Enter')
  const items = plans.getByLabel('Stichpunkt', { exact: true })
  await expect(items).toHaveCount(2)
  await items.nth(0).press('Enter') // neuer leerer Stichpunkt hinter „Erdgeschoss“, mit Fokus
  await expect(items).toHaveCount(3)
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.type('Obergeschoss')
  await page.keyboard.press('Enter')
  await expect.poll(() => items.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value).slice(0, 3))).toEqual([
    'Erdgeschoss',
    'Obergeschoss',
    'Dach',
  ])
  // das letzte (leere) wieder entfernen
  await expect(items).toHaveCount(4)
  await plans.getByRole('button', { name: 'Stichpunkt löschen' }).click()
  await expect(items).toHaveCount(3)

  // Abhaken → Fortschritt; letzter Stichpunkt → „Aufgabe auch abhaken“
  await plans.getByLabel('Erdgeschoss erledigt').click()
  await expect(plans.getByLabel('Erdgeschoss erledigt')).toBeChecked()
  await expect(plans.getByTestId('task-progress')).toHaveText('1/3')
  await plans.getByLabel('Obergeschoss erledigt').click()
  await plans.getByLabel('Dach erledigt').click()
  await page.getByRole('button', { name: 'Aufgabe auch abhaken' }).click()
  await expect(cards).toHaveCount(1) // offen nur noch „Mail an Bauherr“
  await expect(page.getByTestId('tasks-done')).toContainText('Erledigt (1)')

  // Sortieren per Pfeiltaste am Griff, löschen + rückgängig
  await newTask.fill('Termin vereinbaren')
  await newTask.press('Enter')
  await page.getByRole('button', { name: 'Termin vereinbaren verschieben' }).press('ArrowUp')
  await expect.poll(titles).toEqual(['Termin vereinbaren', 'Mail an Bauherr'])
  await page.getByRole('button', { name: 'Mail an Bauherr löschen' }).click()
  await expect.poll(titles).toEqual(['Termin vereinbaren'])
  await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click()
  await expect.poll(titles).toEqual(['Termin vereinbaren', 'Mail an Bauherr'])
  await page.screenshot({ path: 'test-results/aufgaben.png', fullPage: true })

  // Nach dem Neuladen noch da; Übersicht „Alle“
  await page.reload()
  await expect.poll(titles).toEqual(['Termin vereinbaren', 'Mail an Bauherr'])
  await page.getByRole('link', { name: /^Alle/ }).click()
  await expect(page.locator('.tasks-overview')).toContainText('Epis')
  await expect(page.locator('.tasks-overview')).toContainText('Mail an Bauherr')

  // Tag: Epis antippen → „Offen bei Epis“, direkt abhakbar und schnell notieren
  await page.goto('/#/tag/2026-10-28')
  await page.getByTestId('now-chip-Epis').click()
  const preview = page.getByTestId('task-preview')
  await expect(preview).toContainText('Offen bei Epis')
  await expect(preview).toContainText('Termin vereinbaren')
  await preview.getByLabel('Termin vereinbaren erledigt').click()
  await expect(preview).not.toContainText('Termin vereinbaren')
  await preview.getByLabel('Aufgabe für Epis notieren').fill('Rückruf Statiker')
  await preview.getByLabel('Aufgabe für Epis notieren').press('Enter')
  await expect(preview).toContainText('Rückruf Statiker')
  await page.screenshot({ path: 'test-results/aufgaben-gerade.png', fullPage: true })
})
