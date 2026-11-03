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
    deletion.ts      Löschen einer Quest als reine Funktion (Grabstein) + Vorschau der Folgen
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

### Quest-Verlauf: Rhythmus-Historie & Pausen
Der Spielzustand wird aus der Quest-Konfiguration abgeleitet. Damit Bearbeiten nie verdiente XP, Perfekte Tage oder Streaks kostet, speichert eine Quest (`Habit` in `types.ts`) zwei optionale, **vom Repository gepflegte** Verläufe:
- `scheduleHistory?: { until: DayKey; schedule: Schedule }[]` – aufsteigend nach `until`. Jeder Eintrag ist der Rhythmus, der für die Tage **vor** `until` galt (und ab dem `until` des vorherigen Eintrags). `habit.schedule` gilt ab dem letzten `until`. Ohne Verlauf gilt `habit.schedule` immer.
- `pauses?: { from: DayKey; until: DayKey }[]` – an Tagen mit `from ≤ Tag < until` ist die Quest nicht aktiv (keine Pflicht, nicht sichtbar, Streaks überspringen sie). Entsteht beim Zurückholen einer archivierten Quest (später auch Urlaubsmodus).

Beide Felder sind für Seiten **nur lesend**; `HabitDraft` enthält sie nicht. Alles, was einen Tag in der Vergangenheit bewertet, nutzt `scheduleOn(habit, day)` statt `habit.schedule` (auch die UI für frühere Tage).

### Gelöschte Quests: Grabsteine
`GameData.deletedHabits?: DeletedHabit[]` (`{ id, createdDay, archivedDay, schedule, scheduleHistory?, pauses? }`, im kv-Speicher unter `'deletedHabits'`, fehlt ohne gelöschte Quest). Beim endgültigen Löschen bleibt der Zeitplan der Quest erhalten; `archivedDay` = ihr Archivierungstag, falls ≤ Löschtag, sonst der Löschtag. Grabsteine zählen nur als **Pflicht-Quest** (Regel 2) an den Tagen, an denen die Quest Pflicht war – erledigt sind sie nie (ihre Erledigungen wurden mitgelöscht). Sie stehen in keiner Liste und zählen nicht für Streaks, Kapitel (Referenz bleibt `brokenReference`), Gesamtwerte oder Quest-XP. Damit bringt Löschen **nie** XP: Es kann nur die XP der Quest, ihren Anteil an Perfekter-Tag-Boni sowie Kapitel-/Kampagnen-XP kosten.

### `schedule.ts`
```ts
export type HabitTimeline = Pick<Habit, 'createdDay' | 'archivedDay' | 'schedule' | 'scheduleHistory' | 'pauses'>
  // Was die Zeitplan-Funktionen brauchen; auch ein DeletedHabit erfüllt das
export function isArchivedOn(habit: Pick<Habit, 'archivedDay'>, day: DayKey): boolean
  // archivedDay ≤ day. EINE Regel für Listen, Verschieben, Archivieren (ein archivedDay nach heute zählt noch nicht)
export function isActiveOn(habit: HabitTimeline, day: DayKey): boolean
  // createdDay ≤ day und (kein archivedDay oder day < archivedDay) und day in keiner Pause
export function isPausedOn(habit: Habit, day: DayKey): boolean    // from ≤ day < until für eine Pause
export function scheduleOn(habit: Habit, day: DayKey): Schedule
  // Rhythmus an diesem Tag: Verlaufseintrag mit dem kleinsten until > day, sonst habit.schedule
  // (unabhängig von der gespeicherten Reihenfolge; bei gleichem until gewinnt der erste Eintrag)
export function isRequiredOn(habit: HabitTimeline, day: DayKey): boolean
  // aktiv UND scheduleOn(habit, day) ist daily ODER weekdays mit passendem Wochentag. Wochenquests: false.
export function isVisibleOn(habit: HabitTimeline, day: DayKey): boolean
  // aktiv UND (isRequiredOn ODER scheduleOn(habit, day).type === 'weekly')
export function sameSchedule(a: Schedule, b: Schedule): boolean     // inhaltlich gleich (Wochentage als Menge)
export function mergePauses(pauses: readonly HabitPause[]): HabitPause[]
  // leere (from ≥ until) verwerfen, nach from sortieren, überlappende/angrenzende zusammenfassen
export function questXp(difficulty: Difficulty): number
export function isDone(c: Pick<Completion, 'value' | 'target'>): boolean  // value ≥ target
export function habitTarget(habit: Habit): number                          // measure?.target ?? 1
export function describeSchedule(schedule: Schedule): string
  // "Täglich", "Mo, Mi, Fr", "3× pro Woche"
```

