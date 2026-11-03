# Architektur – Questlog

Dieses Dokument ist der **verbindliche Vertrag** zwischen den Schichten. Wer eine Schicht baut, hält sich an die hier festgelegten Dateinamen, Exporte und Signaturen.

## Stack

React 19 + TypeScript 7 + Vite 8 · Tailwind CSS 4 (`@tailwindcss/vite`, Theme per `@theme` in `src/index.css`) · Dexie 4 (+ `dexie-react-hooks`) für IndexedDB · `zod` 4 für Import-Validierung · `react-router` 7 (`createHashRouter`, nötig für GitHub Pages) · `motion` (`import { motion, AnimatePresence, MotionConfig } from 'motion/react'`) · `lucide-react` für UI-Icons (Emojis nur für Quest-, Kampagnen- und Avatar-Icons) · `vite-plugin-pwa` · Vitest (+ Testing Library, jsdom, `fake-indexeddb`) · Linter: oxlint.

Befehle: `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run check` (lint + typecheck + test).

Konventionen:
- **UI-Texte auf Deutsch**, Code-Bezeichner auf Englisch. Kommentare dürfen deutsch sein.
- Relative Imports ohne Dateiendung (`import { x } from '../domain/dates'`). `import type` für reine Typen (`verbatimModuleSyntax`).
- `erasableSyntaxOnly` ist aktiv: **keine** `enum`s, keine Parameter-Properties, keine Namespaces.
- Tests liegen neben dem Code (`foo.ts` → `foo.test.ts`) und importieren `describe/it/expect` explizit aus `vitest`. Standard-Umgebung ist `node`; Komponenten-Tests beginnen mit `// @vitest-environment jsdom`.
- Zahlen in der UI mit `toLocaleString('de-DE')` formatieren.

## Verzeichnisstruktur

```
src/
  domain/        Reine Spiellogik, keine Abhängigkeit zu React/Dexie/DOM
    types.ts         Datenmodell + abgeleiteter Zustand (fix, siehe Datei)
    balancing.ts     Alle Spielzahlen, Ränge, Defaults (fix)
    attributes.ts    Metadaten der 6 Attribute (fix)
    dates.ts         Spieltage (DayKey) & Kalender-Arithmetik
    leveling.ts      XP-Kurven, Level, Ränge
    schedule.ts      Wann ist eine Quest aktiv/fällig, Wochenfortschritt
    streaks.ts       Streak-Berechnung
    chapters.ts      Auswertung von Kampagnen-Kapiteln
    engine.ts        deriveGameState / getDayState
  data/          Persistenz (IndexedDB via Dexie) & React-Hooks
    db.ts            Dexie-Datenbank
    repository.ts    Alle schreibenden Operationen
    backup.ts        Export/Import (JSON, zod-validiert)
    seed.ts          Vorlage-Kampagne "Der Weg des Gelehrten"
    hooks.ts         useGameData / useToday / useGame
    ids.ts           newId()
  ui/            Wiederverwendbare, rein darstellende Komponenten (Design-System)
  app/           App-Rahmen: Router, Layout, Navigation
  features/      Seitenübergreifende Features (z. B. Level-Up-Feedback)
  pages/         Eine Datei/Ordner pro Seite
  test/setup.ts  Vitest-Setup (jest-dom)
```

## Domain-API (`src/domain`)

Alle Funktionen sind **rein** (keine Seiteneffekte, kein `Date.now()`, keine Zufälle). Zeit kommt immer als Parameter herein.

### `dates.ts`
DayKeys sind `'YYYY-MM-DD'`. Kalender-Arithmetik intern über UTC (`Date.UTC`), damit Sommer-/Winterzeit nichts verschiebt.
```ts
export function toDayKey(now: Date, dayStartHour: number): DayKey
  // Lokale Zeit. Ist now.getHours() < dayStartHour, gehört der Moment zum Vortag.
export function isValidDayKey(value: string): boolean
export function addDays(day: DayKey, n: number): DayKey
export function diffDays(from: DayKey, to: DayKey): number   // to - from in Tagen
export function isoWeekday(day: DayKey): IsoWeekday          // 1 = Mo … 7 = So
export function startOfWeek(day: DayKey): DayKey             // Montag derselben ISO-Woche
export function dayRange(from: DayKey, to: DayKey): DayKey[] // inklusive beider Enden, [] wenn from > to
export function compareDays(a: DayKey, b: DayKey): number    // <0, 0, >0
export function formatDay(day: DayKey, style?: 'long' | 'short'): string
  // de-DE, z. B. long: "Dienstag, 3. November 2026", short: "3. Nov."
```

