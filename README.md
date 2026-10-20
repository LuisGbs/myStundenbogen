# Stundenbogen

Persönliche Web-App, um jeden Tag schnell festzuhalten, **wie lange** gearbeitet wurde und **auf welche Projekte** die Zeit gehört – damit am Monatsende eine saubere Tabelle zum Übertragen in die Firmensoftware bereitliegt.

## Funktionen

- **Tag**
  - Arbeitszeit über Stempel-Blöcke (Kommen/Gehen, Pausen sind die Lücken) oder als Gesamtzeit.
  - „Kommen (jetzt)“ / „Gehen (jetzt)“ für das Live-Stempeln.
- **Projektverteilung** pro Zeile in `h:mm`, `%` des Tages oder als **Rest**.
  - Alles rechnet sofort neu, wenn sich die Arbeitszeit ändert.
  - Gerechnet wird minutengenau, und die Summe stimmt immer exakt.
- **Auffüllen** auf drei Arten:
  - eine Zeile auf „Rest“ stellen
  - Rest auf ein Standardprojekt buchen
  - offene Zeit proportional auf alle Zeilen verteilen
- **Projekt → Tätigkeitsart** (Büro / Meeting, erweiterbar). Jede Kombination ist ein eigener Eintrag.
- **Monatstabelle**
  - Tage nach rechts, Projekte und Tätigkeiten nach unten, Summen, Hinweise auf offene Tage.
  - „Tabelle kopieren“ (direkt in Excel einfügen) und CSV-Export.
- **Zeitleiste** im Tag
  - Die Stempel-Blöcke erscheinen als Balken. Projekte zieht man direkt in einen Block; sie liegen dort lückenlos hintereinander.
  - Den rechten Rand eines Projekts ziehen (oder Pfeiltasten): Die folgenden Projekte rücken nach und behalten ihre Länge; länger geht nur, bis das letzte ans Blockende stößt.
  - Klick auf ein Projekt: Büro/Meeting, ¼ ½ ¾ Ganz des Blocks, Entfernen.
  - Zeilen ohne Block (Rest, %) füllen den freien Platz blass auf, die offene Zeit ist gestreift.
- **Rückgängig / Wiederholen** für alle Änderungen an Tagen: Knöpfe ↶ ↷ oben rechts oder **Strg+Z** / **Strg+Y** (bzw. Strg+Shift+Z). Gilt, solange die Seite offen ist.
- **Projekte** anlegen, umbenennen, sortieren, aktivieren/deaktivieren. Inaktive bleiben in alten Monaten sichtbar.
- **Projektliste teilen**
  - „Exportieren …“ speichert ausgewählte Projekte (Name, Nummer, Farbe) und die Tätigkeitsarten – ohne Stunden und Tage – z.B. für Kollegen.
  - „Importieren …“ liest so eine Liste ein. Man hakt an, was übernommen wird; schon vorhandene Projekte (gleiche Nummer oder gleicher Name) sind abgewählt.

Eingabeformate: `8:18`, `8,3` (Dezimalstunden), `8h18`, `90m`, `50%`, `rest`.

## Datenschutz & Speicherung

| Was | Wo |
|---|---|
| Programmcode | GitHub Pages (öffentlich – enthält **keine** Daten) |
| Deine Daten | nur im Browser auf deinem PC (IndexedDB) |
| Automatische Sicherung | Ordner deiner Wahl auf dem PC: `stundenbogen.json` + `backups/stundenbogen-JJJJ-MM-TT.json` (30 Tage) |

- Die App sendet nichts an einen Server. Eine Content-Security-Policy im Build verbietet dem Browser zusätzlich jede Verbindung zu fremden Adressen.
- Die automatische Sicherung braucht **Chrome oder Edge** (File System Access API). Nach einem Browser-Neustart muss die Sicherung evtl. mit einem Klick bestätigt werden.
- Gehen die Browserdaten verloren: App öffnen → „Aus Sicherungsordner wiederherstellen“.

## Einrichtung (einmalig)

1. Repo **öffentlich** machen: *Settings → General → Danger Zone → Change visibility*. Öffentlich wird nur der Code, nicht deine Daten.
2. GitHub Pages einschalten: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. Ab dann veröffentlicht jeder Push auf `main` die App automatisch unter `https://<benutzername>.github.io/<repo-name>/`.
4. Die App im Browser öffnen, „Neu beginnen“ wählen, dann den Sicherungsordner verbinden.
5. Tipp: In Chrome/Edge über das Menü **„App installieren“** wählen. Dann startet die App in einem eigenen Fenster mit eigenem Icon. (Wurde sie vor dem Icon-Update installiert: einmal deinstallieren und neu installieren.)

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run check      # Lint + Typprüfung + Unit-Tests
npm run e2e        # Browser-Tests (baut vorher)
npm run build      # Produktions-Build nach dist/
```

Aufbau:

```
src/
  domain/      Reine Rechenlogik ohne UI (Dauern, Verteilung, Monat) – mit Tests
  storage/     IndexedDB (Dexie), Sicherung, Export/Import, React-Hooks
  features/    Seiten: day, month, projects, settings, welcome
  components/  Wiederverwendbare UI-Bausteine
  lib/         Routing, Browser-Helfer
e2e/           Playwright-Tests
```

Jede Änderung läuft über einen Branch und einen Pull Request. Die GitHub Action prüft automatisch (Lint, Typen, Unit- und Browser-Tests). Erst ein Merge auf `main` veröffentlicht.

## Fahrplan

- **Phase 1 (fertig):** Tag, Verteilung, Auffüllen, Monatstabelle mit Export, Projekte, Sicherung
- **Phase 2:**
  - Soll-Zeit (8:18 Mo–Fr) und Überstundenkonto
  - Feiertage Basel-Landschaft und Wochenenden
  - Urlaub, Krank, Abwesenheit (auch halbe Tage)
  - Notizen pro Eintrag
- **Phase 3:**
  - Offline-App (PWA)
  - Tastaturkürzel
  - „Vortag übernehmen“
  - Monat als „übertragen“ abhaken
  - optional: verschlüsselte Sicherungsdatei