### `streaks.ts`
```ts
export function computeStreak(habit: Habit, doneDays: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey): Streak
export function streakUnit(schedule: Schedule): 'day' | 'week'   // weekly → 'week', sonst 'day'
export function bestStreakIn(habit: Habit, doneDays: ReadonlySet<DayKey>, unit: 'day' | 'week', asOf: DayKey, from?: DayKey): number
  // längste Serie in dieser Einheit (gleiche Regeln), auch wenn sie nicht zum aktuellen Rhythmus passt;
  // 0, wenn die Quest (auch laut scheduleHistory) nie einen Rhythmus dieser Einheit hatte
export function streakReachedDay(habit: Habit, doneDays: ReadonlySet<DayKey>, target: number, asOf: DayKey, from?: DayKey, unit?: 'day' | 'week'): DayKey | undefined
  // frühester Tag, an dem die Serie (Einheit: unit ?? streakUnit(habit.schedule)) die Länge target erreicht hat
```
- `doneDays`: Tage, an denen die Quest erledigt war. Betrachtet wird nur `[max(habit.createdDay, from), asOf]`.
- Die Einheit folgt dem **aktuellen** Rhythmus (`habit.schedule`). Pausierte Tage werden übersprungen (zählen nicht, brechen nichts).
- daily/weekdays (unit `'day'`): zählt aufeinanderfolgende **planmäßige** Tage laut `scheduleOn(habit, day)` (Nicht-Plantage werden übersprungen, brechen nichts; Tage, an denen die Quest damals eine Wochenquest war, gelten als Nicht-Plantage). Ist `asOf` planmäßig und noch nicht erledigt, bricht das die aktuelle Serie nicht (Tag läuft noch) – gezählt wird dann ab dem vorherigen Plantag. Tage nach `archivedDay` zählen nicht.
- weekly (unit `'week'`): eine Woche (Mo–So) zählt, wenn erledigte (nicht pausierte) Tage ≥ `times`. Maßgeblich ist der Rhythmus am **Montag** der Woche: War die Quest da eine Wochenquest, gilt deren `times`, sonst wird die Woche übersprungen (zählt nicht, bricht nichts). Die Woche von `asOf` zählt, falls schon erfüllt; ist sie noch nicht erfüllt, bricht sie nichts. Ebenso brechen eine durch Archivierung abgeschnittene letzte Woche und Wochen mit pausierten Tagen nichts.
- `best` = längste Serie im Zeitraum (inkl. aktueller). Laufzeit O(Tage + Verlaufs-/Pauseneinträge).
- Umstellung zwischen Tages- und Wochenquest: `computeStreak` wechselt die Einheit; die in der früheren Einheit erreichten Serien liefert `bestStreakIn`. Damit bleiben Bestwerte (`GameTotals.bestDayStreak`/`bestWeekStreak`) und erreichte Streak-Kapitel erhalten.

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
- habit: nur Completions mit `quest.startDay ≤ day ≤ today`. completions = Anzahl erledigter; total = Summe aller `value`; streak = `computeStreak(...).best` mit `from = quest.startDay` (Einheit des aktuellen Rhythmus). Hat die Serie in der **anderen** Einheit (vor einer Umstellung zwischen Tages- und Wochenquest, `bestStreakIn`) das Ziel erreicht, bleibt das Kapitel abgeschlossen (current = dieser Wert) – verdiente Kapitel-XP gehen durch Bearbeiten nicht verloren. Streak-Kapitel setzen `ChapterState.unit` (`'day' | 'week'`) = Einheit von `current` (die frühere, wenn nur sie das Ziel erreicht hat); Texte zum Fortschritt nutzen sie, die Beschreibung des Ziels den aktuellen Rhythmus. `doneDay` = erster Tag, an dem das Ziel (in einer der Einheiten) erreicht war. Fehlt die Quest: `brokenReference: true`, current 0, nicht erledigt.

