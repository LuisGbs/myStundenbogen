import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

// In der Cloud-Entwicklungsumgebung ist Chromium vorinstalliert.
const preinstalledChromium = '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  use: {
    baseURL: 'http://localhost:4173/',
    locale: 'de-CH',
    timezoneId: 'Europe/Zurich',
    launchOptions: existsSync(preinstalledChromium) ? { executablePath: preinstalledChromium } : {},
  },
  // Gegen den Produktions-Build testen, damit die Content-Security-Policy aktiv ist.
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
