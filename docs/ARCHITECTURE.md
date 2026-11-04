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
    attributes.ts    Metadaten der 6 Attribute inkl. Farbe (fix; zugleich die Kampagnenfarben)
    dates.ts         Spieltage (DayKey) & Kalender-Arithmetik
    leveling.ts      XP-Kurven, Level, Ränge
    schedule.ts      Wann ist eine Quest aktiv/fällig, Wochenfortschritt
    streaks.ts       Streak-Berechnung
    chapters.ts      Auswertung von Kampagnen-Kapiteln
    engine.ts        deriveGameState / getDayState / evaluateMainQuests
    training.ts      Geplante XP pro Woche & dominantAttribute (Grundlage der Kampagnenfarbe)
    campaigns.ts     Aktive Kampagnen & Limit (isCampaignActive, campaignSlotsLeft …)
    deletion.ts      Löschen einer Quest als reine Funktion (Grabstein) + Vorschau der Folgen
  data/          Persistenz (IndexedDB via Dexie) & React-Hooks
    db.ts            Dexie-Datenbank
    repository.ts    Alle schreibenden Operationen
    backup.ts        Export/Import (JSON, zod-validiert)
    blueprints/      Kampagnen-Bibliothek: 8 Vorlagen, gemeinsame Quests, Test-Helfer (siehe unten)
    seed.ts          Kampagnen aus Vorlagen installieren, startAdventure
    hooks.ts         useGameData / useToday / useGame
    ids.ts           newId()
  ui/            Wiederverwendbare, rein darstellende Komponenten (Design-System)
  app/           App-Rahmen: Router, Layout, Navigation
  features/      Seitenübergreifende Features
    feedback/        XP-, Level-Up-, Perfekter-Tag- und Kapitel-Rückmeldungen (GameFeedback)
    blueprints/      UI der Kampagnen-Bibliothek (BlueprintLibrary, Einrichtung, Klassenwahl, Vorschau)
    campaignTheme/   Hauptfarbe einer Kampagne (campaignColor, accentVars …), siehe „Kampagnenfarben“
  pages/         Eine Datei/Ordner pro Seite (campaign/, dashboard/, onboarding/, quests/, hero/, settings/)
  dev/devtools.ts  window.questlog – nur im Dev-Server
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
export function evaluateMainQuests(data: GameData, today: DayKey): MainQuestState[]
  // alle Kampagnen (aktive + archivierte, gespeicherte Reihenfolge), exakt wie in deriveGameState ausgewertet
```
XP-Regeln:
1. Jede erledigte Completion (`value ≥ target`) mit `day ≤ today` gibt `questXp(c.difficulty)` → Charakter-XP **und** dieselbe Menge Attribut-XP für `c.attribute`. Teilfortschritt gibt 0 XP. Zu Completions gelöschter Quests: werden ignoriert.
2. Perfekter Tag: für jeden Tag `d` von (frühester Tag mit Completion oder `profile.createdDay`) bis `today`: Pflicht-Quests = `isRequiredOn(h, d)` über alle Quests **und** alle Grabsteine (`deletedHabits`, nie erledigt). Perfekt ⇔ ≥ 1 Pflicht-Quest und alle erledigt. Bonus = `round(perfectDayBonus × Quest-XP dieses Tages)` (Quest-XP umfasst alle an `d` erledigten Quests, auch Wochenquests). Nur Charakter-XP.
3. Kapitel: `chapterXp` pro abgeschlossenem Kapitel, `mainQuestXp` pro komplett abgeschlossener Kampagne (auch archivierte). Nur Charakter-XP. Nicht archivierte Kampagnen stehen in `GameState.mainQuests`, archivierte (gleich ausgewertet) in `GameState.archivedMainQuests`.
4. `adventureDay = diffDays(profile.createdDay, today) + 1` (ohne Profil: 1).
5. `getDayState` sortiert sichtbare Quests nach `order` (dann `title`); Streaks werden **zum Stichtag `day`** berechnet. `HabitStatus.xp` = `questXp(completion.difficulty)`, wenn erledigt (die gutgeschriebenen XP), sonst `questXp(habit.difficulty)`. `requiredCount` zählt Grabsteine mit (an früheren Tagen also ggf. mehr als die sichtbaren Pflicht-Quests). `HabitStatus.week` gibt es, wenn `scheduleOn(habit, day)` eine Wochenquest ist (frühere Tage zeigen den damals gültigen Rhythmus). `week.target` ist dasselbe Wochenziel wie bei der Wochen-Serie: das vom **Montag** der Woche (ein mitten in der Woche geändertes Ziel gilt ab dem nächsten Montag); war die Quest am Montag keine Wochenquest, das des Tages.

6. **Hauptfarbe einer Kampagne** – `MainQuestState.dominantAttribute` (für `mainQuests` und `archivedMainQuests`, jeweils zum Stichtag `today`): Von den Quests in `linkedHabitIds` zählen die am Tag `today` aktiven (`isActiveOn`: angelegt, nicht archiviert, nicht pausiert). Jede gibt ihrem Attribut das Gewicht `questXp(habit.difficulty)` × Termine pro Woche laut `scheduleOn(habit, today)` (daily 7, weekdays Anzahl der Tage, weekly `times`; `plannedWeeklyXp` in `training.ts`). Das Attribut mit der größten Summe gewinnt (`dominantAttribute`); bei Gleichstand das der zuerst sortierten beteiligten Quest (Reihenfolge von `linkedHabitIds`: `order`, dann Titel). Ist **keine** Quest aktiv (alle archiviert oder pausiert – z. B. nach „Kampagne beenden“ mit ihren Quests), zählen ersatzweise alle bereits angelegten Quests mit ihrem zuletzt gültigen Rhythmus: Die Kampagne behält ihre Farbe. Ohne angelegte Quest fehlt das Feld (die UI fällt auf die Vorlage bzw. Gold zurück, siehe „Kampagnenfarben“). Nur der Plan zählt, nicht die Erledigungen; geteilte Quests zählen für jede Kampagne, die sie führt; Quests mit unbekanntem Attribut oder ohne XP zählen nicht. Beispiel: 1 schwere Quest 3× pro Woche (40 × 3 = 120) verliert gegen 3 leichte tägliche (3 × 10 × 7 = 210).

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
export function legacyBlueprintRef(quest): BlueprintRef | undefined
```
Version 2 (Indizes unverändert): Eine vorhandene Kampagne „Der Weg des Gelehrten“ ohne `blueprint` (aus dem früheren Onboarding) bekommt beim Upgrade `blueprint: { id: 'scholar', level: 'beginner' }` – sie gilt damit in der Bibliothek als laufend.

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
  // wirft CAMPAIGN_LIMIT_MESSAGE, wenn die neue Kampagne aktiv wäre und schon maxActiveCampaigns aktiv sind
  // (Spieltag laut Uhr + gespeichertem Tageswechsel). blueprint/sharedHabitIds werden bereinigt übernommen.