### `engine.ts`
```ts
export function getDayState(data: GameData, day: DayKey): DayState
export function deriveGameState(data: GameData, today: DayKey): GameState
```
XP-Regeln:
1. Jede erledigte Completion (`value ≥ target`) mit `day ≤ today` gibt `questXp(c.difficulty)` → Charakter-XP **und** dieselbe Menge Attribut-XP für `c.attribute`. Teilfortschritt gibt 0 XP. Zu Completions gelöschter Quests: werden ignoriert.
2. Perfekter Tag: für jeden Tag `d` von (frühester Tag mit Completion oder `profile.createdDay`) bis `today`: Pflicht-Quests = `isRequiredOn(h, d)` über alle Quests **und** alle Grabsteine (`deletedHabits`, nie erledigt). Perfekt ⇔ ≥ 1 Pflicht-Quest und alle erledigt. Bonus = `round(perfectDayBonus × Quest-XP dieses Tages)` (Quest-XP umfasst alle an `d` erledigten Quests, auch Wochenquests). Nur Charakter-XP.
3. Kapitel: `chapterXp` pro abgeschlossenem Kapitel, `mainQuestXp` pro komplett abgeschlossener Kampagne (auch archivierte). Nur Charakter-XP.
4. `adventureDay = diffDays(profile.createdDay, today) + 1` (ohne Profil: 1).
5. `getDayState` sortiert sichtbare Quests nach `order` (dann `title`); Streaks werden **zum Stichtag `day`** berechnet. `HabitStatus.xp` = `questXp(completion.difficulty)`, wenn erledigt (die gutgeschriebenen XP), sonst `questXp(habit.difficulty)`. `requiredCount` zählt Grabsteine mit (an früheren Tagen also ggf. mehr als die sichtbaren Pflicht-Quests). `HabitStatus.week` gibt es, wenn `scheduleOn(habit, day)` eine Wochenquest ist (frühere Tage zeigen den damals gültigen Rhythmus). `week.target` ist dasselbe Wochenziel wie bei der Wochen-Serie: das vom **Montag** der Woche (ein mitten in der Woche geändertes Ziel gilt ab dem nächsten Montag); war die Quest am Montag keine Wochenquest, das des Tages.

Weil Pflicht/Sichtbarkeit über `scheduleOn` und Pausen laufen, ändern Rhythmus-Änderungen und das Zurückholen archivierter Quests keine vergangenen Perfekten Tage, XP, Level oder Streaks. `GameTotals.bestDayStreak`/`bestWeekStreak` berücksichtigen über `bestStreakIn` beide Einheiten. Invariante (per Zufallstest im Repository geprüft): Bearbeiten, Archivieren und Zurückholen am Tag `today` ändern `deriveGameState(…, today − 1)` (Level, XP, Attribute, Gesamtwerte, abgeschlossene Kapitel) nicht. Nur der laufende Tag darf sich ändern (z. B. wird eine heute auf „täglich“ umgestellte Quest sofort Pflicht). Löschen erhöht nie Level-XP, Perfekte Tage oder deren Bonus-XP (Zufallstest in `deletion.test.ts`; für `today` verglichen mit dem Stand „heute archiviert“).

### `deletion.ts`
```ts
export function habitTombstone(habit: Habit, today: DayKey): DeletedHabit
export function applyHabitDeletion(data: GameData, habitId: string, today: DayKey): GameData
  // genau die Bedeutung von repository.deleteHabit: Quest + Completions weg, Grabstein angehängt; unbekannte ID → data
export function deletionImpact(data: GameData, habitId: string, today: DayKey): DeletionImpact
  // { xpLost, levelBefore, levelAfter, campaigns: [{ quest, lostChapters, openChapters, losesCompletion }] }
  // exakt deriveGameState vorher − nachher (auch archivierte Kampagnen) – für die Rückfrage vor dem Löschen
```

## Daten-API (`src/data`)