### `leveling.ts`
```ts
export function xpToNextLevel(level: number): number          // round(100 × level^1.5)
export function levelFromXp(totalXp: number): LevelInfo
export function xpToNextAttributeLevel(level: number): number // round(40 × level^1.25)
export function attributeLevelFromXp(totalXp: number): LevelInfo
export function rankForLevel(level: number): string
```
Level beginnt bei 1 mit 0 XP. Beispiel: 100 XP → Level 2 mit 0 XP ins Level. Werte aus `BALANCING`.

### `schedule.ts`
```ts
export function isActiveOn(habit: Habit, day: DayKey): boolean
  // createdDay ≤ day und (kein archivedDay oder day < archivedDay)
export function isRequiredOn(habit: Habit, day: DayKey): boolean
  // aktiv UND (daily ODER weekdays mit passendem Wochentag). Wochenquests: false.
export function isVisibleOn(habit: Habit, day: DayKey): boolean
  // aktiv UND (isRequiredOn ODER schedule.type === 'weekly')
export function questXp(difficulty: Difficulty): number
export function isDone(c: Pick<Completion, 'value' | 'target'>): boolean  // value ≥ target
export function habitTarget(habit: Habit): number                          // measure?.target ?? 1
export function describeSchedule(schedule: Schedule): string
  // "Täglich", "Mo, Mi, Fr", "3× pro Woche"
```

### `streaks.ts`
```ts
export function computeStreak(habit: Habit, doneDays: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey): Streak
```
- `doneDays`: Tage, an denen die Quest erledigt war. Betrachtet wird nur `[max(habit.createdDay, from), asOf]`.
- daily/weekdays (unit `'day'`): zählt aufeinanderfolgende **planmäßige** Tage (Nicht-Plantage werden übersprungen, brechen nichts). Ist `asOf` planmäßig und noch nicht erledigt, bricht das die aktuelle Serie nicht (Tag läuft noch) – gezählt wird dann ab dem vorherigen Plantag. Tage nach `archivedDay` zählen nicht.
- weekly (unit `'week'`): eine Woche (Mo–So) zählt, wenn erledigte Tage ≥ `times`. Die Woche von `asOf` zählt, falls schon erfüllt; ist sie noch nicht erfüllt, bricht sie nichts.
- `best` = längste Serie im Zeitraum (inkl. aktueller).

### `chapters.ts`
```ts
export function evaluateChapter(chapter: Chapter, quest: MainQuest, ctx: ChapterContext): ChapterState
export interface ChapterContext {
  habitsById: ReadonlyMap<string, Habit>
  completionsByHabit: ReadonlyMap<string, Completion[]> // je Quest nach day aufsteigend sortiert
  today: DayKey
}
```
- manual: current = manualDone ? 1 : 0, target 1, doneDay = completedDay.
- counter: current = counter ?? 0, target = criterion.target, done = current ≥ target.
- habit: nur Completions mit `quest.startDay ≤ day ≤ today`. completions = Anzahl erledigter; total = Summe aller `value`; streak = `computeStreak(...).best` mit `from = quest.startDay`. `doneDay` = erster Tag, an dem das Ziel erreicht war. Fehlt die Quest: `brokenReference: true`, current 0, nicht erledigt.