export async function updateMainQuest(id: string, patch: Partial<MainQuestDraft>): Promise<void>
  // blueprint und sharedHabitIds bleiben, solange der Patch sie nicht ausdrücklich enthält. archived → nicht
  // archiviert gilt wie restoreMainQuest (Limit, Vorlage nicht doppelt, Übernahme geteilter Quests), archiviert
  // wie archiveMainQuest (Übergabe geteilter Quests) – jeweils ohne Quests zu archivieren bzw. zurückzuholen.
export async function archiveMainQuest(id, today, options?, database?) / restoreMainQuest(...)  // siehe unten
export async function deleteMainQuest(id: string): Promise<void>
  // eigene Quests verlieren mainQuestId – außer geteilten, die eine andere nicht archivierte Kampagne
  // mitbenutzt: die gehen an diese über (wie beim Beenden, siehe „Geteilte Quests“)
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
Neue **optionale** Felder (`Habit.scheduleHistory`, `Habit.pauses`, `GameData.deletedHabits`, `MainQuest.blueprint` – `id` nicht leer, `level` `'beginner' | 'advanced'`, `pathId` optional nicht leer –, `MainQuest.sharedHabitIds` – nicht leere IDs) erhöhen `BACKUP_SCHEMA_VERSION` nicht – ältere Backups ohne sie bleiben gültig. Geprüft wird: `scheduleHistory` streng aufsteigend nach `until` mit gültigen Rhythmen, Pausen mit `from < until`, Grabsteine mit eindeutigen IDs (gleiche Regeln für ihren Verlauf und ihre Pausen). `restoreBackup` schreibt `deletedHabits` in den kv-Speicher.

### `seed.ts`
Siehe „Kampagnen-Bibliothek“ unten: `createCampaignFromBlueprint`, `installBlueprint`, `startAdventure` sowie die Gelehrten-Wrapper `createScholarCampaign(today, createdAt?)` / `installScholarCampaign(today)` (Einsteiger-Stufe der Vorlage `'scholar'`).

### `hooks.ts`
```ts
export function useGameData(): GameData | undefined       // live (useLiveQuery), undefined während des Ladens
export function useToday(dayStartHour: number): DayKey    // aktualisiert sich beim Tageswechsel (Intervall + visibilitychange)
export function useGame(): { data: GameData; today: DayKey; state: GameState } | undefined
  // state per useMemo aus deriveGameState(data, today)
```

## UI-Schicht