### `db.ts`
```ts
export class QuestlogDB extends Dexie {
  habits!: Table<Habit, string>             // '&id, order, mainQuestId'
  completions!: Table<Completion, string>   // '&id, habitId, day'
  mainQuests!: Table<MainQuest, string>     // '&id'
  kv!: Table<{ key: string; value: unknown }, string>  // '&key'  – Schlüssel 'profile', 'settings', 'deletedHabits'
}
export const db: QuestlogDB   // Datenbankname 'questlog'
```

### `repository.ts`
Alle Funktionen `async`, nutzen `db` (ein optionaler letzter Parameter `database = db` ist erlaubt, damit Tests eine eigene Instanz verwenden können).
```ts
export async function loadGameData(): Promise<GameData>
  // settings mit DEFAULT_SETTINGS gemergt; deletedHabits geprüft/normalisiert (fehlt, wenn leer)
export async function saveProfile(profile: CharacterProfile): Promise<void>
export async function updateSettings(patch: Partial<Settings>): Promise<void>

export type HabitDraft = Omit<Habit, 'id' | 'order' | 'createdDay' | 'archivedDay' | 'scheduleHistory' | 'pauses'>
export async function createHabit(draft: HabitDraft, today: DayKey): Promise<Habit>   // order = max+1
export async function updateHabit(id: string, patch: Partial<HabitDraft>, today: DayKey): Promise<void>
  // today = aktueller Spieltag (Pflicht). Ändert sich der Rhythmus (inhaltlich, normalisiert) und ist
  // today > createdDay, wird { until: today, schedule: <alter Rhythmus> } an scheduleHistory angehängt –
  // außer der letzte Eintrag hat schon until === today (mehrere Änderungen am selben Tag: für die Tage davor
  // bleibt der ursprüngliche Rhythmus). today ≤ createdDay → Rhythmus wird einfach ersetzt.
  // Der Verlauf wird bedeutungsgleich normalisiert (gleiche Nachbarn zusammengefasst, überflüssige Einträge
  // mit dem aktuellen Rhythmus am Ende entfernt). Verlauf und Pausen bleiben sonst erhalten.
  // Änderungen gelten auch für den heutigen Eintrag (Completion `${id}:${today}`): Ändern sich Ziel, Schwierigkeit,
  // Attribut oder Art, bekommt er die neuen Snapshots. Messbar bleibt messbar: value bleibt (7/10 → 7/5 erledigt,
  // 10/10 → 10/20 offen). Abhaken → messbar: erledigt → value = neues Ziel, sonst löschen. Messbar → Abhaken:
  // erledigt → value 1, sonst löschen. Frühere Tage behalten ihre Snapshots.
export async function archiveHabit(id: string, today: DayKey): Promise<void>
  // archivedDay = today; bleibt, falls schon archiviert (isArchivedOn), ein archivedDay > today wird auf today gesetzt
export async function restoreHabit(id: string, today: DayKey): Promise<void>
  // archivedDay entfernen; ist archivedDay < today, wird die Pause { from: archivedDay, until: today }
  // ergänzt (mit vorhandenen Pausen zusammengefasst). Nicht archivierte Quest: keine Änderung.
export async function deleteHabit(id: string, today?: DayKey): Promise<void>
  // eine Transaktion (habits, completions, kv): Grabstein anhängen (habitTombstone), Completions + Quest löschen.
  // today sollte übergeben werden; fehlt er, gilt der Spieltag laut Uhr und gespeichertem Tageswechsel.
export async function moveHabit(id: string, direction: 'up' | 'down', today: DayKey): Promise<void>
  // tauscht order mit dem Nachbarn unter den am Tag today aktiven (!isArchivedOn) Quests

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
Neue **optionale** Felder (`Habit.scheduleHistory`, `Habit.pauses`, `GameData.deletedHabits`) erhöhen `BACKUP_SCHEMA_VERSION` nicht – ältere Backups ohne sie bleiben gültig. Geprüft wird: `scheduleHistory` streng aufsteigend nach `until` mit gültigen Rhythmen, Pausen mit `from < until`, Grabsteine mit eindeutigen IDs (gleiche Regeln für ihren Verlauf und ihre Pausen). `restoreBackup` schreibt `deletedHabits` in den kv-Speicher.

### `seed.ts`
```ts
export function createScholarCampaign(today: DayKey): { mainQuest: MainQuest; habits: Habit[] }
export async function installScholarCampaign(today: DayKey): Promise<void>
  // eine Transaktion; wiederholbar: vorhandene Quests mit gleichem (getrimmtem) Titel, die heute nicht archiviert
  // und mit keiner Kampagne verknüpft sind, werden neu verknüpft (und von den Kapiteln genutzt) statt verdoppelt;
  // nur fehlende Vorlage-Quests kommen neu hinzu (hinter alle vorhandenen)
