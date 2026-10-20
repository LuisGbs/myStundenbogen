import { expect, test } from '@playwright/test'

test('App-Manifest und Icons sind vorhanden (für Taskleiste / installierte App)', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifestResponse = await request.get(new URL(href!, page.url()).toString())
  expect(manifestResponse.status()).toBe(200)
  const manifest = await manifestResponse.json()
  expect(manifest.name).toBe('Stundenbogen')
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toContain('maskable')

  for (const icon of manifest.icons) {
    const response = await request.get(new URL(icon.src, new URL(href!, page.url())).toString())
    expect(response.status(), icon.src).toBe(200)
  }
  const size = await page.evaluate(async () => {
    const img = new Image()
    img.src = 'icon-512.png'
    await img.decode()
    return [img.naturalWidth, img.naturalHeight]
  })
  expect(size).toEqual([512, 512])
})