- `src/ui/` enthält das Design-System (Buttons, Karten, Fortschrittsbalken, Dialoge, Formularfelder, Emoji-Auswahl, Toasts …). Seiten verwenden **nur** diese Bausteine statt eigene Grundelemente zu bauen.
- Theme „Dark Fantasy“: dunkles Braun-Schwarz, Gold-Akzente, Pergament-Text; Überschriften in *Cinzel*, Fließtext in *Inter*. Farben als Tailwind-Theme-Tokens in `src/index.css`. Kampagnen tragen zusätzlich ihre Hauptfarbe (Attributfarbe, siehe „Kampagnenfarben“); Gold bleibt für XP, Belohnungen und den App-Rahmen.
- Mobile first: funktioniert ab 360 px Breite, untere Navigationsleiste auf dem Handy, Seitenleiste/obere Leiste auf dem Desktop.
- `MotionConfig reducedMotion="user"`; Effekte zusätzlich über `settings.effects` abschaltbar.

Routen (Hash-Router): `/` Heute (Dashboard) · `/quests` Quests verwalten (`/quests?neu=1&kampagne=<questId>` öffnet „Neue Quest“, vorbelegt mit der Kampagne) · `/kampagne` Kampagne (`/kampagne?id=<questId>` wählt eine bestimmte Kampagne; ohne `id` die zuletzt gewählte der Sitzung bzw. die erste laufende; `/kampagne?neu=1` zeigt die Bibliothek, um eine weitere Kampagne zu beginnen) · `/held` Charakter · `/einstellungen` Einstellungen. Ohne Profil wird das Onboarding angezeigt.

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
- Im Dev-Server (`npm run dev`) gibt es `window.questlog` (`src/dev/devtools.ts`): `await questlog.seedDemo(30)` legt einen Demo-Helden mit 30 Tagen Verlauf an, `await questlog.installBlueprint('body', { level: 'advanced', pathId: 'endurance' })` startet eine weitere Kampagne aus der Bibliothek (heutiger Spieltag, gleiche Prüfungen wie in der App), `await questlog.reset()` löscht alles. Ideal für Screenshots mit Playwright.

## Kampagnen-Bibliothek (Blueprints) & mehrere Kampagnen

Ziel: fertige Kampagnen-Vorlagen mit einem Tipp starten – Stufe wählen, beim Sport die Klasse – und bis zu `BALANCING.maxActiveCampaigns` (3) Kampagnen gleichzeitig führen. Eigene Kampagnen ohne Vorlage gibt es weiterhin (`CampaignFormDialog`).

### Vorlagen (`src/data/blueprints/`)
Eine Datei pro Vorlage (`export const <name>Blueprint: CampaignBlueprint`), Register in `index.ts` (`BLUEPRINTS` in Anzeigereihenfolge, `getBlueprint(id)`), Typen in `types.ts` (`CampaignBlueprint`, `BlueprintContent`, `BlueprintQuest`, `BlueprintChapter`, `BlueprintCriterion`, `BlueprintPath`, `BlueprintOptions`, `BLUEPRINT_LEVELS`, `BLUEPRINT_LEVEL_LABELS`). Eine Vorlage ist reine Daten plus eine reine `build(options)`-Funktion, die den Inhalt (Titel, Icon, Beschreibung, Warum, Belohnung, 3–6 Quests, 4–7 Kapitel) für Stufe und Pfad liefert; gespeichert wird erst beim Installieren.

| ID | Vorlage | Haupt-Attribut (`primaryAttribute`) | Laufzeit |
|----|---------|-------------------------------------|----------|
| `scholar` | 📚 Der Weg des Gelehrten | Intelligenz | 365 Tage |
| `body` | ⚔️ Der Weg des Körpers (mit Pfaden) | je Pfad, typisch Stärke | 224 Tage |
| `alchemist` | ⚗️ Der Alchemist | Vitalität | 180 Tage |
| `monk` | 📿 Der stille Mönch | Weisheit | 180 Tage |
| `earlyRiser` | 🌄 Der Frühaufsteher | Disziplin | 180 Tage |
| `fortress` | 🏰 Die Festung | Disziplin | 180 Tage |
| `fellowship` | 🧑‍🤝‍🧑 Die Gefährten | Charisma | 180 Tage |
| `polyglot` | 🌍 Der Polyglotte | Intelligenz | 365 Tage |

