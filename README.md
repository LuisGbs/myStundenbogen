# Stundenbogen

Persönliche Web-App, um jeden Tag schnell festzuhalten, **wie lange** gearbeitet wurde und **auf welche Projekte** die Zeit gehört – damit am Monatsende eine saubere Tabelle zum Übertragen in die Firmensoftware bereitliegt.

## Funktionen

- **Tag**
  - Arbeitszeit über Stempel-Blöcke (Kommen/Gehen, Pausen sind die Lücken) oder als Gesamtzeit.
  - „Kommen (jetzt)“ / „Gehen (jetzt)“ für das Live-Stempeln.
- **Projektverteilung** pro Zeile in `h:mm`, `%` des Tages, als **Rest** (des Tages) oder **Block-Rest** (Rest seines Stempel-Blocks). Eingaben wie `1:30`, `1.5`, `.5`, `90m`, `50%`.
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
- **Gehen (heute) – eine Zeile:** Uhrzeit, zu der Soll (z.B. 8:18) und Ziel (Arbeitszeit der Vorlage, z.B. 9:00) erreicht sind – immer mit einer Pause von mindestens 30 min am Stück (noch nicht genommen → eingerechnet; in der Pause frühestens nach 30 min weiter). Eingestempelt steht daneben „Geplant [16:30] → 8:50 (+0:32)“: vorbelegt mit dem Ende der Vorlage, änderbar (z.B. für den Zug), Antippen einer Soll/Ziel-Kachel übernimmt deren Zeit. Die Zeitleiste reicht bis „Geplant“, der Teil nach „jetzt“ ist grau.
- **„Gerade“ (nur heute):** Projekt antippen → es läuft mit, solange du eingestempelt bist (als „Rest im Block“ am Ende des laufenden Blocks). Wechsel zu einem anderen Projekt hält das alte mit seiner Zeit an, „Anhalten“ ebenso; „Gehen (jetzt)“ beendet es. Nicht eingestempelt: Antippen stempelt gleich ein.
- **Zeitleiste** im Tag
  - Die Stempel-Blöcke erscheinen als Balken. Projekte zieht man direkt in einen Block; sie liegen dort lückenlos hintereinander.
  - Den rechten Rand eines Projekts ziehen (oder Pfeiltasten): Die folgenden Projekte rücken nach und behalten ihre Länge; länger geht nur, bis das letzte ans Blockende stößt.
  - Klick auf ein Projekt: Dauer direkt eintragen (wird auf den Platz im Block begrenzt), Büro/Meeting, Entfernen.
  - **Ganze Segmente ziehen**: innerhalb eines Blocks umsortieren oder in einen anderen Block (Einfügemarke zeigt die Stelle; zu wenig Platz → Dauer wird begrenzt).
  - **Jede Zeile steht in einem Block**, in der Reihenfolge der Liste – egal ob h:mm, %, Rest, Block-Rest oder Zeitleiste. Zeilen ohne festen Block (neu hinzugefügt) kommen in den Block, in dem gerade Platz ist.
  - **Rest im Block** (im Panel oder Modus „Block-Rest“): bekommt, was in seinem Block neben allen anderen Zeilen (auch h:mm und %) frei ist, und wächst/schrumpft mit.
  - Der Modus bestimmt nur, wie die Dauer entsteht und ob die Zeile oben ziehbar ist: **Zeitleiste** und Block-Rest lassen sich oben verschieben, h:mm/%/Rest erscheinen oben blass und gesperrt (Klick → „Auf Zeitleiste übernehmen“). Umstellen verschiebt nichts.
  - Die Liste ist nach Blöcken gruppiert (z.B. „07:00–11:33“, „12:03–16:30“). Mit dem Griff ≡ (ziehen oder ↑/↓) verschiebt man jede Zeile – im Block oder in einen anderen Block.
  - Gleiches Projekt + Tätigkeit vor und nach der Pause: je Block eine Zeile mit „Σ“ (Summe); im Monat und im Export ist es eine Zeile.
  - Die offene Zeit ist gestreift.
- **Soll & Überstunden:** Soll je Wochentag (Standard 8:18 Mo–Fr = 41:30). Tagesansicht zeigt Soll und Tagesdifferenz sowie die **Woche** (gearbeitet, noch bis Soll, noch bis zur Höchstarbeitszeit, Standard 45 h), die Monatstabelle eine Soll- und Differenz-Zeile. Einen Gesamtsaldo gibt es bewusst nicht – der kommt aus der Firmensoftware. Urlaub/Krank/Überstundenabbau sind normale Projekte.
- **Feiertage je Arbeitsort:** Schweiz – Basel-Landschaft, Deutschland – Baden-Württemberg, Bayern, Rheinland-Pfalz (offline berechnet). Einzelne Tage abschaltbar, optionale zuschaltbar (z.B. Berchtoldstag), eigene ganze/halbe Tage. An Feiertagen kein Soll und keine Vorlage.
- **Geplanter Arbeitstag:** Ist an einem Werktag noch nichts gestempelt, steht die Vorlage (Standard 07:00–11:33 und 12:03–16:30 = 9:00, also +0:42 pro Tag, in den Einstellungen änderbar) grau als „geplant“ da. Man kann schon Projekte verteilen; jede nachgetragene Stempelzeit macht den Block echt, „Plan übernehmen“ alle auf einmal. Im Monat sind geplante Tage grau/kursiv mit „~“.
- **Notiz pro Eintrag:** ✎ an jeder Zeile oder im Zeitleisten-Panel; in der Monatstabelle als Tooltip (Ecke markiert).
- **Rückgängig / Wiederholen** für alle Änderungen an Tagen: Knöpfe ↶ ↷ oben rechts oder **Strg+Z** / **Strg+Y** (bzw. Strg+Shift+Z). Gilt, solange die Seite offen ist.
- **Projekte** anlegen, umbenennen, per Griff ≡ sortieren (ziehen oder ↑/↓), aktivieren/deaktivieren; Tätigkeitsarten ebenso. Inaktive bleiben in alten Monaten sichtbar.
- **Aufgaben (eigener Reiter, getrennt von den Stunden):** je Projekt Aufgaben mit Stichpunkten (Checkliste). Enter legt direkt den nächsten Stichpunkt an, Griff ≡ sortiert, Fortschritt „2/5“, Notiz je Aufgabe, Erledigtes eingeklappt, Löschen mit „Rückgängig“. „Alle“ zeigt die offenen Aufgaben aller Projekte. Läuft am Tag ein Projekt („Gerade“), stehen dessen offene Punkte direkt darunter – abhakbar, neue schnell notierbar. Aufgaben sind Teil der Sicherung.
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
- **Phase 2 (fertig):** Soll-Zeit und Überstundenkonto, Feiertage je Arbeitsort (Urlaub/Krank laufen als Projekte)
- **Notizen pro Eintrag (fertig)**
- **Phase 3:**
  - Offline-App (PWA)
  - Tastaturkürzel
  - „Vortag übernehmen“
  - Monat als „übertragen“ abhaken
  - optional: verschlüsselte Sicherungsdatei
