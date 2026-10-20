# CLAUDE.md – Hinweise für die Weiterentwicklung

Persönliche Stundenbogen-App (React 19 + TypeScript + Vite, Daten in IndexedDB via Dexie). Wird statisch auf GitHub Pages ausgeliefert. Oberfläche und Code-Kommentare sind auf **Deutsch**.

## Grundregeln

- **Daten verlassen nie den Rechner.**
  - Keine Server, keine CDNs, keine Analytics, keine externen Schriften/Skripte.
  - Die CSP in `vite.config.ts` erzwingt das. Nicht lockern.
- **Zeiten sind immer ganze Minuten** (`Minutes` = Integer), Uhrzeiten `'HH:MM'`, Daten `'YYYY-MM-DD'` (`ISODate`).
  - Formatierung nur über `domain/duration.ts`.
  - Datumsrechnung nur über `domain/date.ts` (UTC-basiert, kein `new Date('YYYY-MM-DD')`).
- **Rechenlogik gehört nach `src/domain/`.**
  - Reine Funktionen ohne React/Dexie.
  - Jede Änderung mit Vitest-Test (`*.test.ts` daneben).
- **Datenmodell ändern** (`domain/types.ts`) heißt immer:
  1. neue `this.version(n)` in `storage/db.ts` anhängen (alte nie verändern)
  2. `SCHEMA_VERSION` in `storage/exportImport.ts` erhöhen
  3. `MIGRATIONS[n-1]` ergänzen, damit alte Sicherungsdateien importierbar bleiben
- Schreibzugriffe nur über `storage/repo.ts`. Tage immer per `updateDay(date, fn)` ändern: liest, ändert, speichert in einer Transaktion und löscht leere Tage. Nur so landet die Änderung auch im Rückgängig-Verlauf (`storage/history.ts`).
- App-Icons werden aus `public/favicon.svg` erzeugt: `node scripts/make-icons.mjs`.
- UI liest per Hooks aus `storage/hooks.ts` (`useLiveQuery`), aktualisiert sich daher automatisch.
- Texteingaben, die asynchron gespeichert werden, über `CommitInput` / `TimeInput` (`components/inputs.tsx`), nicht als einfach kontrollierte Inputs.
- Routing über Hash (`lib/router.ts`). Vite `base: './'` – funktioniert unter jedem Repo-Namen.

## Befehle

```bash
npm run check   # oxlint + tsc + vitest
npm run e2e     # Playwright gegen den Produktions-Build (CSP aktiv)
npm run build
```

In der Cloud-Umgebung nutzt Playwright das vorinstallierte Chromium unter `/opt/pw-browsers/chromium` (siehe `playwright.config.ts`).

## Fachliches

- Soll-Zeit: 41,5 h/Woche = 8:18 Mo–Fr, Höchstarbeitszeit 45 h/Woche; Vorlage „normaler Arbeitstag“ 07:00–11:33 + 12:03–16:30 (9:00, bewusst +0:42 Überstunden).
- Datenbank-Updates (Dexie `.upgrade`) arbeiten mit festen Konstanten (z.B. `TEMPLATE_9H`), nie mit dem aktuellen Standardwert – sonst ändern alte Migrationen ihr Verhalten.
- Einstellungen, die auf dem bisherigen Wert aufbauen, über `changeSettings(fn)` speichern (nicht `updateSettings` mit dem angezeigten Stand).
- Feiertage: je nach Arbeitsort (`domain/holidays.ts`: CH-BL, DE-BW, DE-BY, DE-RP), Soll und Wochenübersicht in `domain/target.ts` (bewusst kein Gesamtsaldo).
- Urlaub, Krankheit, Überstundenabbau sind in der Firmensoftware normale Projekte – keine Sonderlogik dafür bauen.
- Buchungsziel: Projekt + Tätigkeitsart (Büro/Meeting).
- Zeitleiste (`domain/timeline.ts`): Reihenfolge im `allocations`-Array = Reihenfolge im Block. Verschieben (Zeitleiste und Griff in der Liste) nur über `moveAllocation`.
- Verteilung (`domain/allocation.ts`), in dieser Reihenfolge:
  1. feste Dauern und Prozentwerte; „Rest im Block“ (`mode: 'rest'` + `blockId`) bekommt den freien Platz seines Blocks
  2. Rest-Zeilen teilen sich den Rest; ohne Rest-Zeile wird optional proportional aufgefüllt
  3. Largest-Remainder-Rundung, sodass die Summe minutengenau stimmt
- Fahrplan: siehe README.
