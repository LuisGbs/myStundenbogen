/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Strenge Content-Security-Policy: Die App darf nur Dateien von der eigenen
// Adresse laden und keine Daten an fremde Server schicken.
// Nur im Build aktiv, weil der Dev-Server Inline-Skripte für Hot-Reload braucht.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relativer Pfad: funktioniert unter jedem Repo-Namen auf GitHub Pages
  // (die App nutzt Hash-Routing, daher liegt index.html immer im Wurzelordner).
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