- **Stufen:** `'beginner'` (Einsteiger) / `'advanced'` (Fortgeschritten) – andere Startwerte (Häufigkeit, Zielwerte, Schwierigkeit) und passende Kapitel-Ziele; `levelHints` erklärt den Unterschied. Die Einsteiger-Stufe von `scholar` ist exakt die frühere Onboarding-Kampagne „Der Weg des Gelehrten“.
- **Pfade („Klassenwahl“):** Vorlagen mit `paths` verlangen genau einen Pfad – bei `body`: `strength` 🗡️ Krieger · Kraftsport (Stärke), `endurance` 🏹 Waldläufer · Ausdauersport (Vitalität), `sports` 🛡️ Gladiator · Sport allgemein & Spielsport (Stärke). Jeder Pfad hat eigene Haupt-/Neben-Attribute, Quests und Kapitel; die Kampagne heißt nach der Klasse („Der Pfad des Kriegers“).
- **Gemeinsame Bausteine (`shared.ts`):** Quests, die in mehreren Vorlagen vorkommen, kommen aus genau einer Funktion – gleicher Titel ⇒ beim Installieren dieselbe Quest. `waterQuest(level)` 💧 Wasser trinken, `stretchingQuest(level)` 🤸 Dehnen & Mobilität, `bedtimeQuest(level)` 🌙 Rechtzeitig ins Bett, `morningLightQuest(times)` ☀️ Morgenlicht-Spaziergang (Vitalität, Wochenquest; geteilt von „Der Frühaufsteher“ (Fortgeschritten) und „Der stille Mönch“), `candlelightQuest()` 🕯️ Kerzenlicht statt Bildschirm (Gelehrter und Mönch). Titel dort nie ändern, ohne alle Vorlagen zu prüfen.
- **Inhaltsprüfung:** `blueprints.test.ts` prüft alle Vorlagen, Stufen und Pfade (stabile IDs, Metadaten und Textlängen, 3–6 Quests mit eindeutigen Schlüsseln, Kern-Quest trainiert das Haupt-Attribut, das Haupt-Attribut bekommt klar die meisten geplanten XP pro Woche – also die Farbe, die die Bibliothek zeigt –, Tageslast je Stufe, 4–7 machbare Kapitel, deutsche Typografie, gleich benannte Quests überall gleich gebaut, keine Beinahe-Dubletten); dazu `body.test.ts`, `wellbeing.test.ts`, `mindSocial.test.ts`. Test-Helfer **`planPace.ts`** (nur für Tests): `daysToReachAtPlanPace(content, durationDays)` spielt die Kampagne mit einem Helden durch, der genau nach Plan erledigt (Start `PLAN_START`, ein Mittwoch; Wochenquests an den ersten Tagen jeder Woche), und liefert je automatischem Kapitel den Tag, an dem es frühestens erreicht ist – mit der echten `evaluateChapter`; dazu `habitFromQuest(quest, order, start?)` und `isEveryDay(schedule)`.

### Modell
- `MainQuest.blueprint?: { id, level, pathId? }` – Herkunft (Abzeichen für Vorlage, Stufe und Klasse; dieselbe Vorlage kann nicht zweimal gleichzeitig aktiv sein). DB-Version 2 ergänzt sie für die alte Gelehrten-Kampagne (siehe `db.ts`).
- **Aktiv** = nicht archiviert und nicht abgeschlossen (`domain/campaigns.ts`). Abgeschlossene, nicht archivierte Kampagnen belegen keinen Platz; archivierte stehen in `GameState.archivedMainQuests`.
- `MainQuest.sharedHabitIds?: string[]` – **geteilte Quests**: Quests, die die Kampagne mitbenutzt, obwohl sie (per `mainQuestId`) einer anderen gehören. Vom Installieren, Beenden, Zurückholen und Löschen gepflegt (siehe unten); fehlt ohne geteilte Quests. Backups prüfen nur, dass die IDs nicht leer sind.
- `MainQuestState.linkedHabitIds` = Quests mit `mainQuestId === quest.id` **plus** alle (existierenden) Quests, auf die ein Kapitel der Kampagne verweist oder die in `sharedHabitIds` stehen (ohne Doppelte, sortiert nach `order`, dann Titel; archivierte inklusive). Daraus berechnet die Engine auch `dominantAttribute` (Regel 6).