### `engine.ts`
```ts
export function getDayState(data: GameData, day: DayKey): DayState
export function deriveGameState(data: GameData, today: DayKey): GameState
```
XP-Regeln:
1. Jede erledigte Completion (`value ≥ target`) mit `day ≤ today` gibt `questXp(c.difficulty)` → Charakter-XP **und** dieselbe Menge Attribut-XP für `c.attribute`. Teilfortschritt gibt 0 XP. Zu Completions gelöschter Quests: werden ignoriert.
2. Perfekter Tag: für jeden Tag `d` von (frühester Tag mit Completion oder `profile.createdDay`) bis `today`: Pflicht-Quests = `isRequiredOn(h, d)`. Perfekt ⇔ ≥ 1 Pflicht-Quest und alle erledigt. Bonus = `round(perfectDayBonus × Quest-XP dieses Tages)` (Quest-XP umfasst alle an `d` erledigten Quests, auch Wochenquests). Nur Charakter-XP.
3. Kapitel: `chapterXp` pro abgeschlossenem Kapitel, `mainQuestXp` pro komplett abgeschlossener Kampagne (auch archivierte). Nur Charakter-XP.
4. `adventureDay = diffDays(profile.createdDay, today) + 1` (ohne Profil: 1).
5. `getDayState` sortiert sichtbare Quests nach `order` (dann `title`); Streaks werden **zum Stichtag `day`** berechnet.

## Daten-API (`src/data`)

### `db.ts`
```ts
export class QuestlogDB extends Dexie {
  habits!: Table<Habit, string>             // '&id, order, mainQuestId'
  completions!: Table<Completion, string>   // '&id, habitId, day'
  mainQuests!: Table<MainQuest, string>     // '&id'
  kv!: Table<{ key: string; value: unknown }, string>  // '&key'  – Schlüssel 'profile' und 'settings'
}
export const db: QuestlogDB   // Datenbankname 'questlog'
```

### `repository.ts`
Alle Funktionen `async`, nutzen `db` (ein optionaler letzter Parameter `database = db` ist erlaubt, damit Tests eine eigene Instanz verwenden können).
```ts
export async function loadGameData(): Promise<GameData>        // settings mit DEFAULT_SETTINGS gemergt
export async function saveProfile(profile: CharacterProfile): Promise<void>
export async function updateSettings(patch: Partial<Settings>): Promise<void>

export type HabitDraft = Omit<Habit, 'id' | 'order' | 'createdDay' | 'archivedDay'>
export async function createHabit(draft: HabitDraft, today: DayKey): Promise<Habit>   // order = max+1
export async function updateHabit(id: string, patch: Partial<HabitDraft>): Promise<void>
export async function archiveHabit(id: string, today: DayKey): Promise<void>   // archivedDay = today
export async function restoreHabit(id: string): Promise<void>                  // archivedDay entfernen
export async function deleteHabit(id: string): Promise<void>                   // löscht auch alle Completions
export async function moveHabit(id: string, direction: 'up' | 'down'): Promise<void> // tauscht order mit Nachbar (aktive Quests)

export async function setCompletionValue(habitId: string, day: DayKey, value: number): Promise<void>
  // value ≤ 0 → Eintrag löschen; sonst upsert mit Snapshots (target/difficulty/attribute) der aktuellen Quest.
export async function toggleCompletion(habitId: string, day: DayKey): Promise<void>
  // Abhak-Quest: 0 ↔ 1. Messbare Quest: erledigt → löschen, sonst → value = target.

export type MainQuestDraft = Omit<MainQuest, 'id' | 'createdAt'>
export async function createMainQuest(draft: MainQuestDraft): Promise<MainQuest>
export async function updateMainQuest(id: string, patch: Partial<MainQuestDraft>): Promise<void>
export async function deleteMainQuest(id: string): Promise<void>   // entfernt mainQuestId bei verknüpften Quests
export async function setChapterManual(questId: string, chapterId: string, done: boolean, today: DayKey): Promise<void>
export async function setChapterCounter(questId: string, chapterId: string, value: number, today: DayKey): Promise<void>
  // value wird auf ≥ 0 begrenzt; completedDay wird gesetzt, wenn das Ziel erreicht wird, und entfernt, wenn nicht mehr.

export async function resetAllData(): Promise<void>
```

### `backup.ts`
```ts
export const BACKUP_APP_ID = 'questlog'
export const BACKUP_SCHEMA_VERSION = 1
export interface BackupFile { app: 'questlog'; schemaVersion: number; exportedAt: string; data: GameData }
export async function createBackup(now?: Date): Promise<BackupFile>
export function parseBackup(json: unknown): { ok: true; backup: BackupFile } | { ok: false; error: string }
  // zod-validiert, deutschsprachige Fehlermeldung
export async function restoreBackup(backup: BackupFile): Promise<void>   // ersetzt ALLE Daten in einer Transaktion
export function backupFileName(now: Date): string                      // "questlog-backup-2026-11-03.json"
```

