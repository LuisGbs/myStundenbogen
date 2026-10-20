import { expect, test } from '@playwright/test'

test('Soll, Tages- und Wochendifferenz, Feiertage je Arbeitsort (ohne Gesamtsaldo)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Neu beginnen' }).click()

  // Einstellungen: Soll 8:18 Mo–Fr (41:30), kein Übertrag/Stichtag mehr
  await page.goto('/#/einstellungen')
  await expect(page.getByLabel('Soll Montag')).toHaveValue('8:18')
  await expect(page.getByLabel('Soll Samstag')).toHaveValue('0:00')
  await expect(page.getByText('41:30')).toBeVisible()
  await expect(page.getByLabel('Höchstarbeitszeit pro Woche')).toHaveValue('45:00')
  await expect(page.getByLabel('Überstunden-Übertrag')).toHaveCount(0)

  // Arbeitsort: Standard Basel-Landschaft, Wechsel nach Bayern und zurück
  const list = page.getByTestId('holiday-list')
  await expect(list).toContainText('Bundesfeier')
  await page.getByLabel('Arbeitsort').selectOption('DE-BY')
  await expect(list).toContainText('Mariä Himmelfahrt')
  await expect(list).not.toContainText('Bundesfeier')
  await page.getByLabel('Arbeitsort').selectOption('CH-BL')
  await expect(list).toContainText('Bundesfeier')

  // Eigener halber Tag
  await page.getByLabel('Eigener Feiertag Datum').fill('2026-10-13')
  await page.getByLabel('Eigener Feiertag Name').fill('Firmenanlass')
  await page.getByLabel('Eigener Feiertag Umfang').selectOption('0.5')
  await page.getByRole('button', { name: 'Hinzufügen' }).click()

  // Mo: 9:00 gearbeitet → Tag +0:42
  await page.goto('/#/tag/2026-10-12')
  await page.getByRole('radio', { name: 'Gesamtzeit' }).click()
  await page.getByLabel('Gesamte Arbeitszeit').fill('9:00')
  await page.getByLabel('Gesamte Arbeitszeit').press('Enter')
  await expect(page.getByTestId('day-diff')).toHaveText('+0:42')
  await expect(page.getByTestId('balance-line')).not.toContainText('Saldo')

  // Di: halber Feiertag → Soll 4:09
  await page.goto('/#/tag/2026-10-13')
  await expect(page.getByTestId('holiday-badge')).toContainText('Firmenanlass (½)')
  await expect(page.getByTestId('balance-line')).toContainText('Soll 4:09')
  await page.getByRole('radio', { name: 'Gesamtzeit' }).click()
  await page.getByLabel('Gesamte Arbeitszeit').fill('4:09')
  await page.getByLabel('Gesamte Arbeitszeit').press('Enter')
  await expect(page.getByTestId('day-diff')).toHaveText('±0:00')

  // Woche KW 42: 9:00 + 4:09 gearbeitet; Soll 4 × 8:18 + 4:09 = 37:21; max. 45:00
  const week = page.getByTestId('week-line')
  await expect(week).toContainText('KW 42 (12.10.–18.10.)')
  await expect(page.getByTestId('week-worked')).toHaveText('13:09')
  await expect(page.getByTestId('week-to-target')).toHaveText('24:12')
  await expect(page.getByTestId('week-to-max')).toHaveText('31:51')

  // Mi: noch nichts erfasst (nur Vorlage)
  await page.goto('/#/tag/2026-10-14')
  await expect(page.getByTestId('planned-block')).toHaveCount(2)
  await expect(page.getByTestId('balance-line')).toContainText('noch nichts erfasst')
  await expect(page.getByTestId('day-diff')).toHaveText('−8:18')

  // Monat: Soll-Zeile, Differenz, Feiertag markiert
  await page.goto('/#/monat/2026-10')
  await expect(page.getByTestId('target-2026-10-12')).toHaveText('8:18')
  await expect(page.getByTestId('target-2026-10-13')).toHaveText('4:09')
  await expect(page.getByTestId('target-2026-10-13')).toHaveClass(/is-holiday/)
  await expect(page.getByTestId('target-2026-10-17')).toHaveText('')
  await expect(page.getByTestId('diff-2026-10-09')).toHaveText('') // nichts erfasst
  await expect(page.getByTestId('diff-2026-10-12')).toHaveText('+0:42')
  await expect(page.getByTestId('diff-2026-10-14')).toHaveText('') // nur Vorlage, nichts erfasst
  await page.screenshot({ path: 'test-results/ueberstunden-monat.png', fullPage: true })

  await page.goto('/#/tag/2026-10-12')
  await page.screenshot({ path: 'test-results/ueberstunden-tag.png' })
})