### Geteilte Quests – Übergaben
Grundregel: Eine Quest gehört (per `mainQuestId`) einer laufenden Kampagne, die sie nutzt; jede weitere Kampagne, die sie nutzt, führt sie in `sharedHabitIds`. So bleibt die Menge `linkedHabitIds` jeder Kampagne bei allen Übergaben gleich – nur die Zuordnung wandert.
- **Installieren** (`installBlueprint`, `startAdventure`): Eine vorhandene, am Tag `today` nicht archivierte Quest mit gleichem (getrimmtem) Titel wird wiederverwendet statt verdoppelt (Einstellungen und Verlauf bleiben); die Kapitel der neuen Kampagne zählen auf sie. Ist sie keiner **aktiven** Kampagne zugeordnet (keine `mainQuestId`, oder ihre Kampagne ist archiviert, abgeschlossen oder gelöscht), geht sie an die neue – eine noch vorhandene bisherige Kampagne führt sie dann in ihren `sharedHabitIds` weiter. Sonst behält sie ihre Zuordnung und steht in `sharedHabitIds` der neuen. Bei mehreren Kandidaten gewinnt eine nicht zugeordnete, dann die erste in der Liste. Nur fehlende Quests werden neu angelegt, hinter allen vorhandenen.
- **Beenden** (`archiveMainQuest`, auch `updateMainQuest` mit `archived: true`): Jede eigene Quest, die eine andere **nicht archivierte** Kampagne mitbenutzt (Kapitel-Verweis oder `sharedHabitIds`), geht an diese über – an eine aktive vor einer abgeschlossenen, sonst an die erste in gespeicherter Reihenfolge. Dort fällt sie aus `sharedHabitIds`, die beendete Kampagne führt sie in ihren. Mit `archiveQuests: true` werden die übrigen eigenen Quests ab `today` archiviert (wie `archiveHabit`); übergebene laufen weiter.
- **Zurückholen** (`restoreMainQuest`, auch per `updateMainQuest`): Die Kampagne übernimmt wieder die Quests, die sie mitbenutzt und deren Kampagne archiviert ist – und Quests ohne (existierende) Kampagne, die in ihren `sharedHabitIds` stehen (Gegenstück zur Übergabe). Quests einer nicht archivierten Kampagne bleiben dort. Mit `restoreQuests: true` werden ihre archivierten eigenen Quests (inklusive der übernommenen) wie `restoreHabit` zurückgeholt.
- **Löschen** (`deleteMainQuest`): wie Beenden – mitbenutzte Quests gehen an eine andere nicht archivierte Kampagne über, die übrigen verlieren nur ihre `mainQuestId`.

### Domain (`src/domain/campaigns.ts`)
```ts
export function isCampaignActive(campaign: MainQuestState): boolean        // !quest.archived && !complete
export function activeCampaigns(data: GameData, today: DayKey): MainQuestState[]
export function countActiveCampaigns(data: GameData, today: DayKey): number
export function campaignSlotsLeft(data: GameData, today: DayKey): number   // max(0, maxActiveCampaigns - aktive)
export function isBlueprintActive(data: GameData, today: DayKey, blueprintId: string): boolean // „Läuft bereits“
export const CAMPAIGN_LIMIT_MESSAGE          // "Du hast schon 3 aktive Kampagnen. Schließe eine ab oder beende sie, um eine neue zu beginnen."
export const CAMPAIGN_RESTORE_LIMIT_MESSAGE  // "… um diese fortzusetzen."
```
„Abgeschlossen“ kommt aus `evaluateMainQuests` (engine) – dieselbe Auswertung wie `MainQuestState.complete` in der UI.

### Daten (`src/data/seed.ts`, `src/data/repository.ts`, `src/data/db.ts`)
```ts
export function createCampaignFromBlueprint(blueprint: CampaignBlueprint, options: BlueprintOptions, today: DayKey, createdAt?: number): { mainQuest: MainQuest; habits: Habit[] }
  // rein: prüft Stufe ("Unbekannte Stufe.") und Pfad ("Bitte wähle einen Pfad." / "Unbekannter Pfad."; ohne
  // Pfade wird pathId ignoriert); Quests mit neuen IDs, mainQuestId, createdDay today, order 0..n-1; Kapitel-
  // questKey → habitId; startDay today, deadline today + durationDays, blueprint { id, level, pathId? }
export async function installBlueprint(blueprintId: string, options: BlueprintOptions, today: DayKey, database?): Promise<MainQuest>
  // EINE Transaktion; wirft (nichts gespeichert): "Diese Vorlage gibt es nicht.", Pfad-Fehler,
  // "Diese Kampagne läuft bereits." (aktive Kampagne derselben Vorlage), CAMPAIGN_LIMIT_MESSAGE.
  // Geteilte Quests siehe oben.
export type AdventureChoice = { blueprintId: string; options: BlueprintOptions }
export async function startAdventure(profile: CharacterProfile, choice: AdventureChoice | null, today: DayKey, database?): Promise<void>
  // Vorlage (optional, wie installBlueprint) + Profil (wie saveProfile) in EINER Transaktion – alles oder nichts.
  // Übergangsweise auch noch 'scholar' | 'none' (veraltet: AdventureTemplate).
// unverändert nutzbar (Einsteiger-Stufe der Gelehrten-Vorlage): createScholarCampaign(today, createdAt?), installScholarCampaign(today) → MainQuest
export const SCHOLAR_BLUEPRINT_ID = 'scholar'

// repository.ts
createMainQuest(...)                                         // wirft, wenn das Limit erreicht ist
export async function archiveMainQuest(id: string, today: DayKey, options?: { archiveQuests?: boolean }, database?): Promise<void>
  // archived = true (bereits archiviert → bleibt), Übergabe geteilter Quests. archiveQuests: archiviert (wie archiveHabit:
  // ab today, vorhandener archivedDay bleibt) die eigenen Quests, die keine andere nicht archivierte Kampagne braucht
export async function restoreMainQuest(id: string, today: DayKey, options?: { restoreQuests?: boolean }, database?): Promise<void>
  // nicht archiviert → keine Änderung. Übernahme geteilter Quests. Wäre sie danach aktiv (nicht abgeschlossen): wirft
  // CAMPAIGN_RESTORE_LIMIT_MESSAGE, wenn schon 3 andere aktiv sind, bzw. "Eine Kampagne aus dieser Vorlage läuft bereits. …".
  // restoreQuests holt ihre archivierten Quests zurück (wie restoreHabit: archivierte Zeit wird Pause, keine XP gehen verloren)
export async function deleteMainQuest(id: string, database?): Promise<void>     // Übergabe wie beim Beenden

// db.ts
export function legacyBlueprintRef(quest: Pick<MainQuest, 'title' | 'blueprint'>): BlueprintRef | undefined
  // ohne blueprint und mit (getrimmtem) Titel "Der Weg des Gelehrten" → { id: 'scholar', level: 'beginner' }, sonst undefined
```
DB-Version 2 (Indizes unverändert) wendet `legacyBlueprintRef` beim Upgrade auf alle Kampagnen an: Die Gelehrten-Kampagne aus dem früheren Onboarding gilt damit in der Bibliothek als „Läuft bereits“ und wird nicht ein zweites Mal gestartet. Schemaänderungen immer über eine neue `version(n)`.