### `seed.ts`
```ts
export function createScholarCampaign(today: DayKey): { mainQuest: MainQuest; habits: Habit[] }
export async function installScholarCampaign(today: DayKey): Promise<void>
```

### `hooks.ts`
```ts
export function useGameData(): GameData | undefined       // live (useLiveQuery), undefined während des Ladens
export function useToday(dayStartHour: number): DayKey    // aktualisiert sich beim Tageswechsel (Intervall + visibilitychange)
export function useGame(): { data: GameData; today: DayKey; state: GameState } | undefined
  // state per useMemo aus deriveGameState(data, today)
```

## UI-Schicht

- `src/ui/` enthält das Design-System (Buttons, Karten, Fortschrittsbalken, Dialoge, Formularfelder, Emoji-Auswahl, Toasts …). Seiten verwenden **nur** diese Bausteine statt eigene Grundelemente zu bauen.
- Theme „Dark Fantasy“: dunkles Braun-Schwarz, Gold-Akzente, Pergament-Text; Überschriften in *Cinzel*, Fließtext in *Inter*. Farben als Tailwind-Theme-Tokens in `src/index.css`.
- Mobile first: funktioniert ab 360 px Breite, untere Navigationsleiste auf dem Handy, Seitenleiste/obere Leiste auf dem Desktop.
- `MotionConfig reducedMotion="user"`; Effekte zusätzlich über `settings.effects` abschaltbar.

Routen (Hash-Router): `/` Heute (Dashboard) · `/quests` Quests verwalten · `/kampagne` Kampagne · `/held` Charakter · `/einstellungen` Einstellungen. Ohne Profil wird das Onboarding angezeigt.

## App-Ebene (`src/app`) – Spielzustand & Gate

- `App.tsx`: `AppErrorBoundary` → `ToastProvider` → `GameProvider` → `EffectsConfig` (setzt `settings.effects` um) → `ProfileGate` (ohne Profil: `OnboardingPage`, sonst Router + `GameFeedback`).
- **Seiten und Features holen Daten ausschließlich über `useGameContext()`** aus `src/app/gameContext.ts` → `{ data, today, state }`. Nie selbst `useGame()`/`useGameData()` aufrufen (sonst mehrfache Berechnung).
- Schreiben ausschließlich über `src/data/repository.ts` (bzw. `seed.ts`/`backup.ts`). Die Funktionen werfen deutsche `Error`s → abfangen und per `useToast()` mit `tone: 'error'` anzeigen. Nach dem Schreiben aktualisiert sich der Zustand automatisch (Live-Query) – kein manuelles Neuladen.
- `GameFeedback` (`src/features/feedback`) sitzt **außerhalb** des RouterProviders: dort keine Router-Hooks verwenden. Es erkennt Änderungen am Spielzustand (XP, Level-Up, Perfekter Tag, Kapitel) und zeigt die Rückmeldungen zentral – Seiten zeigen dafür **keine eigenen** XP-Toasts, höchstens lokale Mikro-Animationen.
- Router-Hooks/Komponenten immer aus `'react-router'` importieren (nicht `'react-router/dom'`).

## Tests & Entwicklung

- Komponenten-Tests: `// @vitest-environment jsdom`, `import 'fake-indexeddb/auto'`, `afterEach(cleanup)` (keine Vitest-Globals), Animationen per `MotionGlobalConfig.skipAnimations = true` aus. Seiten mit `renderWithGame(<Seite />, { route })` aus `src/test/renderWithGame.tsx` rendern; Daten vorher mit `resetAllData()` + Repository-Funktionen anlegen.
- Im Dev-Server (`npm run dev`) gibt es `window.questlog` (`src/dev/devtools.ts`): `await questlog.seedDemo(30)` legt einen Demo-Helden mit 30 Tagen Verlauf an, `await questlog.reset()` löscht alles. Ideal für Screenshots mit Playwright.
