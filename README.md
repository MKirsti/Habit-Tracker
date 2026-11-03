# ⚔️ Questlog

**Dein Leben als Rollenspiel.** Questlog ist ein Habit-Tracker im RPG-Stil: Gewohnheiten sind Quests, du sammelst XP, steigst im Level auf, trainierst sechs Attribute und arbeitest Kapitel für Kapitel auf ein großes Ziel hin – deine Kampagne.

Die App läuft im Browser, lässt sich auf dem Handy wie eine App installieren, funktioniert offline und speichert alle Daten ausschließlich auf deinem Gerät.

## Was drin ist (MVP / Phase 1)

- **Held** mit Name, Avatar, Level, Rang-Titel und sechs Attributen (Stärke, Intelligenz, Weisheit, Charisma, Vitalität, Disziplin)
- **Quests** täglich, an bestimmten Wochentagen oder X-mal pro Woche – zum Abhaken oder messbar (z. B. „10 Seiten“), mit Schwierigkeit (Leicht 10 XP bis Episch 80 XP) und Streaks 🔥
- **Perfekter Tag:** +25 % Bonus-XP, wenn alle Tagesquests erledigt sind
- **Nachtragen:** gestern vergessen? Bis zu einem Tag rückwirkend
- **Kampagne** mit Kapiteln: von Hand abhaken, Zähler (z. B. „Bücher beendet 3 / 12“) oder automatisch aus Quests (Anzahl, Gesamtmenge, Streak) – +100 XP pro Kapitel, +500 XP für die ganze Kampagne
- **Vorlage „Der Weg des Gelehrten“:** ein Lese-Jahr mit 5 Quests und 6 Kapiteln
- **Level-Up-Szene, XP-Toasts, Konfetti** (abschaltbar)
- **Einstellbarer Tageswechsel** (z. B. 4 Uhr für Nachteulen), **Backup** als JSON-Datei, Zurücksetzen

Was als Nächstes kommen kann (Gold & Belohnungs-Shop, Lebenspunkte, Erfolge, Boss-Kämpfe, Statistiken …), steht in [`docs/PLAN.md`](docs/PLAN.md).

## Entwicklung

Voraussetzung: Node.js 22.

```bash
npm install
npm run dev        # Entwicklungsserver
npm run check      # Lint + Typecheck + Tests
npm run build      # Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Im Entwicklungsserver gibt es in der Browser-Konsole Hilfsfunktionen:

```js
await questlog.seedDemo(30)   // Demo-Held mit 30 Tagen Verlauf
await questlog.reset()        // alles löschen → Onboarding
```

Architektur, Datenmodell und Spielregeln: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Alle Balancing-Zahlen stehen in [`src/domain/balancing.ts`](src/domain/balancing.ts).

## Veröffentlichen auf GitHub Pages

> [!IMPORTANT]
> **Einmalig von Hand nötig, sonst schlägt jedes Deployment fehl:** GitHub Pages muss im Repository eingeschaltet sein. Das geht nur mit Admin-Rechten in den Repository-Einstellungen – der Workflow selbst darf das nicht.
>
> 1. Auf GitHub im Repository **Settings → Pages** öffnen.
> 2. Unter **Build and deployment → Source** die Option **„GitHub Actions“** wählen (nicht „Deploy from a branch“).
> 3. Unter **Actions → „Deploy to GitHub Pages“** den letzten Lauf öffnen und **„Re-run all jobs“** klicken (oder den nächsten Push abwarten).
>
> Fehlt die Einstellung, bricht der Workflow gleich im Schritt **„Setup Pages“** ab mit *„Get Pages site failed. Please verify that the repository has Pages enabled and configured to build using GitHub Actions …“*.

Danach baut der Workflow [`deploy.yml`](.github/workflows/deploy.yml) bei jedem Push auf den Standard-Branch die App (nach bestandenen Tests) und veröffentlicht sie unter `https://<benutzername>.github.io/Habit-Tracker/`. Pushes auf andere Branches prüft nur die [CI](.github/workflows/ci.yml); sie brechen kein laufendes Deployment ab. Öffne die Seite auf dem Handy und wähle „Zum Home-Bildschirm“ (iPhone: Teilen-Menü) bzw. „App installieren“ (Android/Chrome).

Neue Versionen kommen von selbst: Die App sucht beim Zurückkehren in den Vordergrund (und stündlich) nach einem Update und lädt dann einmal neu. Ist gerade ein Dialog (z. B. ein Quest-Formular) offen, wartet sie, bis er geschlossen ist oder die App in den Hintergrund geht.

> **Hinweis:** Deine Daten liegen nur im Browser des jeweiligen Geräts. Questlog bittet den Browser, sie dauerhaft zu speichern (ob das geklappt hat, steht unter Einstellungen → „App installieren“ – als installierte App klappt es am ehesten). Lade trotzdem regelmäßig ein Backup herunter – damit kannst du auch auf ein anderes Gerät umziehen.