### UI-Bausteine (`src/features/blueprints/`)
```tsx
<BlueprintLibrary
  mode="start" | "select"                 // start: Kampagne beginnen (Aufrufer installiert in onConfirm); select: nur auswählen (Onboarding)
  selected?: AdventureChoice | null       // nur mode="select": hervorgehobene Auswahl (öffnet beim erneuten Antippen mit ihren Werten)
  onConfirm(choice: AdventureChoice): Promise<void> | void   // Promise → Ladezustand, Dialog schließt erst nach Erfolg; wirft → bleibt offen
  busy?: boolean                          // von außen beschäftigt: Karten gesperrt, Bestätigen lädt
  cardHeadingLevel?: 'h2' | 'h3'          // Überschriften-Ebene der Kartentitel (Standard h3)
  fullHint?: ReactNode                    // nur mode="start": Zusatz unter der Limit-Meldung (z. B. Links zu laufenden Kampagnen)
  className?: string
/>
```
- `BlueprintLibrary` zeigt im Modus `start` die freien Plätze (`activeSlotsText`, `freeSlotsText`), alle Vorlagen als `BlueprintCard` (Icon, Titel, Tagline, Haupt-/Neben-Attribute, Laufzeit, „Läuft bereits“ mit Stufe/Klasse, „Gemeistert“) und sperrt laufende Vorlagen sowie – wenn alle Plätze belegt sind – das Beginnen (Ansehen bleibt möglich).
- `BlueprintSetupDialog` (`open`, `onClose`, `blueprint`, `mode`, `initialOptions?`, `onConfirm`, `blockedReason?`, `mastered?`, `busy?`): bei Pfaden die **Klassenwahl** (`ClassPicker`, Pflicht, nichts vorausgewählt), die Stufe (Einsteiger/Fortgeschritten mit Hinweis) und die Live-Vorschau `BlueprintPreview` der Quests und Kapitel aus `build()` – mit Hinweis auf Quests, die mit vorhandenen geteilt würden, und den Unterschieden zur anderen Stufe.
- `levelCompare.ts` (rein): `compareLevels(current, other, level)` vergleicht die Quests beider Stufen (gleicher Pfad) über den Quest-Key – Rhythmus, Tagesziel, XP – und liefert `LevelComparison` (`quests`: Key → `{ kind: 'only' }` bzw. `{ kind: 'changed', other: 'Fortgeschritten: 4× pro Woche · …' }`, `missing`: nur in der anderen Stufe); `otherLevel(level)`.
- `libraryStatus.ts` (rein): `libraryStatus(data, today)` → `{ activeCount, maxActive, slotsLeft, running, mastered }` (dieselbe Auswertung wie Limit und Installieren); `findSharedHabit(habits, title, today, activeCampaignIds?)` (dieselbe Wahl wie beim Installieren), `blueprintOptions`, `adventureChoice`, `hasPaths`.
- `blueprintText.ts`: deutsche Texte (`durationLabel`, `formatDeadline`, `measureText`, `criterionSummary`, `choiceSummary`, `activeSlotsText`, `freeSlotsText` …).

