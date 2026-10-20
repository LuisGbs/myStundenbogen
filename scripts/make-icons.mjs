// Erzeugt die PNG-App-Icons aus public/favicon.svg (bei Logo-Änderungen erneut ausführen):
//   node scripts/make-icons.mjs
import { chromium } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

const svg = readFileSync('public/favicon.svg', 'utf8')
// Für „maskable“ und Apple: randlose blaue Fläche, Uhr in der sicheren Zone (Mitte 80 %).
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect[^>]*\/>/, '')
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#2563eb"/>
  <g transform="translate(16 16) scale(0.95) translate(-16 -16)">${inner}</g>
</svg>`

const icons = [
  { file: 'public/icon-192.png', size: 192, svg },
  { file: 'public/icon-512.png', size: 512, svg },
  { file: 'public/icon-maskable-512.png', size: 512, svg: fullBleed },
  { file: 'public/apple-touch-icon.png', size: 180, svg: fullBleed },
]

const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath })
for (const icon of icons) {
  const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${icon.svg.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`,
  )
  await page.screenshot({ path: icon.file, omitBackground: true })
  await page.close()
  console.log('geschrieben:', icon.file)
}
await browser.close()