export type AdventureTemplate = 'scholar' | 'none'
export async function startAdventure(profile: CharacterProfile, template: AdventureTemplate, today: DayKey): Promise<void>
  // Abschluss des Onboardings: Vorlage (optional) + Profil (wie saveProfile) in EINER Transaktion – alles oder nichts
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

Routen (Hash-Router): `/` Heute (Dashboard) · `/quests` Quests verwalten · `/kampagne` Kampagne (`/kampagne?id=<questId>` wählt eine bestimmte Kampagne; ohne `id` die zuletzt gewählte der Sitzung bzw. die Standardauswahl) · `/held` Charakter · `/einstellungen` Einstellungen. Ohne Profil wird das Onboarding angezeigt.

## App-Ebene (`src/app`) – Spielzustand & Gate

- `App.tsx`: `AppErrorBoundary` → `ToastProvider` → `GameProvider` → `EffectsConfig` (setzt `settings.effects` um) → `ProfileGate` (ohne Profil: `OnboardingPage`, sonst Router + `GameFeedback`).
  Heute wird direkt geladen; `quests`, `kampagne`, `held`, `einstellungen` sind `lazy`-Routen, das Onboarding `React.lazy` in `Suspense` – Platzhalter jeweils `AppLoading` aus `GameProvider.tsx`. Mit Profil fordert der Router einmal `requestPersistentStorage()` (`src/app/persistentStorage.ts`, wirft nie; `isStoragePersisted()` für die Anzeige in den Einstellungen) an.
- `main.tsx`: nur im Produktions-Build `registerSW` (`virtual:pwa-register`) mit stündlicher Update-Prüfung und bei Rückkehr in den Vordergrund; das Neuladen wartet, solange ein Dialog offen ist. Bei `vite:preloadError` (veralteter Chunk) wird höchstens einmal pro 10 s neu geladen.
- **Seiten und Features holen Daten ausschließlich über `useGameContext()`** aus `src/app/gameContext.ts` → `{ data, today, state }`. Nie selbst `useGame()`/`useGameData()` aufrufen (sonst mehrfache Berechnung).
- Schreiben ausschließlich über `src/data/repository.ts` (bzw. `seed.ts`/`backup.ts`). Die Funktionen werfen deutsche `Error`s → abfangen und per `useToast()` mit `tone: 'error'` anzeigen. Nach dem Schreiben aktualisiert sich der Zustand automatisch (Live-Query) – kein manuelles Neuladen.
- `GameFeedback` (`src/features/feedback`) sitzt **außerhalb** des RouterProviders: dort keine Router-Hooks verwenden. Es erkennt Änderungen am Spielzustand (XP, Level-Up, Perfekter Tag, Kapitel) und zeigt die Rückmeldungen zentral – Seiten zeigen dafür **keine eigenen** XP-Toasts, höchstens lokale Mikro-Animationen.
- Router-Hooks/Komponenten immer aus `'react-router'` importieren (nicht `'react-router/dom'`).

## Tests & Entwicklung

- Komponenten-Tests: `// @vitest-environment jsdom`, `import 'fake-indexeddb/auto'`, `afterEach(cleanup)` (keine Vitest-Globals), Animationen per `MotionGlobalConfig.skipAnimations = true` aus. Seiten mit `renderWithGame(<Seite />, { route })` aus `src/test/renderWithGame.tsx` rendern; Daten vorher mit `resetAllData()` + Repository-Funktionen anlegen.
- Im Dev-Server (`npm run dev`) gibt es `window.questlog` (`src/dev/devtools.ts`): `await questlog.seedDemo(30)` legt einen Demo-Helden mit 30 Tagen Verlauf an, `await questlog.reset()` löscht alles. Ideal für Screenshots mit Playwright.