### Seiten
- **Onboarding, Schritt 3** (`pages/onboarding/CampaignStep.tsx`): `BlueprintLibrary mode="select"` oder „ohne Vorlage“; gespeichert wird erst mit „Los geht’s“ über `startAdventure` (Vorlage + Profil in einer Transaktion).
- **Kampagne** (`/kampagne`, `CampaignPage.tsx` + `pages/campaign/`): Bei mehreren Kampagnen eine Auswahl (Segmente, auf schmalen Bildschirmen eine Liste) mit Farbpunkt der Kampagne; die gezeigte steht in `?id=`. Ohne Kampagne sowie mit `?neu=1` zeigt `CampaignStarter` (`variant="first" | "next"`) die Bibliothek (`mode="start"`, `fullHint` verlinkt die laufenden Kampagnen) und den Weg zur eigenen Kampagne; nach dem Beginnen wechselt die Seite auf die neue Kampagne, sobald sie in den Live-Daten auftaucht. `CampaignBanner` zeigt Herkunft (Vorlage, Stufe, Klasse – `campaignOrigin.ts`), `ChapterTimeline` die Kapitel, `CampaignVictory` die gemeisterte Kampagne. `ArchiveCampaignDialog` fragt „Kampagne beenden?“ bzw. „In die Ruhmeshalle legen?“ mit dem Schalter „Zugehörige Quests ebenfalls archivieren“ (betroffene, weiterlaufende und mitbenutzte Quests aus `campaignArchive.ts`). `ArchivedCampaigns` listet „Beendete & gemeisterte Kampagnen“ (`state.archivedMainQuests`) zum Zurückholen (mit `restoreQuests: true`; ohne freien Platz vorab gesperrt) oder endgültigen Löschen.
- **Dashboard** (`pages/dashboard/CampaignCard.tsx`, `CampaignSection`): eine Kampagne als große Karte, mehrere als kompakte Karten (laufende zuerst, dann gemeisterte), jede verlinkt `/kampagne?id=<id>`; ohne Kampagne eine Einladung zur Bibliothek.

## Kampagnenfarben

Jede Kampagne hat eine **Hauptfarbe**: die Farbe des Attributs, das sie am stärksten trainiert. Gold bleibt die Farbe der App und des Belohnens.

### Palette (`src/domain/attributes.ts` → `ATTRIBUTES[id].color`, gespiegelt in `--color-attr-*` in `src/index.css`)
| Attribut | Farbe | Hex |
|----------|-------|-----|
| 💪 Stärke | Rot | `#e0654a` |
| 🧠 Intelligenz | Blau | `#5b9bd5` |
| 🧘 Weisheit | Silber/Eisblau | `#a9c6db` |
| 🗣️ Charisma | Bernstein | `#e3a33b` |
| ❤️ Vitalität | Grün | `#5dbb7a` |
| 🛡️ Disziplin | Violett | `#a28bd8` |

`src/ui/theme.test.ts` sichert ab: beide Stellen stimmen überein; jede Farbe erreicht als Text auf allen Flächen (`bg-deep` … `surface-hover`) ≥ 4.5:1 (ermittelt 4.6–11.4:1); die Farben sind paarweise deutlich verschieden (OKLab ΔE ≥ 0.09, kleinster Abstand Intelligenz/Disziplin); Weisheit ist klar heller und höchstens halb so bunt wie Intelligenz; jede Farbe liegt in ihrem Farbton (Rot, Bernstein, Grün, Blau, Silber, Violett).

**Schrift auf getönten Flächen:** Pures Stärke-Rot läge auf seinem 12-%-Chip über `surface-raised` bei 4.3:1 (über `surface-hover` 3.9:1), Intelligenz-Blau knapp darüber. Deshalb ist getönte Schrift überall leicht mit Pergament aufgehellt (80 : 20, `TINT_TEXT_PERCENT`): `tintStyle` (Attribut-Chips, `Badge color`) im Design-System und `--accent-text` der Kampagnenfarben – dieselbe Mischung. Geprüft: Chips (12–13 %) auf allen Flächen und auf einer hervorgehobenen Karte (`theme.test.ts`), Kampagnen-Flächen und -Abzeichen (`campaignTheme.test.ts`), jeweils ≥ 4.5:1. Hinweis: Charisma-Bernstein liegt sehr nah am App-Gold (ΔE ≈ 0.02) – eine Charisma-Kampagne wirkt golden; Gold-Elemente (XP, Belohnung) bleiben über Form und Text unterscheidbar.

### Welche Farbe eine Kampagne bekommt
1. `MainQuestState.dominantAttribute` aus der Engine (Regel 6: Attribut mit den meisten planmäßigen XP pro Woche unter den heute aktiven Quests in `linkedHabitIds` – ist keine aktiv, unter allen angelegten; Gleichstand → zuerst sortierte Quest),
2. sonst das Haupt-Attribut der Vorlage – des gewählten Pfads (`BlueprintPath.primaryAttribute`) vor der Vorlage (`CampaignBlueprint.primaryAttribute`),
3. sonst Gold (`CAMPAIGN_FALLBACK_COLOR` = `--color-gold`).

Die Farbe folgt damit dem Plan: Ändert der Held Schwierigkeit oder Rhythmus seiner Quests, kann sich die Farbe ändern. Frisch installiert trägt jede Kampagne die Farbe ihrer Vorlage bzw. Klasse – `blueprints.test.ts` stellt sicher, dass jede Vorlage in jeder Stufe und Klasse ihr Haupt-Attribut klar am stärksten trainiert (deshalb z. B. „Selbst kochen“ beim Alchemisten als Vitalität und beim Gladiator Rumpftraining statt täglicher Schritte). Archivierte Kampagnen werden ebenfalls zum heutigen Tag ausgewertet; sind ihre Quests mitarchiviert, zählt deren letzter Plan – die Farbe bleibt in der Ruhmeshalle dieselbe.

### Helfer (`src/features/campaignTheme`)
```ts
export const CAMPAIGN_FALLBACK_COLOR = '#d4a548'
export type CampaignColorSource = Pick<MainQuestState, 'quest' | 'dominantAttribute'>
export function blueprintAttribute(quest: Pick<MainQuest, 'blueprint'>): AttributeId | undefined   // Pfad vor Vorlage
export function campaignAttribute(campaign: CampaignColorSource): AttributeId | undefined
export function attributeColor(attribute: AttributeId | undefined): string   // Hex, Gold ohne Attribut
export function campaignColor(campaign: CampaignColorSource): string         // Hex, Gold ohne Attribut
export function accentVars(color: string): CSSProperties
  // --accent, --accent-5/10/20/35/60 (color-mix mit transparent) und --accent-text (Schrift: 80 % Farbe,
  // 20 % Pergament = tintTextColor) – auf einen Container setzen
export function attributeAccentVars(attribute?: AttributeId): CSSProperties   // Bibliothek: Vorlage/Klasse
export function campaignAccentVars(campaign: CampaignColorSource): CSSProperties
export const ACCENT_TEXT_PERCENT        // = TINT_TEXT_PERCENT (80) aus src/ui/tint.ts
export const ACCENT_SURFACE             // Tailwind-Klassen: hervorgehobene Fläche (6 % über surface-raised)
export const ACCENT_BADGE_BACKGROUND    // deckende Abzeichen-Fläche (12 % über surface), unabhängig vom Lichtschein
```
Darin per Tailwind-Arbitrary-Werten: `border-(--accent-35)`, `bg-(--accent-10)`, `shadow-[0_0_24px_var(--accent-20)]`, **Schrift immer `text-(--accent-text)`** (reines `text-(--accent)` nur für Symbole). Alle Bereiche nutzen dieselben Variablen: Kampagnen-Seite und Dashboard (`CampaignFrame` = goldene Ornament-Karte in der Kampagnenfarbe), Bibliothek (`attributeAccentVars` + `blueprintAccentAttribute` in `features/blueprints/blueprintAccent.ts`), Rückmeldungen (`campaignAccentById` in `features/feedback/campaignAccent.ts`). Hervorgehobene Flächen (Kampagnen-Rahmen, gemeisterte Karte, gewählte Vorlage und Klasse) nutzen einheitlich `ACCENT_SURFACE`. Keine freien Hex-Werte in Komponenten – Farben kommen immer aus `ATTRIBUTES` bzw. diesen Helfern.

### Wo die Kampagnenfarbe erscheint – und wo Gold bleibt
- **Kampagnenfarbe:** Kampagnen-Banner (Rahmen, Leuchten, Icon-Rahmen, Akzentlinie unter dem Titel), Kapitel-Zeitleiste (Knoten, Verbindungen, Hervorhebung und Leuchten des aktuellen Kapitels, Kapitel-Fortschrittsbalken), Gesamtfortschritt der Kampagne, Farbpunkt in der Kampagnen-Auswahl, Kampagnen-Karten auf dem Dashboard (Rahmen, Akzent, Fortschritt, Kapitel-Rauten), Bibliotheks-Karten und Einrichtungs-Dialog (Haupt-Attribut der Vorlage bzw. des gewählten Pfads), Zeilen der beendeten Kampagnen (behalten ihre Farbe), Kampagnen-Abzeichen der Quests auf der Quests-Seite, Kapitel-Toast (Ring um das Kampagnen-Symbol), Konfetti und Akzent der Feier-Szene „Kampagne abgeschlossen“.
- **Gold bleibt reserviert für:** XP-Zahlen, Belohnungen (Belohnung-Box), „Gemeistert“-/Siegeszustände, Primär-Buttons und den App-Rahmen (Navigation, XP-Leiste).
- Zurückhaltend einsetzen: Die Farbe tönt Linien, Leuchten und Fortschritt; Flächen bleiben das dunkle Braun-Schwarz, Fließtext bleibt Pergament.
