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
    streaks.ts       Streak-Berechnung (inkl. streakRunsBefore für den Streak-Bonus)
    streakBonus.ts   Streak-Bonus: Anteil je Serienlänge, XP inklusive Bonus (Phase 2a)
    achievements/    Erfolge: definitions.ts (ACHIEVEMENTS, Kategorien, Stufen), evaluate.ts (Auswertung) (Phase 2a)
    chapters.ts      Auswertung von Kampagnen-Kapiteln
    engine.ts        deriveGameState / getDayState / evaluateMainQuests (inkl. Gold, Nebenquests, Erfolge, Lebenspunkte)
    hpRules.ts       Phase 2b: Regeln der Lebenspunkte (Ruhetage, Tageswertung, Durchhänger-Pause, Streak-Schutz, abgeleiteter HP-Zustand)
    hp.ts            Phase 2b: öffentlicher Einstieg – alles aus hpRules.ts plus die Abrechnung settleDays
    statistics.ts    Phase 2b: Tages-Historie und Diagramm-Daten für den Reiter „Statistik“
    hallOfFame.ts    Phase 2b: Bilanz gemeisterter Kampagnen (Ruhmeshalle)
    training.ts      Geplante XP pro Woche & dominantAttribute (Grundlage der Kampagnenfarbe)
    campaigns.ts     Aktive Kampagnen & Limit (isCampaignActive, campaignSlotsLeft …)
    deletion.ts      Löschen einer Quest als reine Funktion (Grabstein) + Vorschau der Folgen
    combat/          Phase 3a: hash.ts (stabiler Hash), damage.ts (Schaden), classes.ts (Klasse der Woche), boss.ts
                     (Wochen-Boss, heroSeedOf), chests.ts (Truhen), cosmetics.ts (Titel & Rahmen) – Inhalte:
                     classDefinitions.ts, bosses.ts, cosmeticDefinitions.ts (siehe „Phase 3a“)
    testing.ts       Fabriken für Tests (makeHabit, makeCompletion, makeReward, makeSideQuest, makeAchievement,
                     Phase 2b: makeItemPurchase, makeRestPeriod, makeLedgerEntry …, Phase 3a: makeBoss, makeChest …)
  data/          Persistenz (IndexedDB via Dexie) & React-Hooks
    db.ts            Dexie-Datenbank
    repository.ts    Alle schreibenden Operationen
    backup.ts        Export/Import (JSON, zod-validiert)
    blueprints/      Kampagnen-Bibliothek: 8 Vorlagen, gemeinsame Quests, Test-Helfer (siehe unten)
    seed.ts          Kampagnen aus Vorlagen installieren, startAdventure
    hooks.ts         useGameData / useToday / useGame
    ids.ts           newId()
  ui/            Wiederverwendbare, rein darstellende Komponenten (Design-System)
  app/           App-Rahmen: Router, Layout, Navigation, ProgressRecorder/HpSettler (ohne Anzeige)
  features/      Seitenübergreifende Features
    feedback/        XP- (mit Gold), Level-Up-, Perfekter-Tag-, Kapitel- und Erfolgs-Rückmeldungen (GameFeedback);
                     Phase 2b: Niederlage-Szene, Streak-Schutz-/Heiltrank-Meldungen (hpFeedback.ts), HP_COLOR (hpTheme.ts);
                     Phase 3a: Siegesszene, Klassenwechsel-Szene, „Truhe gefunden“ (combatFeedback.ts, modalScene.ts)
    combat/          Phase 3a: AvatarFrame, ChestOpenDialog, ChestGraphic, chestTheme/chestText/combatText
    blueprints/      UI der Kampagnen-Bibliothek (BlueprintLibrary, Einrichtung, Klassenwahl, Vorschau)
    campaignTheme/   Hauptfarbe einer Kampagne (campaignColor, accentVars …), siehe „Kampagnenfarben“
  pages/         Eine Datei/Ordner pro Seite (campaign/, dashboard/, onboarding/, quests/, hero/, settings/, treasury/)
  dev/devtools.ts  window.questlog – nur im Dev-Server (seedDemo, settle …)
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
export function isRequiredOn(habit: HabitTimeline, day: DayKey, restDays?: ReadonlySet<DayKey>): boolean
  // aktiv UND scheduleOn(habit, day) ist daily ODER weekdays mit passendem Wochentag. Wochenquests: false.
  // Phase 2b: an Ruhetagen (restDays, z. B. restDaySet(data.restPeriods) aus hp.ts) nie Pflicht.
export function isVisibleOn(habit: HabitTimeline, day: DayKey): boolean
  // aktiv UND (planmäßig fällig ODER scheduleOn(habit, day).type === 'weekly') – Ruhetage ändern daran nichts:
  // Quests bleiben sichtbar und können freiwillig erledigt werden (Dashboard gruppiert Tagesquests daher nach
  // `week === undefined`, nicht nach `required`)
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
export function computeStreak(habit: Habit, doneDays: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey, freeDays?: ReadonlySet<DayKey>): Streak
export function streakUnit(schedule: Schedule): 'day' | 'week'   // weekly → 'week', sonst 'day'
export function bestStreakIn(habit: Habit, doneDays: ReadonlySet<DayKey>, unit: 'day' | 'week', asOf: DayKey, from?: DayKey, freeDays?: ReadonlySet<DayKey>): number
  // längste Serie in dieser Einheit (gleiche Regeln), auch wenn sie nicht zum aktuellen Rhythmus passt;
  // 0, wenn die Quest (auch laut scheduleHistory) nie einen Rhythmus dieser Einheit hatte
export function streakReachedDay(habit: Habit, doneDays: ReadonlySet<DayKey>, target: number, asOf: DayKey, from?: DayKey, unit?: 'day' | 'week', freeDays?: ReadonlySet<DayKey>): DayKey | undefined
  // frühester Tag, an dem die Serie (Einheit: unit ?? streakUnit(habit.schedule)) die Länge target erreicht hat
export function streakRunsBefore(habit: Habit, doneDays: ReadonlySet<DayKey>, days: readonly DayKey[], freeDays?: ReadonlySet<DayKey>): number[]
  // Länge der Serie unmittelbar VOR jedem Tag (ergebnis[i] gehört zu days[i], Reihenfolge beliebig) – Grundlage
  // des Streak-Bonus, siehe „Phase 2a → Streak-Bonus“. Ein Durchlauf ab createdDay bis zum spätesten Tag.
```
- **Schontage** (`freeDays`, Phase 2b; die Engine reicht `HpCalendar.freeDays` an alle Quests weiter: Ruhetage, abgerechnete `frozen`-Tage und ein vom Streak-Schutz geretteter, noch offener Vortag): Tages-Einheit – eine Erledigung an einem Schontag zählt wie sonst (die Serie wächst), eine fehlende bricht nichts (so kostet ein Streak-Schutz nie einen Serientag, auch nicht den am Tag erledigten Quests). Wochen-Einheit – Erledigungen an Schontagen zählen fürs Wochenziel, eine Woche mit Schontag bricht nie (zählt nur, wenn erfüllt). Schontage helfen nur, sie kosten nie etwas. Das Set wird je Instanz einmal umgerechnet (gecacht) – nach der Übergabe nicht mehr verändern.
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
  freeDays?: ReadonlySet<DayKey>   // Phase 2b: Schontage für Streak-Kapitel (wie bei den Quest-Streaks)
}
```
- manual: current = manualDone ? 1 : 0, target 1, doneDay = completedDay.
- counter: current = counter ?? 0, target = criterion.target, done = current ≥ target.
- habit: nur Completions mit `quest.startDay ≤ day ≤ today`. completions = Anzahl erledigter; total = Summe aller `value`; streak = `computeStreak(...).best` mit `from = quest.startDay` (Einheit des aktuellen Rhythmus). Hat die Serie in der **anderen** Einheit (vor einer Umstellung zwischen Tages- und Wochenquest, `bestStreakIn`) das Ziel erreicht, bleibt das Kapitel abgeschlossen (current = dieser Wert) – verdiente Kapitel-XP gehen durch Bearbeiten nicht verloren. Streak-Kapitel setzen `ChapterState.unit` (`'day' | 'week'`) = Einheit von `current` (die frühere, wenn nur sie das Ziel erreicht hat); Texte zum Fortschritt nutzen sie, die Beschreibung des Ziels den aktuellen Rhythmus. `doneDay` = erster Tag, an dem das Ziel (in einer der Einheiten) erreicht war. Fehlt die Quest: `brokenReference: true`, current 0, nicht erledigt.
- best (Phase 2b, „Bestwert“): current = höchster einzelner Tageswert im Zeitraum (Teilfortschritt zählt, z. B. 22 von 30 Minuten), `doneDay` = erster Tag mit Wert ≥ Ziel (gleiche Gleitkomma-Toleranz wie überall). Gedacht nur für messbare Quests (Kapitel-Editor, `blueprints.test.ts`: Ziel über dem Tagesziel, höchstens doppelt so hoch, Text nennt Zahl und Einheit).

### `engine.ts`
```ts
export function getDayState(data: GameData, day: DayKey): DayState
export function deriveGameState(data: GameData, today: DayKey, options?: DeriveOptions): GameState
export interface DeriveOptions {   // nur für Tests
  achievements?: readonly AchievementDefinition[]   // Standard: ACHIEVEMENTS
  combat?: { classes?; attackNames?; bosses?; titles?; frames? }   // Phase 3a, Standard: die Inhalte aus combat/
}
export function evaluateMainQuests(data: GameData, today: DayKey): MainQuestState[]
  // alle Kampagnen (aktive + archivierte, gespeicherte Reihenfolge), exakt wie in deriveGameState ausgewertet
// Phase 2b, für die Abrechnung (hp.ts) und die Statistik:
export function dayFactsOf(data: GameData, today: DayKey, restDays: ReadonlySet<DayKey>): (day: DayKey) => DayFacts
  // { requiredCount, requiredDone (wie beim Perfekten Tag, inkl. Grabsteinen; an Ruhetagen 0), active (≥ 1 erledigte Quest) }
export function totalXpTimeline(data: GameData, today: DayKey, days: { restDays; freeDays }): { totalXpAt(day): number }
  // Gesamt-XP am Ende jedes Tages in einem Durchlauf (Kapitel am doneDay, ohne bekannten Tag von Anfang an);
  // bei gleichen Schontagen = deriveGameState(data, day).level.totalXp
```
XP-Regeln:
1. Jede erledigte Completion (`value ≥ target`) mit `day ≤ today` gibt `xpWithStreakBonus(questXp(c.difficulty), bonus)` = `round(questXp × (1 + bonus))` → Charakter-XP **und** dieselbe Menge Attribut-XP für `c.attribute`; `bonus` ist der Streak-Bonus des Tages (siehe „Phase 2a → Streak-Bonus“). Teilfortschritt gibt 0 XP. Zu Completions gelöschter Quests: werden ignoriert. `totals.xpFromQuests` enthält den Bonus, `totals.xpFromStreakBonus` weist ihn aus.
2. Perfekter Tag: für jeden Tag `d` von (frühester Tag mit Completion oder `profile.createdDay`) bis `today`: Pflicht-Quests = `isRequiredOn(h, d)` über alle Quests **und** alle Grabsteine (`deletedHabits`, nie erledigt). Perfekt ⇔ ≥ 1 Pflicht-Quest und alle erledigt. Bonus = `round(perfectDayBonus × Quest-XP dieses Tages)` (Quest-XP inklusive Streak-Bonus, umfasst alle an `d` erledigten Quests, auch Wochenquests; **ohne** Nebenquests). Nur Charakter-XP.
3. Kapitel: `chapterXp` pro abgeschlossenem Kapitel, `mainQuestXp` pro komplett abgeschlossener Kampagne (auch archivierte). Nur Charakter-XP. Nicht archivierte Kampagnen stehen in `GameState.mainQuests`, archivierte (gleich ausgewertet) in `GameState.archivedMainQuests`.
4. `adventureDay = diffDays(profile.createdDay, today) + 1` (ohne Profil: 1).
5. `getDayState` sortiert sichtbare Quests nach `order` (dann `title`); Streaks werden **zum Stichtag `day`** berechnet. `HabitStatus.baseXp` = `questXp(completion.difficulty)`, wenn erledigt, sonst `questXp(habit.difficulty)`; `HabitStatus.streakBonus` = Streak-Bonus des Tages (offen: den eine Erledigung jetzt bekäme; erledigt: den gutgeschriebenen – derselbe Wert); `HabitStatus.xp` = `xpWithStreakBonus(baseXp, streakBonus)` (erledigt: genau die gutgeschriebenen XP). `DayState.questXp` = Summe der an dem Tag gutgeschriebenen Quest-XP inklusive Bonus, ohne Nebenquests; `perfectBonusXp` = Perfekter-Tag-Bonus daraus. `requiredCount` zählt Grabsteine mit (an früheren Tagen also ggf. mehr als die sichtbaren Pflicht-Quests). `HabitStatus.week` gibt es, wenn `scheduleOn(habit, day)` eine Wochenquest ist (frühere Tage zeigen den damals gültigen Rhythmus). `week.target` ist dasselbe Wochenziel wie bei der Wochen-Serie: das vom **Montag** der Woche (ein mitten in der Woche geändertes Ziel gilt ab dem nächsten Montag); war die Quest am Montag keine Wochenquest, das des Tages.

6. **Hauptfarbe einer Kampagne** – `MainQuestState.dominantAttribute` (für `mainQuests` und `archivedMainQuests`, jeweils zum Stichtag `today`): Von den Quests in `linkedHabitIds` zählen die am Tag `today` aktiven (`isActiveOn`: angelegt, nicht archiviert, nicht pausiert). Jede gibt ihrem Attribut das Gewicht `questXp(habit.difficulty)` × Termine pro Woche laut `scheduleOn(habit, today)` (daily 7, weekdays Anzahl der Tage, weekly `times`; `plannedWeeklyXp` in `training.ts`). Das Attribut mit der größten Summe gewinnt (`dominantAttribute`); bei Gleichstand das der zuerst sortierten beteiligten Quest (Reihenfolge von `linkedHabitIds`: `order`, dann Titel). Ist **keine** Quest aktiv (alle archiviert oder pausiert – z. B. nach „Kampagne beenden“ mit ihren Quests), zählen ersatzweise alle bereits angelegten Quests mit ihrem zuletzt gültigen Rhythmus: Die Kampagne behält ihre Farbe. Ohne angelegte Quest fehlt das Feld (die UI fällt auf die Vorlage bzw. Gold zurück, siehe „Kampagnenfarben“). Nur der Plan zählt, nicht die Erledigungen; geteilte Quests zählen für jede Kampagne, die sie führt; Quests mit unbekanntem Attribut oder ohne XP zählen nicht. Beispiel: 1 schwere Quest 3× pro Woche (40 × 3 = 120) verliert gegen 3 leichte tägliche (3 × 10 × 7 = 210).

7. Phase 2a – Nebenquests, Gold, Erfolge: siehe „Phase 2a“ unten (`GameState.sideQuests`, `gold`, `achievements`; `totals.xpFromSideQuests`, `totals.sideQuestsCompleted`). Level-XP = Quest-XP (inkl. Streak-Bonus) + Perfekte-Tage-Bonus + Kapitel-/Kampagnen-XP + Nebenquest-XP.
8. Phase 2b – Ruhetage (keine Pflicht, kein Perfekter Tag, Quests sichtbar und XP-fähig), Schontage für alle Streaks, Streak-Bonus, Bestwerte und Streak-Kapitel, `GameState.hp`/`inventory`/`restToday`, `gold.lostToDefeats`: siehe „Phase 2b“ unten. `getDayState(data, day)` nutzt den Kalender zu Beginn von `day` (Ledger-Einträge ab `day` zählen noch nicht).

Weil Pflicht/Sichtbarkeit über `scheduleOn` und Pausen laufen, ändern Rhythmus-Änderungen und das Zurückholen archivierter Quests keine vergangenen Perfekten Tage, XP, Level oder Streaks – der Streak-Bonus eines Tages hängt nur von den Tagen davor und dem Rhythmus **dieses** Tages ab, bleibt also ebenfalls unverändert. `GameTotals.bestDayStreak`/`bestWeekStreak` berücksichtigen über `bestStreakIn` beide Einheiten. Invariante (per Zufallstest im Repository geprüft): Bearbeiten, Archivieren und Zurückholen am Tag `today` ändern `deriveGameState(…, today − 1)` (Level, XP, Attribute, Gesamtwerte, abgeschlossene Kapitel) nicht. Nur der laufende Tag darf sich ändern (z. B. wird eine heute auf „täglich“ umgestellte Quest sofort Pflicht). Löschen erhöht nie Level-XP, Perfekte Tage oder deren Bonus-XP (Zufallstest in `deletion.test.ts`; für `today` verglichen mit dem Stand „heute archiviert“).

### `deletion.ts`
```ts
export function habitTombstone(habit: Habit, today: DayKey): DeletedHabit
export function applyHabitDeletion(data: GameData, habitId: string, today: DayKey): GameData
  // genau die Bedeutung von repository.deleteHabit: Quest + Completions weg, Grabstein angehängt; unbekannte ID → data
export function deletionImpact(data: GameData, habitId: string, today: DayKey): DeletionImpact
  // { xpLost, levelBefore, levelAfter, goldLost, goldAfter, campaigns: [{ quest, lostChapters, openChapters, losesCompletion }] }
  // exakt deriveGameState vorher − nachher (auch archivierte Kampagnen) – für die Rückfrage vor dem Löschen.
  // goldLost = Guthaben vorher − nachher (≥ 0: ½ Gold je verlorenem XP plus Gold noch nicht gespeicherter Erfolge,
  // die danach nicht mehr erreicht sind); goldAfter = Guthaben danach (kann negativ werden → Einlösen gesperrt).
```

## Daten-API (`src/data`)

### `db.ts`
```ts
export class QuestlogDB extends Dexie {
  constructor(name = DEFAULT_DB_NAME)       // Tests: eigener Name pro Test
  habits!: Table<Habit, string>             // '&id, order, mainQuestId'
  completions!: Table<Completion, string>   // '&id, habitId, day'
  mainQuests!: Table<MainQuest, string>     // '&id'
  kv!: Table<{ key: string; value: unknown }, string>  // '&key'  – Schlüssel 'profile', 'settings', 'deletedHabits' (KV_KEYS)
  rewards!: Table<Reward, string>           // '&id, order'   (ab Version 3)
  purchases!: Table<Purchase, string>       // '&id, day'     (ab Version 3)
  sideQuests!: Table<SideQuest, string>     // '&id, order'   (ab Version 3)
  achievementUnlocks!: Table<AchievementUnlock, string>  // '&id' (ab Version 3)
  hpLedger!: Table<HpLedgerEntry, string>   // '&day'     (ab Version 4: ein abgerechneter Eintrag pro Spieltag)
  restPeriods!: Table<RestPeriod, string>   // '&id, from' (ab Version 4)
  bossVictories!: Table<BossVictory, string>     // '&weekStart'    (ab Version 5: ein Sieg pro Woche)
  chests!: Table<Chest, string>                  // '&id, foundDay' (ab Version 5)
  cosmeticUnlocks!: Table<CosmeticUnlock, string> // '&id'          (ab Version 5: Titel- bzw. Rahmen-ID)
}
export const DEFAULT_DB_NAME = 'questlog'
export const db: QuestlogDB
export function legacyBlueprintRef(quest): BlueprintRef | undefined
export function allTables(database: QuestlogDB): Table[]
  // alle Tabellen – für jede Transaktion, die loadGameData aufruft (installBlueprint, startAdventure, createMainQuest,
  // updateMainQuest, archive/restore/deleteMainQuest, purchaseReward, Phase 2b: settleHpDays, purchaseItem,
  // undoPurchase, Phase 3a: openChest) oder alles ersetzt (Reset, Backup).
  // Eine neue Tabelle gehört hier hinein, sonst scheitern diese Transaktionen.
```
Version 2 (Indizes unverändert): Eine vorhandene Kampagne „Der Weg des Gelehrten“ ohne `blueprint` (aus dem früheren Onboarding) bekommt beim Upgrade `blueprint: { id: 'scholar', level: 'beginner' }` – sie gilt damit in der Bibliothek als laufend.
Version 3 (Phase 2a): nur neue, leere Tabellen; vorhandene Daten bleiben unverändert. Streak-Bonus, Gold und Erfolge gelten danach sofort rückwirkend für den gespeicherten Verlauf (alles wird abgeleitet, nichts migriert).
Version 4 (Phase 2b): neue, leere Tabellen `hpLedger` und `restPeriods`; vorhandene Daten und der abgeleitete Spielstand (Level, XP, Gold, Erfolge, Streaks, Kampagnen) bleiben unverändert (Review-Test mit echtem Verlauf in `phase2b.review.test.ts`). Lebenspunkte werden erst ab dem ersten Start danach abgerechnet (`settleHpDays` setzt `penalties.since = today`) – nie rückwirkend.
Version 5 (Phase 3a): neue, leere Tabellen `bossVictories`, `chests`, `cosmeticUnlocks`; vorhandene Daten und der abgeleitete Spielstand von Phase 2b (Level, XP, Gold, Erfolge, HP, Vorrat, Kampagnen) bleiben unverändert (Review-Test mit echtem Verlauf in `phase3a.review.test.ts`). Klasse und Boss gelten sofort (abgeleitet), neue Quest- und Kapitel-Truhen nur ab dem Truhen-Fenster (`chestWindowStart`) – nie ein Berg rückwirkender Truhen.

### `repository.ts`
Alle Funktionen `async`, nutzen `db` (ein optionaler letzter Parameter `database = db` ist erlaubt, damit Tests eine eigene Instanz verwenden können).
```ts
export async function loadGameData(): Promise<GameData>
  // eine Lese-Transaktion über allTables. settings mit DEFAULT_SETTINGS gemergt; habits nach order (dann Titel),
  // mainQuests nach createdAt; deletedHabits geprüft/normalisiert (fehlt, wenn leer). Phase 2a: rewards nach order
  // (dann createdAt, ID), purchases nach createdAt (Chronik), sideQuests nach order (dann Titel), achievementUnlocks
  // nach Tag – jede Liste fehlt, wenn sie leer ist („fehlt = keine“).
export async function saveProfile(profile: CharacterProfile): Promise<void>   // Phase-3a-Regeln siehe „Phase 3a → Daten“
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

export async function resetAllData(): Promise<void>   // leert alle Tabellen (allTables) in einer Transaktion
// Phase-2a-Funktionen (Schatzkammer, Nebenquests, Erfolge): siehe „Phase 2a → Daten“
// Phase-2b-Funktionen (Lebenspunkte, Gegenstände, Rast & Urlaub): siehe „Phase 2b → Daten“
```

### `backup.ts`
```ts
export const BACKUP_APP_ID = 'questlog'
export const BACKUP_SCHEMA_VERSION = 1
export interface BackupFile { app: 'questlog'; schemaVersion: number; exportedAt: string; data: GameData }
export async function createBackup(now?: Date): Promise<BackupFile>
export function parseBackup(json: unknown): { ok: true; backup: BackupFile } | { ok: false; error: string }
  // zod-validiert, deutschsprachige Fehlermeldung
export async function restoreBackup(backup: BackupFile, database?, now?: Date): Promise<void>
  // ersetzt ALLE Daten in einer Transaktion; now = Zeitpunkt des Wiederherstellens (Standard: jetzt), siehe unten
export function backupFileName(now: Date): string                      // "questlog-backup-2026-11-03.json"
```
Neue **optionale** Felder (`Habit.scheduleHistory`, `Habit.pauses`, `GameData.deletedHabits`, `MainQuest.blueprint` – `id` nicht leer, `level` `'beginner' | 'advanced'`, `pathId` optional nicht leer –, `MainQuest.sharedHabitIds` – nicht leere IDs, Phase 2a: `GameData.rewards`, `purchases`, `sideQuests`, `achievementUnlocks`) erhöhen `BACKUP_SCHEMA_VERSION` nicht – ältere Backups ohne sie bleiben gültig. Geprüft wird: `scheduleHistory` streng aufsteigend nach `until` mit gültigen Rhythmen, Pausen mit `from < until`, Grabsteine mit eindeutigen IDs (gleiche Regeln für ihren Verlauf und ihre Pausen). Phase 2a: eindeutige IDs je Liste; Belohnungen mit ganzzahligem Preis 1 … `MAX_REWARD_PRICE` (wie im Repository, sonst ließe sich eine importierte Belohnung nicht mehr bearbeiten); Einlösungen mit `kind: 'reward'` (Phase 2b auch `'item'` mit Pflichtfeld `itemId`; Belohnungs- und Gegenstandsfelder nicht gemischt), ganzzahligem Preis ≥ 1 und gültigem `day`; Nebenquests mit gültigem Attribut, Schwierigkeit und gültigen Tagen (`createdDay`, optional `dueDay`, `doneDay`); Freischaltungen mit nicht leerer ID und gültigem Tag. Phase 2b (ebenfalls optional, Version unverändert): `hpLedger` (gültige Wertung, ganzzahlige HP, `0 ≤ hpAfter ≤ maxHp`, höchstens ein Eintrag pro Tag), `restPeriods` (`from ≤ until`, höchstens `MAX_REST_PERIOD_DAYS` Tage, eindeutige IDs, keine Überschneidung), `settings.penalties` (`enabled`, optional `since`) und `settings.hpIntroSeen`, Kapitel-Messgröße `best`. Phase 3a (ebenfalls optional, Version unverändert): `bossVictories` (`weekStart` ein Montag, höchstens einer je Woche, `bossId` nicht leer, `maxHp` > 0), `chests` (eindeutige IDs, bekannter Fundort und Seltenheit, Inhalt Gold – ganze Zahl ≥ 1 –, Streak-Schutz oder Titel/Rahmen mit ID, optional `openedAt`), `cosmeticUnlocks` (eindeutige IDs), `settings.combatIntroSeen`, `profile.form/titleId/frameId/heroSeed` (`heroSeed` nicht leer). `restoreBackup` schreibt `deletedHabits` in den kv-Speicher und die Phase-2a/2b-Listen in ihre Tabellen – alles in einer Transaktion über `allTables`; ein Backup ohne sie hinterlässt diese Tabellen leer (ohne `penalties` beginnt die Abrechnung beim nächsten Start, nie rückwirkend).
**Wiederherstellen nach einer Lücke (Phase 2b):** Tage nach dem Export kennt das Backup nicht, den Exporttag nur zum Teil. Würde die nächste Abrechnung (bis vorgestern) den Export-Spieltag oder spätere Tage erfassen, setzt `restoreBackup` `penalties.since` auf den frühesten noch nachtragbaren Tag (gestern, Spieltag von `now` laut Tageswechsel des Backups): Die Tage davor werden nie abgerechnet, die HP laufen ab dem letzten Ledger-Eintrag weiter (Heiltränke aus der Lücke zählen mit dem ersten abgerechneten Tag). Ein Gerätewechsel kostet so nie HP und führt nie zu einer Niederlage. Am Exporttag und am Tag danach (dann ist der Exporttag noch nachtragbar) bleibt alles unverändert – Export → Import ändert nichts. Ohne gültigen `exportedAt` zählt jeder noch offene Tag vor gestern als unbekannt.

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

Routen (Hash-Router): `/` Heute (Dashboard) · `/quests` Quests verwalten (`/quests?neu=1&kampagne=<questId>` öffnet „Neue Quest“, vorbelegt mit der Kampagne; `/quests?tab=nebenquests` zeigt den Reiter „Nebenquests“, mit `&neu=1` öffnet er „Neue Nebenquest“) · `/kampagne` Kampagne (`/kampagne?id=<questId>` wählt eine bestimmte Kampagne; ohne `id` die zuletzt gewählte der Sitzung bzw. die erste laufende; `/kampagne?neu=1` zeigt die Bibliothek, um eine weitere Kampagne zu beginnen) · `/schatzkammer` Schatzkammer · `/held` Charakter (`/held?tab=erfolge` öffnet den Reiter „Erfolge“, `/held?tab=statistik` die „Statistik“) · `/einstellungen` Einstellungen (nicht in der Leiste, über das Zahnrad der Held-Seite; die Leiste hebt dort „Held“ hervor). Ohne Profil wird das Onboarding angezeigt.

## App-Ebene (`src/app`) – Spielzustand & Gate

- `App.tsx`: `AppErrorBoundary` → `ToastProvider` → `GameProvider` → (`ProgressRecorder` + `HpSettler` + `EffectsConfig` (setzt `settings.effects` um) → `ProfileGate` (ohne Profil: `OnboardingPage`, sonst Router + `GameFeedback`)). `ProgressRecorder` (Phase 3a, löst den `AchievementRecorder` aus Phase 2a ab) zeigt nichts und speichert neu erreichte Erfolge, Boss-Siege und gefundene Truhen dauerhaft (siehe „Phase 3a → App“). `HpSettler` (Phase 2b) zeigt nichts und rechnet die Lebenspunkte ab (siehe „Phase 2b → App“).
  Heute wird direkt geladen; `quests`, `kampagne`, `schatzkammer`, `held`, `einstellungen` sind `lazy`-Routen, das Onboarding `React.lazy` in `Suspense` – Platzhalter jeweils `AppLoading` aus `GameProvider.tsx`. Mit Profil fordert der Router einmal `requestPersistentStorage()` (`src/app/persistentStorage.ts`, wirft nie; `isStoragePersisted()` für die Anzeige in den Einstellungen) an.
- `main.tsx`: nur im Produktions-Build `registerSW` (`virtual:pwa-register`) mit stündlicher Update-Prüfung und bei Rückkehr in den Vordergrund; das Neuladen wartet, solange ein Dialog offen ist. Bei `vite:preloadError` (veralteter Chunk) wird höchstens einmal pro 10 s neu geladen.
- **Seiten und Features holen Daten ausschließlich über `useGameContext()`** aus `src/app/gameContext.ts` → `{ data, today, state }`. Nie selbst `useGame()`/`useGameData()` aufrufen (sonst mehrfache Berechnung).
- Schreiben ausschließlich über `src/data/repository.ts` (bzw. `seed.ts`/`backup.ts`). Die Funktionen werfen deutsche `Error`s → abfangen und per `useToast()` mit `tone: 'error'` anzeigen. Nach dem Schreiben aktualisiert sich der Zustand automatisch (Live-Query) – kein manuelles Neuladen.
- `GameFeedback` (`src/features/feedback`) sitzt **außerhalb** des RouterProviders: dort keine Router-Hooks verwenden. Es erkennt Änderungen am Spielzustand (XP samt Gold, Level-Up, Attribut-Aufstieg, Perfekter Tag, Kapitel, Kampagne, Erfolge) und zeigt die Rückmeldungen zentral – Seiten zeigen dafür **keine eigenen** XP-Toasts, höchstens lokale Mikro-Animationen.
- Router-Hooks/Komponenten immer aus `'react-router'` importieren (nicht `'react-router/dom'`).

## Tests & Entwicklung

- Komponenten-Tests: `// @vitest-environment jsdom`, `import 'fake-indexeddb/auto'`, `afterEach(cleanup)` (keine Vitest-Globals), Animationen per `MotionGlobalConfig.skipAnimations = true` aus. Seiten mit `renderWithGame(<Seite />, { route })` aus `src/test/renderWithGame.tsx` rendern; Daten vorher mit `resetAllData()` + Repository-Funktionen anlegen.
- Im Dev-Server (`npm run dev`) gibt es `window.questlog` (`src/dev/devtools.ts`): `await questlog.seedDemo(30)` legt einen Demo-Helden mit 30 Tagen Verlauf an (Phase 2b: Lebenspunkte ab Abenteuerbeginn, abgerechnet bis vorgestern; `seedDemo(30, { missedDays: 3 })` lässt die letzten 3 abgerechneten Tage verpasst – angeschlagene HP –, `{ penalties: false }` startet im Sanften Modus; `await questlog.settle()` rechnet ab wie die App beim Start) – dazu drei Belohnungen (🍕 Pizza bestellen 400 und 🎬 Kinoabend 250, wiederholbar; 🎧 Neue Kopfhörer 2.500, einmalig), eine Kinoabend-Einlösung vor zwei Tagen (nur, wenn das Gold reicht; `seedDemo(30, { purchase: false })` lässt sie weg) und zwei Nebenquests (🧾 vor vier Tagen erledigt, 🦷 offen mit Termin übermorgen). `questlog.repository.*` bietet alle Repository-Funktionen (z. B. `createReward`, `createSideQuest(draft, await questlog.today())`), `questlog.today()` den heutigen Spieltag, `await questlog.installBlueprint('body', { level: 'advanced', pathId: 'endurance' })` startet eine weitere Kampagne aus der Bibliothek (heutiger Spieltag, gleiche Prüfungen wie in der App), `await questlog.reset()` löscht alles. Phase 3a: `seedDemo` speichert außerdem einen Sieg über den Boss der Vorwoche, alles, was der `ProgressRecorder` jetzt speichern würde, und legt mindestens zwei ungeöffnete Truhen bereit (`{ combat: false }` lässt das weg); `await questlog.grantChest({ rarity?, content?, source?, foundDay? })` legt eine ungeöffnete Truhe `<source>:dev-…` an (Standard-Fundort `chapter`, zählt nicht gegen das Tageslimit der Quest-Truhen), `await questlog.openChest(id)` öffnet sie wie die App, `await questlog.defeatBoss(day?)` speichert den Sieg über den Boss der Woche von `day` (Standard: Vorwoche; idempotent). Ideal für Screenshots mit Playwright.

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
| 🗣️ Charisma | Rosé | `#ec8fb0` |
| ❤️ Vitalität | Grün | `#5dbb7a` |
| 🛡️ Disziplin | Violett | `#a28bd8` |

`src/ui/theme.test.ts` sichert ab: beide Stellen stimmen überein; jede Farbe erreicht als Text auf allen Flächen (`bg-deep` … `surface-hover`) ≥ 4.5:1 (ermittelt 4.6–11.4:1); die Farben sind paarweise deutlich verschieden (OKLab ΔE ≥ 0.09, kleinster Abstand Intelligenz/Disziplin); Weisheit ist klar heller und höchstens halb so bunt wie Intelligenz; jede Farbe liegt in ihrem Farbton (Rot, Rosé, Grün, Blau, Silber, Violett).

**Schrift auf getönten Flächen:** Pures Stärke-Rot läge auf seinem 12-%-Chip über `surface-raised` bei 4.3:1 (über `surface-hover` 3.9:1), Intelligenz-Blau knapp darüber. Deshalb ist getönte Schrift überall leicht mit Pergament aufgehellt (80 : 20, `TINT_TEXT_PERCENT`): `tintStyle` (Attribut-Chips, `Badge color`) im Design-System und `--accent-text` der Kampagnenfarben – dieselbe Mischung. Geprüft: Chips (12–13 %) auf allen Flächen und auf einer hervorgehobenen Karte (`theme.test.ts`), Kampagnen-Flächen und -Abzeichen (`campaignTheme.test.ts`), jeweils ≥ 4.5:1. Charisma ist bewusst Rosé statt Bernstein: Bernstein lag fast auf dem App-Gold (ΔE ≈ 0.02), sodass eine Charisma-Kampagne golden gewirkt hätte; Gold bleibt so eindeutig für XP, Belohnungen und Siege.

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

## Phase 2a – Gold, Schatzkammer, Streak-Bonus, Erfolge, Nebenquests (Vertrag)

Typen: `src/domain/types.ts` (Abschnitte „Phase 2a“), Zahlen: `BALANCING.goldPerXp` (0,5), `streakBonusPerStep` (0,05), `streakBonusMax` (0,5), `achievementGold` (25/75/200). Nicht in 2a (Phase 2b): Lebenspunkte, Niederlage, Gegenstände (Streak-Schutz, Heiltrank), Urlaub, Statistik. Einen XP-Trank gibt es nicht.

### Streak-Bonus (`streakBonus.ts`, `streaks.ts`, Engine)
```ts
export function streakBonusForRun(run: number): number          // min(0,05 × run, 0,5); ungültig/negativ → 0
export function xpWithStreakBonus(baseXp: number, bonus: number): number   // round(baseXp × (1 + bonus))
export function streakBonusesOn(habit: Habit, doneDays: ReadonlySet<DayKey>, days: readonly DayKey[]): number[]
export function streakRunsBefore(habit, doneDays, days): number[]  // streaks.ts, Serienlänge vor jedem Tag
```
- Jede erledigte Quest-Erledigung bringt `xpWithStreakBonus(questXp(c.difficulty), bonus)` XP (Charakter **und** Attribut). Gerechnet wird in Basispunkten: 10 × 1,15 = 11,5 → 12, 10 × 1,05 = 10,5 → 11 (kaufmännisch, stabil ohne Gleitkomma-Rauschen).
- `bonus = streakBonusForRun(n)`; `n` = Länge der Serie **unmittelbar vor** dem Tag (`streakRunsBefore`). Tag 1 einer Serie: +0 %, Tag 2: +5 %, …, ab Tag 11: +50 %. Gilt rückwirkend für den ganzen Verlauf.
- Die Einheit folgt dem Rhythmus **dieses Tages** (`scheduleOn(habit, day)`), nicht dem aktuellen – so ändert eine Umstellung nie die XP vergangener Tage:
  - Tages-Einheit (daily/weekdays): aufeinanderfolgende erledigte Plantage direkt davor, gleiche Regeln wie `computeStreak` – Nicht-Plantage (auch Tage, an denen die Quest damals eine Wochenquest war) und Pausen werden übersprungen, ein verpasster Plantag (auch Teilfortschritt) setzt auf 0. Erledigungen an Nicht-Plantagen bekommen den Bonus der laufenden Serie, zählen aber nicht mit.
  - Wochen-Einheit (weekly): aufeinanderfolgende erfüllte Wochen direkt vor der Woche des Tages, gleiche Regeln wie die Wochen-Serie (Ziel vom Montag; Wochen, deren Montag keine Wochenquest war, zählen nicht und brechen nichts; Wochen mit Pausen brechen nichts). Alle Erledigungen einer Woche bekommen denselben Bonus, auch die über dem Wochenziel.
  - Eine Umstellung am Tag `today` kann den Bonus von heute ändern (täglich → wöchentlich: die Wochen-Serie beginnt bei 0; die frühere Tages-Serie ruht und gilt wieder, wenn zurückgestellt wird).
- Vor `createdDay` gibt es keine Serie (Bonus 0). Ab `archivedDay` ruht die Serie wie in einer Pause: Eine Erledigung am Archivierungstag behält ihren Bonus, auch nach dem Zurückholen (die archivierte Zeit wird zur Pause).
- Perfekter-Tag-Bonus = 25 % der Quest-XP des Tages **inklusive** Streak-Bonus. `HabitStatus.xp/baseXp/streakBonus` zeigen ihn an, `DayState.questXp` enthält ihn, `GameTotals.xpFromQuests` enthält ihn, `GameTotals.xpFromStreakBonus` weist ihn aus.
- Laufzeit: pro Quest ein linearer Durchlauf über ihre Tage (gemessen: 3 Jahre × 12 Quests + 200 Nebenquests + 100 Einlösungen ≈ 50 ms für `deriveGameState`).

### Gold (Engine)
- `gold.fromXp = floor(level.totalXp × goldPerXp)` (alle XP-Quellen: Quest-XP inkl. Streak-Bonus, Perfekter-Tag-Bonus, Kapitel, Kampagnen, Nebenquests; rückwirkend aus dem ganzen Verlauf). Dieselbe Formel nutzt `goldForTotalXp` in `features/feedback`.
- `gold.fromAchievements` = Summe `goldReward` aller freigeschalteten Erfolge (gespeichert oder jetzt erreicht).
- `gold.spent` = Summe `purchases[].price` (alle – Belohnungen und Gegenstände –, auch mit `day` nach heute; ungültige/negative Preise zählen nicht); `earned = fromXp + fromAchievements` (Phase 3a: `+ fromChests`, Gold geöffneter Truhen); `balance = earned − spent − lostToDefeats` (Phase 2b) – kann nach nachträglichen Änderungen (gelöschte Quest, wieder geöffnete Nebenquest) negativ sein, Einlösen ist dann gesperrt. `deletionImpact` nennt `goldLost`/`goldAfter` für die Rückfrage vor dem Löschen.

### Nebenquests (Engine)
- Erledigt = gültiger `doneDay ≤ today` (ein späterer – zurückgestellte Uhr – zählt noch nicht). Bringt `questXp(difficulty)` (ohne Streak-Bonus, aktuelle Schwierigkeit – kein Snapshot) an Charakter + `attribute` (unbekanntes Attribut: nur Charakter-XP). Zählt nie für den Perfekten Tag und nicht in `DayState.questXp`; `totals.xpFromSideQuests`, `totals.sideQuestsCompleted`.
- `GameState.sideQuests` (`SideQuestState`: `done`, `overdue` = offen und Termin vor heute, `dueToday` = Termin heute, `xp`): zuerst die offenen – mit Termin nach Termin (Überfällige damit vorn), dann ohne Termin, jeweils dann nach `order`, Titel, ID –, danach die **heute** erledigten nach `order`. Früher erledigte fehlen (die Quests-Seite zeigt sie unter „Erledigt“ aus `data.sideQuests`).

### Erfolge (`src/domain/achievements/`)
```ts
// definitions.ts
export const ACHIEVEMENTS: AchievementDefinition[]        // 39 (Phase 2b: + „Unbeugsam“), nach Kategorie, dann Stufe
export const ACHIEVEMENT_CATEGORY_ORDER: AchievementCategory[]
export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string>  // Beständigkeit, Fleiß, Perfektion, Kampagnen, Wachstum, Schatzkammer, Besondere Momente
export const ACHIEVEMENT_TIER_LABELS: Record<AchievementTier, string>          // Bronze, Silber, Gold
export function getAchievement(id: string): AchievementDefinition | undefined
// evaluate.ts
export const COMEBACK_GAP_DAYS = 7
export function evaluateAchievements(definitions, stats: AchievementStats, unlocks: AchievementUnlock[], today): AchievementState[]
export function achievementGold(achievements: AchievementState[]): number
export function countComebacks(activeDays: Iterable<DayKey>): number
```
- Definitionen: reine Daten + `progress(stats)` → `{ current, target }` (current auf `target` begrenzt). Gold je Stufe 25/75/200 (zwei besondere Gold-Erfolge 300, die geheime „Glückszahl“ `lucky-7777` 77). Geheim (`secret`, die ganze Kategorie „Besondere Momente“): `phoenix`, `lucky-7777` (7.777 Gesamt-XP), `adventure-days-365`, Phase 2b `indomitable` („Unbeugsam“ 🌄, Silber, 75 Gold: `perfectDaysAfterDefeat ≥ 1`; Niederlagen und verbrauchte Streak-Schutz-Gegenstände allein schalten nie etwas frei). IDs sind stabil (gespeichert in `AchievementUnlock`).
- Kennzahlen (`AchievementStats`, Engine, alles bis einschließlich `today`): Gesamtwerte wie `GameTotals` (Quests, Perfekte Tage, beste Tages-/Wochen-Serie, aktive Tage), `adventureDay`, Level, Gesamt-XP, Attribut-Level; `chaptersCompleted` und `campaignsCompleted` **inklusive archivierter** Kampagnen; `activeCampaigns` = nicht archiviert und nicht abgeschlossen; `sideQuestsCompleted`; `purchases` = Einlösungen von **Belohnungen** mit `day ≤ today` (Gegenstände zählen nicht – „Beim Händler“ heißt eine Belohnung einlösen); `goldFromXp` = `gold.fromXp` (ohne Erfolgs-Gold – keine Kreisbezüge); `comebacks` = `countComebacks(aktive Tage)`: wie oft nach ≥ 7 Tagen ohne erledigte Quest wieder eine erledigt wurde, ab dem ersten aktiven Tag (Nebenquests und Teilfortschritt zählen nicht als Aktivität).
- `evaluateAchievements`: `unlocked` = gespeicherter `AchievementUnlock` **oder** `current ≥ target` jetzt; `unlockedDay` = gespeicherter Tag (bei doppelten Einträgen der früheste), sonst `today`; `progress` = min(current / target, 1). Gespeicherte Freischaltungen unbekannter IDs werden ignoriert; NaN/∞ schalten nie frei. Einmal freigeschaltet bleibt freigeschaltet – auch wenn ein Wert später sinkt (gelöschte Quest, beendete Kampagne, rückgängig gemachte Einlösung).
- **`AchievementRecorder`** (`src/app`, im `GameProvider`, ohne Anzeige; seit Phase 3a Teil des `ProgressRecorder`, gleiche Regeln) macht das dauerhaft: erreichte, noch nicht gespeicherte Erfolge werden gebündelt nach 800 ms per `recordAchievementUnlocks([{ id, day: today }])` gespeichert – nur wenn sich die Menge der offenen Erfolge ändert, jede ID höchstens einmal pro Sitzung (schlägt das Speichern fehl, erst beim nächsten Start wieder), ohne Held nichts. Bei bestehendem Verlauf werden beim ersten Start alle schon erreichten Erfolge mit dem heutigen Tag gespeichert (still, siehe Feedback).

### Daten (`src/data`)
- Dexie `version(3)`: neue Tabellen `rewards '&id, order'`, `purchases '&id, day'`, `sideQuests '&id, order'`, `achievementUnlocks '&id'` (siehe `db.ts`). `loadGameData` liefert sie sortiert (leere Listen fehlen); `resetAllData` leert sie; das Backup enthält sie (optional, schemaVersion unverändert, siehe `backup.ts`).
```ts
export const DEFAULT_REWARD_ICON = '🎁'; export const DEFAULT_SIDE_QUEST_ICON = '📜'; export const MAX_REWARD_PRICE = 1_000_000
export function missingGoldMessage(missing: number): string     // "Dafür fehlen dir noch 1.250 Gold."

// Schatzkammer
export type RewardDraft = Omit<Reward, 'id' | 'order' | 'createdAt' | 'archived'>
createReward(draft): Promise<Reward>
  // Titel Pflicht ("Die Belohnung braucht einen Namen."), Icon sonst 🎁, price ganzzahlig 1 … MAX_REWARD_PRICE
  // ("Der Preis muss eine ganze Zahl zwischen 1 und 1.000.000 Gold sein."), repeatable === true, order = max + 1
updateReward(id, patch: Partial<RewardDraft>): Promise<void>
  // nur die Felder im Patch (undefined = unverändert), description: undefined/leer entfernt sie; gleiche Prüfung;
  // archived, order, createdAt bleiben; frühere Einlösungen behalten ihre Momentaufnahme
archiveReward(id) / restoreReward(id)                         // ausblenden / an den bisherigen Platz zurück
deleteReward(id): Promise<'deleted' | 'archived'>
  // nie eingelöst → endgültig gelöscht; mit Einlösungen → stattdessen ausgeblendet; unbekannt → 'deleted' (nichts passiert)
moveReward(id, 'up' | 'down')                                 // Tausch mit dem Nachbarn unter den nicht ausgeblendeten
purchaseReward(rewardId, today): Promise<Purchase>
  // EINE Transaktion über allTables: unbekannt → "Diese Belohnung gibt es nicht (mehr).", ausgeblendet → "Diese Belohnung
  // ist nicht mehr verfügbar.", einmalig und schon eingelöst → "Diese Belohnung hast du schon eingelöst.",
  // deriveGameState(loadGameData(), today).gold.balance < price → missingGoldMessage(price − balance).
  // Speichert { kind: 'reward', rewardId, title, icon, price (Momentaufnahmen), day: today, createdAt }.
  // Gleichzeitige Einlösungen laufen nacheinander – nie mehr ausgegeben als da ist.
undoPurchase(purchaseId, today?): Promise<void>
  // Einlösung weg, Gold zurück, einmalige Belohnung wieder einlösbar; unbekannte ID → nichts. Schon gespeicherte
  // Erfolge (z. B. „Beim Händler“) bleiben samt Gold. Gegenstände (Phase 2b) nur nach `canUndoItemPurchase`
  // (sonst deutscher Fehler, nichts geändert); today fehlt → Spieltag laut Uhr und gespeichertem Tageswechsel.

// Nebenquests
export type SideQuestDraft = Omit<SideQuest, 'id' | 'order' | 'createdDay' | 'doneDay'>
createSideQuest(draft, today): Promise<SideQuest>
  // Titel Pflicht ("Die Nebenquest braucht einen Namen."), Icon sonst 📜, Attribut/Schwierigkeit geprüft,
  // dueDay optional (leer = ohne Termin, Vergangenheit erlaubt → überfällig), createdDay = today, order = max + 1
updateSideQuest(id, patch)       // wie updateReward; dueDay und description entfernbar; createdDay, order, doneDay bleiben
completeSideQuest(id, day)       // doneDay = day; schon erledigt mit doneDay ≤ day → unverändert, späterer doneDay → auf day
reopenSideQuest(id)              // doneDay entfällt (samt XP); offen → nichts
deleteSideQuest(id)              // endgültig (eine erledigte samt XP); unbekannt → nichts
// unbekannte IDs sonst: "Diese Nebenquest gibt es nicht (mehr)." bzw. "Diese Belohnung gibt es nicht (mehr)."

// Erfolge
recordAchievementUnlocks(unlocks: AchievementUnlock[]): Promise<void>
  // idempotent, überschreibt nie einen gespeicherten Tag; doppelte IDs im Aufruf → frühester Tag;
  // ungültige Einträge (leere ID, ungültiger Tag) → Fehler, nichts gespeichert; leere Liste → nichts
```
- Bekannte Grenze: Nebenquests speichern keine Schwierigkeits-Momentaufnahme – ändert man die Schwierigkeit einer erledigten Nebenquest, ändern sich ihre XP (und das Gold) rückwirkend; der Dialog weist darauf hin.

### UI
- **Navigation:** Heute · Quests · Kampagne · **Schatzkammer** (`/schatzkammer`, Icon `Gem`; in der unteren Leiste kurz „Schätze“, in der Seitenleiste „Schatzkammer“) · Held. `/einstellungen` bleibt als Route, ist aber nicht in der Leiste: erreichbar über das Zahnrad im Kopf der Held-Seite; dort ist „Held“ hervorgehoben (`NavItem.alsoActiveOn`). Die Einstellungen-Seite hat „Zurück zum Helden“.
- **Held-Seite** mit Reitern (URL `?tab=`, `pages/hero/heroTabs.ts`, `HeroTabId = 'uebersicht' | 'erfolge' | 'statistik' | 'sammlung'` – Phase 3a: „Sammlung“): Übersicht (bisheriger Inhalt; XP-Aufschlüsselung mit Streak-Bonus- und Nebenquest-Zeile) · Erfolge (`?tab=erfolge`: Zusammenfassung, Kategorien in fester Reihenfolge, Karten mit Stufe, Fortschritt bzw. Freischalttag, geheime als „???“) · Statistik (Phase 2b, siehe dort).
- **Schatzkammer** (`pages/TreasuryPage.tsx`, `pages/treasury/`): Gold-Guthaben groß (mit „½ Gold pro XP“, aus XP / aus Erfolgen / ausgegeben), Belohnungen im Raster (zu teure gesperrt mit Sparbalken „Noch N Gold“, einmalige nach dem Einlösen „Eingelöst am …“), Einlösen mit Bestätigung + kleine Münz-Szene, eigene Belohnungen anlegen/bearbeiten/sortieren/ausblenden, Vorschläge (`rewardSuggestions.ts`), Chronik mit „Rückgängig“ (Phase 2b: auch Gegenstände, siehe dort); Phase 2b ersetzt den früheren Platzhalter durch den Abschnitt „Gegenstände“.
- **Dashboard:** Gold-Chip im Helden-Kopf (→ Schatzkammer, negatives Guthaben rot); Quest-Zeilen zeigen XP inklusive Bonus und bei Bonus > 0 „🔥 N · +20 %“; Bereich **Nebenquests** (offene + heute erledigte, Fälligkeit, schnell anlegen, abhaken für heute; ab 5 Einträgen auf 3 gekürzt mit „N weitere anzeigen“ und „Verwalten“ → `/quests?tab=nebenquests`).
- **Quests-Seite:** Reiter „Gewohnheiten“ / „Nebenquests“ (`?tab=nebenquests`, `&neu=1` öffnet den Anlege-Dialog); `SideQuestFormDialog` (`pages/quests/SideQuestFormDialog.tsx`) ist der gemeinsame Anlege-/Bearbeiten-Dialog für Dashboard und Quests-Seite; „Erledigt“ zeigt früher erledigte.
- **Feedback** (`features/feedback`): Die XP-Meldung nennt Gold („+24 XP · +12 Gold“, `XpGainedEvent.gold` = Zuwachs von `goldForTotalXp`); Nebenquests sind XP-Quellen (`XpQuest.sideQuest`, `creditedSideQuests`); neuer Erfolg → `AchievementUnlockedEvent` (Stufe, Gold, Konfetti in der Stufenfarbe, `ACHIEVEMENT_TIER_COLORS` in `achievementTier.ts`). Still bleiben: alles beim ersten Laden (Vergleichsbasis), Tageswechsel/ersetztes Profil sowie mehr als `BULK_CHANGE_LIMIT` (3) Erledigungen, Perfekte Tage, erledigte Nebenquests, Kapitel oder neue Erfolge auf einmal. Folge: ein Erfolg, den erst der Tageswechsel freischaltet (`adventure-days-365`), erscheint ohne Meldung.
- **Stufenfarben:** eine Quelle, `ACHIEVEMENT_TIER_COLORS` in `features/feedback/achievementTier.ts` (Meldung, Konfetti); die Erfolge-Seite übernimmt sie als `TIER_COLORS` (`pages/hero/achievementView.ts`).
- **Fokus & Hinweise:** Verschwindet nach einer Aktion der fokussierte Button (Einlösen, Ausblenden, Rückgängig, abgehakte Nebenquest in der gekürzten Liste), springt der Fokus auf ein sinnvolles Nachbarziel (`pages/treasury/focus.ts`: `usePendingFocus`, `focusIsLost`; `ArchivedRewards` bleibt dafür immer eingehängt). Verschieben von Belohnungen wird per Live-Region angesagt. Reiter setzen `aria-controls` nur am gewählten Reiter. Ist auf dem Dashboard „Gestern“ gewählt, zeigt der Nebenquest-Bereich „Nebenquests zählen immer für heute.“ (`otherDaySelected`).
- Offen: Der Lösch-Dialog von Quests nennt bisher nur XP; `deletionImpact.goldLost`/`goldAfter` stehen bereit.

## Phase 2b – Lebenspunkte, Rast & Urlaub, Gegenstände, Statistik, Ruhmeshalle (Vertrag)

Vom Spieler entschieden: Lebenspunkte als **Tageswertung** (nicht pro Quest!), mild und abschaltbar (Sanfter Modus); Niederlage kostet **15 %** Gold, **höchstens 100**; Streak-Schutz wird **automatisch** eingesetzt; **kein** XP-Trank, kein zweiter Held. Ziel: motivieren, nie stressen – auch mit 3 Kampagnen gleichzeitig.
**Nachjustiert** (vom Spieler abgesegnet, noch milder): ein Tag ohne erledigte Tagesquest, aber mit einer anderen erledigten Quest (etwa einer Wochenquest) ist `weak` statt `missed`; `weak` kostet −1 statt −3; eine Niederlage kostet höchstens `defeatGoldLossMax` = 100 Gold. Dazu die **Durchhänger-Pause** (ersetzt die frühere Abwesenheits-Regel „Pause ab dem 4. Tag ohne jede erledigte Quest“): Nach `slumpPauseAfterDays` = 3 Tagen mit Schaden in Folge ist jeder weitere schwache oder verpasste Tag `absent` („Pause“: 0 HP, kein Streak-Schutz-Verbrauch) – bis zum nächsten guten oder perfekten Tag. Ein Durchhänger kostet so höchstens 3 schadende Tage (≤ −18 HP), und etwas zu tun ist nie schlechter als nichts zu tun (nach der alten Regel setzte schon eine einzelne Wochenquest die Zählung zurück – etwas zu tun konnte mehr kosten als gar nichts). Schon abgerechnete Ledger-Einträge bleiben, wie sie sind (Wertung und HP nach den Regeln ihres Abrechnungstags; alte `absent`-Einträge gelten als laufende Pause) – die neuen Regeln gelten ab dem nächsten abgerechneten Tag.
Typen: `src/domain/types.ts` (Abschnitte „Phase 2b“: `DayScore`, `HpLedgerEntry`, `RestPeriod`, `ItemId`, `Settings.penalties/hpIntroSeen`, `HpState`, `InventoryState`, `GoldState.lostToDefeats`), Zahlen: `BALANCING.hpBase/hpPerLevel/hpByScore/slumpPauseAfterDays/defeatGoldLoss/defeatGoldLossMax/items`.

### Module (`src/domain`, rein)
- `hpRules.ts` – die Regeln **ohne** Abrechnung; hängt nicht von der Engine ab (die Engine nutzt es für `GameState.hp`). `hp.ts` – öffentlicher Einstieg: `export * from './hpRules'` plus `settleDays` (nutzt die Engine). So entsteht kein Import-Kreis (`hp.ts` → `engine.ts` → `hpRules.ts`). Andere Schichten importieren aus `hp.ts`.
```ts
// Grundwerte
maxHpForLevel(level): number                 // hpBase + hpPerLevel × Level (Level 1 → 50); ungültig → wie Level 1
penaltiesEnabled(settings): boolean          // penalties?.enabled !== false (Standard: an)
hpDeltaForScore(score): number               // BALANCING.hpByScore (+10 / +2 / −1 / −6 / 0)
isFreezableScore(score): boolean             // weak | missed
// Rast & Urlaub
restDaySet(periods): Set<DayKey>             // alle Tage aller gültigen Zeiträume (beide Enden inklusive)
restPeriodOn(periods, day) / isRestDay(periods, day)
// Ledger & Gegenstände
sortedLedger(entries, before?): HpLedgerEntry[]   // gültige Tage, je Tag einer, sortiert; before → nur Tage davor
isItemPurchase · itemPurchaseDays · countItemPurchases(purchases, itemId, through, after?)
freezesUsedIn(ledger) · goldLostToDefeats(ledger) · firstDefeatDay(ledger)
// Wertung
interface DayFacts { requiredCount; requiredDone; active }   // aus der Engine (dayFactsOf)
scoreByProgress(requiredCount, requiredDone) · classifyDay(facts, { rest, pause }) · scoreDays(input): ScoredDay[]
  // classifyDay: wie scoreByProgress, aber missed + facts.active → weak (etwa nur eine Wochenquest erledigt);
  // mit pause wird aus weak/missed absent („Pause“). scoreDays({ from, to, factsOf, restDays, purchases, ledger })
// Durchhänger-Pause – EIN Baustein für Abrechnung, Vorschau für gestern, GameState.hp und Statistik
isDamagingDay(day)                           // weak | missed, nicht frozen
slumpCountAfter(count, day) · slumpCountOf(days, count = 0)   // schadende Tage in Folge (Regeln siehe unten)
isSlumpPause(count)                          // count ≥ slumpPauseAfterDays
adventureStartOf(data, fallback) · nextUnsettledDay(settings, ledger)   // max(since, letzter Ledger-Tag + 1)
// Kalender & abgeleiteter Zustand
hpCalendar(data, asOf, restDays, factsOf): { restDays, ledger, pending, freeDays }
hpStateOf(data, calendar, today, level): HpState · inventoryOf(data, calendar, today): InventoryState
canUndoItemPurchase(data, purchase, today): boolean
// hp.ts
settleDays(data, today): HpLedgerEntry[]     // die NEU abzurechnenden Einträge
```

### Tageswertung & Abrechnung
- Pro Spieltag **eine** Wertung (`DayScore`), egal wie viele Quests/Kampagnen (`classifyDay`, in dieser Reihenfolge): Ruhetag/Urlaub → `rest`; keine Tagesquest fällig → `none`; sonst nach Anteil erledigter **Tagesquests** (`requiredDone / requiredCount`, wie beim Perfekten Tag inkl. Grabsteinen gelöschter Quests): alle → `perfect`, ≥ 50 % → `good` (2 von 4 ist genau 50 %, ganzzahlig gerechnet), > 0 → `weak`, 0 → `missed` – **außer**, an dem Tag ist eine andere Quest erledigt (`DayFacts.active`: etwa eine Wochenquest oder eine Quest außerhalb ihres Plans; Nebenquests und Teilfortschritt zählen nicht): dann `weak` („Ein Anfang“, −1) statt `missed` (−6). **Wochenquests kosten nie HP**: Sie sind nie fällig und können eine Wertung nur verbessern. In der Durchhänger-Pause wird aus `weak`/`missed` schließlich `absent` (siehe nächster Punkt).
- **Durchhänger-Pause** (`slumpPauseAfterDays` = 3): Ein **schadender** Tag ist `weak` oder `missed`, den kein Streak-Schutz auffängt (`isDamagingDay`). Chronologisch läuft ein Zähler schadender Tage in Folge (`slumpCountAfter`): schadender Tag → +1; `perfect`/`good` → 0 (die Pause endet); `rest`, `none` und aufgefangene (`frozen`) Tage zählen nicht und brechen nichts; ein abgerechneter `absent`-Eintrag (eine Pause oder ein alter Abwesenheits-Eintrag) hält den Zähler auf mindestens 3 – die Pause läuft. Stehen **unmittelbar vor** einem Tag ≥ 3 schadende Tage und wäre er `weak`/`missed`, ist er `absent` („Pause“): 0 HP, **kein** Streak-Schutz wird verbraucht. Reihenfolge an einem möglichen schadenden Tag: erst die Pause prüfen (Zähler ≥ 3 → `absent`), sonst einen Streak-Schutz einsetzen, wenn einer da ist (aufgefangen, Zähler unverändert), sonst schadend (Zähler + 1). Ein guter oder perfekter Tag beendet die Pause ganz normal (mit +2 bzw. +10).
  - Gezählt wird über das Ledger plus die gerade gewerteten Tage (`slumpCountOf`) – nie über Tage ohne Eintrag (vor `since`, Lücken im Ledger etwa nach dem Wiederherstellen eines Backups). Abrechnung (`settleDays`/`scoreDays`), Vorschau für gestern (`hpCalendar.pending` → `GameState.hp.yesterday`), `hp.current` (letzter `hpAfter` aus genau dieser Abrechnung) und die Statistik (`dayHistory`) nutzen denselben Baustein; die Statistik zählt vor dem Beginn der Abrechnung live über ihre Tage. Auch Tage im Sanften Modus zählen nach ihrer Wertung mit.
  - Folgen: Ein Durchhänger kostet höchstens 3 schadende Tage (≤ 3 × −6 = −18 HP, von vollen HP nie eine Niederlage) bis zum nächsten guten Tag; etwas zu tun ist nie schlechter als nichts. Beispiele: reine Abwesenheit von vollen HP – verpasst, verpasst, verpasst (−18), ab dem 4. Tag Pause; nur eine Wochenquest pro Woche, sonst nichts – −1, −6, −6 (zusammen −13), danach Pause bis zu einem guten Tag; ein Tag nur mit einer Wochenquest während der Pause bleibt Pause (0).
- HP-Wirkung `BALANCING.hpByScore` (+10 / +2 / −1 / −6 / 0) – höchstens −6 pro Tag. Max-HP = `hpBase + hpPerLevel × Level`.
- **Abrechnung** (`settleDays(data, today)`): Tage von `nextUnsettledDay` = `max(settings.penalties.since, letzter Ledger-Tag + 1)` bis `heute − backfillDays − 1` (**Gnadenfrist**: gestern kann noch nachgetragen werden), chronologisch. Ohne `since` wird nie abgerechnet. Lücken im Ledger werden nie nachträglich gefüllt.
  1. Wertung wie oben (`scoreDays`, dieselbe Funktion wie die Vorschau).
  2. **Streak-Schutz:** bei `weak`/`missed` (also nie in der Pause – ein `absent`-Tag kostet ohnehin nichts), wenn ein Streak-Schutz mit Kauftag ≤ Tag (Phase 3a: oder aus einer an einem Tag ≤ Tag geöffneten Truhe) übrig ist (gekauft bis zum Tag minus schon verbraucht, ältester zuerst) → `frozen: true`, keine HP-Wirkung, der Tag ist für alle Streaks ein Schontag. Ein heute gekaufter rettet gestern also nicht. Auch im Sanften Modus (schützt Streaks).
  3. HP: Start = `hpAfter` des vorigen Eintrags (Max-HP, wenn es keinen gibt oder er im Sanften Modus war). Änderung = Wertung (0, wenn `frozen`) + `healingPotion.heal` je Heiltrank mit Kauftag nach dem vorigen Eintrag bis einschließlich zum Tag (ohne Lücke: genau die vom Tag selbst). **Level-Up** an diesem Tag (Level am Tagesende > am Vortagesende, beides aus `totalXpTimeline`) → volle (neue) Max-HP, auch an einem verpassten Tag. `hpAfter = clamp(…, 0, maxHp)`. `hpDelta` = tatsächliche Änderung gegenüber dem Start (inkl. Heiltränke und Level-Up-Heilung).
  4. **Niederlage:** `hpAfter ≤ 0` (nur mit Lebenspunkten) → `defeat.goldLost = min(defeatGoldLossMax, floor(15 % × max(0, Guthaben)))` (höchstens 100 Gold – ab einem Guthaben von 667 Gold also immer genau 100), danach `hpAfter = maxHp`; `hpDelta` bleibt `−Start`. Das Guthaben ist `deriveGameState(…, Tag).gold.balance` am Ende des Niederlage-Tages (frühere Niederlagen schon abgezogen) – Ausgaben zählen dort wie überall **unabhängig von ihrem Tag**, also auch die bis zur Abrechnung getätigten: Eine Niederlage drückt das Guthaben nie unter 0, und eine spätere Abrechnung kann höchstens weniger kosten. Level, XP und Streaks bleiben immer.
  5. Sanfter Modus (`penalties.enabled === false` **zum Zeitpunkt der Abrechnung**): `penalties: false`, `hpDelta: 0`, `hpAfter = maxHp`, nie eine Niederlage. Wer ihn einschaltet, schont damit auch gestern (noch nicht abgerechnet); nach dem Wieder-Einschalten starten die HP voll.
- Einmal gespeicherte Einträge ändern sich nie: Löschen, Rhythmus ändern, Nachtragen oder Rast ändern wirken nicht auf abgerechnete Tage (Wertung, HP, Streak-Schutz, Niederlage, Statistik). Bei unveränderten Daten und Einstellungen hängen Wertung und HP nicht davon ab, wann abgerechnet wird (täglich = alles auf einmal); das Gold einer Niederlage rechnet mit den Ausgaben bis zur Abrechnung (Regel 4), der Sanfte Modus gilt zum Zeitpunkt der Abrechnung (Regel 5). Laufzeit: drei Jahre auf einmal ≈ 0,2 s (Review-Test), täglich wenige ms.
- Geprüft durch eine von Hand gerechnete Fünf-Wochen-Geschichte (`hp.story.test.ts`: jede Wertung inkl. eines Tages nur mit Wochenquest, Streak-Schutz, Heiltrank, Level-Up, Niederlage mit Gold-Obergrenze, Sanfter Modus aus/an, Urlaub, Durchhänger-Pausen – ein Tag nur mit Wochenquest bleibt in der Pause Pause, ein guter Tag beendet sie, ein Heiltrank wirkt auch in der Pause; zehn Tage Abwesenheit: 3 × −6, dann Pause –, Bearbeiten danach) und ein unabhängiges, bewusst langsames Referenzmodell (Wertung über `getDayState`, Level und Gold über `deriveGameState` je Tag) auf Zufallsverläufen. Die Durchhänger-Pause prüft zusätzlich `hp.slump.test.ts` mit von Hand gerechneten Ledgern (reine Abwesenheit, eine Wochenquest pro Woche, guter Tag dazwischen, Ruhetage, Streak-Schutz vor der Pause, alte `absent`-Einträge, Statistik = Abrechnung inkl. Tagen vor `since` und Ledger-Lücken, Vorschau für gestern).

### Abgeleiteter Zustand (Engine)
- `hpCalendar(data, asOf, …)` – Stand **zu Beginn** von `asOf`: `ledger` = Einträge vor `asOf`; `pending` = noch nicht abgerechnete Tage ab `since` bis `asOf − 1`, vorab gewertet wie bei der Abrechnung (normalerweise nur gestern); `freeDays` = Ruhetage + abgerechnete `frozen`-Tage + offene Tage, die ein Streak-Schutz auffangen würde.
- `GameState.hp` (`hpStateOf`): `enabled`; `max` = Max-HP des aktuellen Levels; `current` = letzter `hpAfter` (Max, ohne Eintrag oder nach einem Tag im Sanften Modus) + Heiltränke mit Kauftag nach dem letzten abgerechneten Tag, begrenzt auf `0 … max`; ist das Level jetzt höher als am letzten abgerechneten Tag → voll; im Sanften Modus immer `max`. `ratio`, `settledThrough`, `defeats`, `lastDefeat`. `yesterday` = Vorschau für den noch nachtragbaren Vortag (nur, wenn er ab `since` offen ist): `score` (nach denselben Regeln wie die Abrechnung, in der Durchhänger-Pause also `absent`), `threatenedDelta` = HP-Wirkung der Wertung (0 in der Pause, wenn ein Streak-Schutz ihn auffängt oder im Sanften Modus; ohne Heiltränke), `savedByFreeze`. Der noch offene Tag selbst steckt **nicht** in `current`.
- `GameState.inventory.streakFreezes` = gekauft (Kauftag ≤ heute) + aus geöffneten Truhen (Phase 3a, ab dem Spieltag des Öffnens) − verbraucht (abgerechnete `frozen`-Tage). Ein von der Vorschau für gestern eingeplanter Streak-Schutz zählt erst mit der Abrechnung als verbraucht.
- `GameState.restToday`; `gold.lostToDefeats` (Summe aus dem Ledger vor heute); Kennzahlen `defeats`, `perfectDaysAfterDefeat` (Perfekte Tage nach dem Tag der ersten Niederlage), `freezesUsed`.
- **Ruhetage** in der Engine: `isRequiredOn(…, restDays)` false → kein Perfekter Tag (auch wenn alles erledigt ist), Wertung `rest`; Quests bleiben sichtbar, Erledigungen bringen XP.
- **Schontage** gelten für alle Streaks, den Streak-Bonus, Bestwerte und Streak-Kapitel (`freeDays`, siehe `streaks.ts`). Bekannte Grenze: Löscht man eine gestern erledigte Quest, kann gestern schwach werden, ein vorrätiger Streak-Schutz ihn dann auffangen und der Streak-Bonus anderer Quests heute steigen – die einzige Ausnahme von „Löschen bringt nie XP“ (setzt Vorrat voraus; verbraucht dafür einen Streak-Schutz).

### Rast & Urlaub
- `RestPeriod {from, until}` (inklusive) global für alle Quests: An diesen Tagen ist keine Quest Pflicht, Streaks überstehen sie (Schontage), keine HP-Wirkung, kein Streak-Schutz-Verbrauch; für die Durchhänger-Pause zählen sie nicht (weder als schadender Tag noch als Ende der Pause). Quests können trotzdem erledigt werden (XP zählt, die Serie wächst). Wochen-Streaks: eine Woche mit Ruhetag bricht nie (zählt nur, wenn erfüllt).
- Anlegen/Ändern/Löschen nur für Tage ab `firstEditableRestDay(data, today)` = `max(heute − backfillDays, letzter Ledger-Tag + 1)` (gestern; nie ein abgerechneter Tag), auch in der Zukunft (Urlaub planen); höchstens `MAX_REST_PERIOD_DAYS` (60) Tage am Stück; keine Überschneidungen (angrenzend erlaubt).

### Gegenstände (Schatzkammer)
- `Purchase.kind 'item'` mit `itemId`: ❄️ `streakFreeze` (150 Gold, Vorrat max. 5), 🧪 `healingPotion` (80 Gold, +20 HP, wird **sofort** getrunken; nur mit Lebenspunkten und wenn `hp.current < max`). Titel/Icon/Preis als Momentaufnahme aus `ITEMS`.
- Rückgängig (`canUndoItemPurchase`): nur am Kauftag, solange dieser Tag nicht abgerechnet ist; ein Streak-Schutz außerdem nur, solange der Vorrat ohne ihn ≥ 0 bleibt (am Kauftag nie verbraucht). Belohnungen bleiben jederzeit rückgängig zu machen.

### Kapitel-Metrik „Bestwert“
- `ChapterMetric 'best'`, siehe `chapters.ts`. `planPace.ts` behandelt Bestwert-Kapitel wie manuelle Meilensteine (`isPlanPaced`): Wer genau nach Plan erledigt, erreicht keinen Bestwert über dem Tagesziel.

### Statistik (`src/domain/statistics.ts`, rein)
```ts
dayHistory(data, today): DayHistory          // { from, to, days: DayStat[], carriedXp } – ein Durchlauf, lückenlos
  // DayStat: required, requiredDone, done, questXp (inkl. Streak-Bonus), perfectBonusXp, sideQuestXp, chapterXp, xp,
  // totalXp, level, perfect, rest, score, settled, open, frozen, hp?, defeat?. Wertung: abgerechnet aus dem Ledger,
  // offene Tage aus der Vorschau (pending), sonst live nach denselben Regeln (Durchhänger-Zähler: slumpCountOf/
  // slumpCountAfter – ab dem Beginn der Abrechnung nur aus Ledger und Vorschau, davor live). Summe = GameState.level.totalXp.
  // Höchstens MAX_HISTORY_DAYS (10 Jahre) Tage, ältere XP als carriedXp.
statOn(history, day) · weeklyXp(history, weeks): WeekXp[] · xpTimeline(history, maxPoints = 120): { points, levelUps }
heatmap(history, weeks): HeatmapCell[][]     // Wochen × Mo–So, Stufen 0–4, 'tracked' | 'outside' | 'future'
scoreCounts(history, from?) · creditedCompletions(data, today)   // gutgeschriebene XP je Erledigung
completionRates(data, today, days = 30): HabitCompletionRate[]
  // Tagesquests: Plantage; Wochenquests: Wochen. Ruhetage zählen nie; heute/gestern bzw. die laufende Woche nur, wenn erledigt.
habitHeatmap(data, habitId, today, weeks) · attributeRadar(state.attributes): { axes, scale ≥ 5 }
```
Nutzt dieselben Bausteine wie die Engine (`dayFactsOf`, `restDaySet`, `hpCalendar`, `streakRunsBefore` mit Schontagen) – Zufallstests vergleichen Tag für Tag mit `deriveGameState`/`getDayState`; Kalender-Ränder (Schaltjahr, Zeitumstellung, ISO-Woche 53, leerer Verlauf) in `statistics.review.test.ts`. Bekannte Grenze: Kapitel ohne bekannten Abschlusstag (alte Daten) bucht die Statistik auf heute, `totalXpTimeline` von Anfang an.

### Ruhmeshalle (`src/domain/hallOfFame.ts`, rein)
`hallOfFame(data, today, campaigns = evaluateMainQuests(data, today)): HallOfFameEntry[]` – für jede gemeisterte Kampagne (auch archivierte), die zuletzt gemeisterte zuerst: Start, Abschlusstag (spätester Kapitel-`doneDay`, nie nach heute; ohne bekannten Tag heute), Dauer (beide Enden inklusive), Kapitel mit Abschlusstagen, zugehörige Quests (`linkedHabitIds`) mit erledigten Tagen und XP im Zeitraum (inkl. Streak-Bonus), `questXp`, `campaignXp` (Kapitel × `chapterXp` + `mainQuestXp`), `totalXp`, Belohnung, Frist/`onTime`, `dominantAttribute`. Die UI übergibt `[...state.mainQuests, ...state.archivedMainQuests]`.

### Daten (`src/data`)
- Dexie `version(4)`: `hpLedger '&day'`, `restPeriods '&id, from'` (in `allTables`). `loadGameData` liefert `hpLedger` nach Tag und `restPeriods` nach `from` (fehlen, wenn leer); `settings.penalties`/`hpIntroSeen` werden geprüft übernommen (`penalties` fehlt = Lebenspunkte an, noch nie abgerechnet). Backup siehe `backup.ts` (inkl. „Wiederherstellen nach einer Lücke“), `resetAllData` leert alles.
```ts
export const ITEMS: Record<ItemId, { title; icon; price }>   // ❄️ Streak-Schutz 150, 🧪 Heiltrank 80
export const ITEM_IDS; export const MAX_REST_PERIOD_DAYS = 60; export type RestPeriodDraft = Omit<RestPeriod, 'id' | 'createdAt'>
settleHpDays(today): Promise<HpLedgerEntry[]>
  // EINE Transaktion über allTables: ohne Held nichts; fehlt since → since = today (nie rückwirkend, enabled bleibt);
  // hängt settleDays(...) an; idempotent, auch gleichzeitig und aus mehreren Tabs (Transaktionen laufen nacheinander)
setPenaltiesEnabled(enabled, today)        // Aus = Sanfter Modus; since bleibt (Einschalten setzt es, falls es fehlt)
updateSettings(patch)                      // übernimmt hpIntroSeen; von penalties nur enabled – since nie per Patch
markHpIntroSeen()
firstEditableRestDay(data, today): DayKey  // für die UI (frühestes Datum)
addRestPeriod({ from, until, note? }, today): Promise<RestPeriod>
updateRestPeriod(id, patch, today)         // der Teil vor firstEditableRestDay bleibt fest (nur die Notiz ist frei)
deleteRestPeriod(id, today): Promise<'deleted' | 'shortened'>
  // beginnt ab firstEditableRestDay → gelöscht; läuft schon länger → endet am Tag davor (auch gestern ist dann
  // kein Rasttag mehr!); schon vorbei → Fehler. „Heute beenden“ ohne gestern zu verlieren: updateRestPeriod(id, { until: gestern })
purchaseItem(itemId, today): Promise<Purchase>
  // EINE Transaktion: Vorrat (5), Heiltrank nur mit Lebenspunkten und HP < Max, Guthaben (deutsche Fehler);
  // gleichzeitige Käufe überschreiten weder Vorrat noch Guthaben
undoPurchase(purchaseId, today?)           // Gegenstände nach canUndoItemPurchase, Belohnungen immer
```

### UI
- **App:** `HpSettler` (`src/app`, wie der `ProgressRecorder`, ohne Anzeige) ruft `settleHpDays(today)` beim Start, beim Tageswechsel und bei Rückkehr in die App auf – angestoßen nur bei geändertem Spieltag, Held oder `penalties.since`, nie zwei gleichzeitig (`settleQueue.ts`), ohne Held nichts, Fehler nur als `console.warn`.
- **Dashboard:** HP-Balken unter dem XP-Balken im Helden-Kopf (`HeroHp`, nur mit Lebenspunkten; ruhiges Rot `HP_COLOR` aus `features/feedback/hpTheme.ts`; vorrätiger Streak-Schutz als kleines „❄️ N“, `freezeStockTitle`) mit leiser Notiz zur letzten Abrechnung (`settlementNote`: Wochentag, weil das vorgestern ist; gute/perfekte Tage benannt, ein Tag in der Durchhänger-Pause ruhig als „Sonntag: Pause – der Schaden ruht bis zu deinem nächsten guten Tag“); unter 25 % ein sanfter Hinweis; Vorschau für gestern über der Quest-Karte nur, wenn gestern HP kosten würde oder ein Streak-Schutz nötig ist – in der Pause also nie („Gestern ist noch offen – Schon erledigt, nur nicht abgehakt?“ + „Nachtragen“ + „Ruhetag“: macht gestern nach Rückfrage per `addRestPeriod` zum Ruhetag, `useRestDayActions.takeRestYesterday`); beim Nachtragen für gestern der laufende Stand (`backfillStanding`, z. B. „Stand jetzt: −1 HP · Ein Anfang“, in der Pause „Stand jetzt: ±0 HP · Pause“, nur mit Lebenspunkten); in der Tageszusammenfassung von heute die Stufe „guter Tag“ (`goodDayMilestone`, nur mit Lebenspunkten); „Heute Ruhetag“-Aktion (mit Bestätigung, nur wenn noch nicht perfekt) mit Link „Urlaub planen“ (`REST_SETTINGS_PATH` = `/einstellungen?bereich=rast`) und Banner an Ruhetagen; einmalige Einführungskarte „Neu: Lebenspunkte“ (`markHpIntroSeen`). Texte in `pages/dashboard/hpText.ts`. Fokus nach Aktionen, deren Button verschwindet (Ruhetag einlegen/aufheben, Ruhetag für gestern, „Verstanden“): Ziele in `pages/dashboard/dashboardFocus.ts` (`REST_DAY_ACTION_ID`, `REST_DAY_UNDO_ID`, `DAY_SUMMARY_ID`, `nextTabbableAfter`).
- **Feedback:** `hpFeedbackEvents` (`features/feedback/hpFeedback.ts`) meldet nur neu angehängte Ledger-Einträge bzw. neue Heiltränke (erstes Laden, Massenänderungen und ersetzte Ledger bleiben still): Niederlage-Szene (Szenentyp `'defeat'`, würdevoll: „Du bist gefallen – und stehst wieder auf“, das Gold als Lohn des Heilers, volle HP, leiser Hinweis auf den Sanften Modus `DefeatSceneText.gentleHint`, kein Konfetti, höchstens einmal je Niederlage), Toasts „Streak-Schutz eingesetzt“ und „Heiltrank getrunken“. Der übliche Tagesschaden bekommt keinen Toast.
- **Schatzkammer:** Abschnitt „Gegenstände“ (`pages/treasury/ItemShop.tsx`, Logik in `items.ts`) mit Streak-Schutz (Vorrat x / 5; „In einer Pause bleibt er im Beutel“) und Heiltrank (HP-Balken), Kauf mit Bestätigung; die Chronik zeigt Gegenstände mit „Rückgängig“ nur, solange erlaubt, sonst ihren Verbleib; „Bei Niederlagen verloren“ in der Gold-Aufschlüsselung.
- **Einstellungen:** „Lebenspunkte“ (`LifePointsSettings`: an/aus = Sanfter Modus, Tabelle der Wertungen und Regel-Notizen aus `BALANCING`, `pages/settings/hpSettingsText.ts` – „Ein Anfang“ auch mit nur einer Wochenquest, „Pause“ nach `slumpPauseAfterDays` Tagen mit HP-Verlust in Folge bis zum nächsten guten Tag (Notiz: ein Durchhänger kostet höchstens `slumpPauseAfterDays × hpByScore.missed` = −18 HP, der Streak-Schutz bleibt in der Pause im Beutel), Niederlage mit Gold-Obergrenze; die Einführungskarte `hpIntroPoints` sagt dasselbe kurz) und „Rast & Urlaub“ (`RestSettings`, Logik in `restForm.ts`: planen mit Schnellwahl `restPresets(today, earliest)` – „Gestern“ nur, solange gestern noch änderbar ist –, Liste, löschen bzw. „ab heute beenden“ per `updateRestPeriod`). `?bereich=rast` scrollt zu „Rast & Urlaub“ und fokussiert den Abschnitt.
- **Held:** Reiter **Statistik** (`?tab=statistik`, `pages/hero/stats/`): Kennzahlen, Heatmap (26 Wochen, ab ca. 600 px Diagrammbreite 52) gesamt und pro Quest, XP pro Woche, XP-/Level-Verlauf, Erfüllungsquote, Attribut-Radar. Eigene SVG-Diagramme (`role="img"`, Tabelle „Als Tabelle anzeigen“, Tastatur), kein neues Paket. Ein Tag „Ein Anfang“ ohne erledigte Tagesquest nennt im Tooltip die andere Quest (`dayStatDetails`: „0 von 3 Tagesquests, dafür 1 andere Quest“); ein Tag in der Durchhänger-Pause heißt „Pause“, nennt, was trotzdem erledigt war, und „der Schaden ruht“ („Pause · 1 von 3 Tagesquests · +10 XP · der Schaden ruht“). Der Wochenschnitt (`statsText.ts`: `weeklySummary`/`weeklyXpSummary`/`weeklySubtitle` mit optionalem `since` = `DayHistory.from`) zählt nur abgeschlossene Wochen ab dem Abenteuerbeginn; vor der ersten ganzen Woche gibt es keinen Schnitt.
- **Kampagne:** Bereich **Ruhmeshalle** (`pages/campaign/HallOfFame.tsx`) für gemeisterte Kampagnen mit Bilanz (eine verpasste Frist wird nie erwähnt); Kapitel-Editor bietet „Bestwert“ nur für messbare Quests (`campaignText.ts`: `MEASURABLE_METRICS`, `needsMeasure`).

## Phase 3a – Klassen, Kampf, Wochen-Boss, Truhen, Titel & Rahmen (Vertrag)

Vom Spieler abgesegnet. Leitlinie: alles belohnt, nichts bestraft zusätzlich (ein entkommener Boss kostet nichts). Typen: `src/domain/types.ts` (Abschnitt „Phase 3a“), Zahlen: `BALANCING.combat`, `BALANCING.chests`. Nicht in 3a (Phase 3b): Begleiter, Kampagnen-Endbosse, Tagebuch, Wochenrückblick, Ton/Vibration.
Alles ist abgeleitet und deterministisch: gleiche Daten → gleiche Klasse, Bosse, Truhen (auch nach dem Neuladen, in jeder Reihenfolge der Listen). Dauerhaft gespeichert werden nur Fakten, die nicht mehr kippen sollen: Boss-Siege, gefundene Truhen (mit Inhalt), aus Truhen freigeschaltete Titel/Rahmen. Speichern ändert am Spielstand nichts (einzige Ausnahme: der Vorwochen-Boss verschwindet, sobald sein Sieg gespeichert ist).

### Helden-Seed & Hash (`combat/boss.ts`, `combat/hash.ts`)
- `heroSeedOf(profile)` = `profile.heroSeed` (falls gesetzt) sonst `createdDay + name`; ohne Profil `''`. Grundlage aller Kampf-Hashes des Helden (Boss, Schwäche, Truhen-Funde und -Inhalte). **Umbenennen würfelt nichts neu aus:** Benennt sich derselbe Held (gleicher `createdDay`) um, hält das Repository den bisherigen Seed in `CharacterProfile.heroSeed` fest (nur solange er vom abgeleiteten abweicht; heißt der Held wieder wie früher, fällt das Feld weg). Ein neuer Held (anderer Anlegetag) bekommt keinen; per Patch/Eingabe lässt er sich nicht setzen, nur das Backup stellt ihn wieder her. So bleiben Boss, Schwäche und offene Truhen-Funde der Woche beim Umbenennen gleich (und Truhen lassen sich nicht durch Umbenennen „neu würfeln“).
- Hash: `stableHash(text)` = `fmix32(fnv1a32(text))` (FNV-1a 32 bit plus der Avalanche-Schritt von MurmurHash3 – reines FNV-1a mischt die letzten Zeichen kaum, eine Quest würfe sonst an vielen Tagen in Folge eine Truhe ab). `hashUnit` → `[0, 1)`. Auswahl aus Listen per Rendezvous-Hashing (`rendezvousPick`: höchster `hashUnit(key + ':' + id)` gewinnt) – ein neuer, nicht gewählter Kandidat ändert die Wahl nicht. **Diese Funktionen dürfen sich nie ändern** (offene Funde und laufende Bosse würden neu ausgewürfelt).

### Klasse (`src/domain/combat/classes.ts`, rein)
- Ermittelt pro **Woche** (Montag, ISO-Woche wie überall): Attribut-Level am Ende des Vortags vor dem Montag (`HeroClassState.attributeLevels`, aus allen Attribut-XP mit Tag ≤ Sonntag, inkl. Streak-Bonus und Nebenquests – wie `GameState.attributes`). Wechsel also nur zu Wochenbeginn; am Montag kann das Nachtragen des Sonntags den Stand noch bewegen (ebenso Löschen).
- Höchstes Attribut < `classMinLevel` (3) → `adventurer`. Sonst: die zwei höchsten Attribute (Gleichstand → Reihenfolge `ATTRIBUTE_IDS`); liegen sie ≤ `hybridMaxLevelGap` auseinander und sind beide ≥ 3 → Hybridklasse dieses Paares (Tabelle unten), sonst Grundklasse des höchsten.
- Grundklassen: Stärke Krieger · Intelligenz Magier · Weisheit Druide · Charisma Barde · Vitalität Paladin · Disziplin Wächter. Hybride: STR+INT Kampfmagier (battlemage) · STR+WEI Mönch (monk) · STR+CHA Bannerträger (bannerbearer) · STR+VIT Berserker · STR+DIS Ritter (knight) · INT+WEI Erzmagier (archmage) · INT+CHA Illusionist · INT+VIT Heilkundiger (healer) · INT+DIS Runenschmied (runesmith) · WEI+CHA Seher (seer) · WEI+VIT Schamane (shaman) · WEI+DIS Templer (templar) · CHA+VIT Troubadour · CHA+DIS Feldherr (warlord) · VIT+DIS Grenzwächter (sentinel).
- Namen in drei Sprachformen (`CharacterProfile.form`, Standard `neutral`; `classNameFor`). Definitionen + Texte: `classDefinitions.ts` (`CLASS_DEFINITIONS`, `ATTACK_NAMES`, `GRAMMATICAL_FORMS`, `GRAMMATICAL_FORM_LABELS` „Heldin / Held / Neutral“). Neutrale Namen stehen für sich, ohne Artikel, höchstens 20 Zeichen (Kopfzeile bei 360 px): Wanderseele, Eisenherz, Arkane Seele, Stimme des Waldes, Goldkehle, Lichtgestalt, Schildwacht, Arkane Klinge, Stille Faust, Leuchtfeuer, Urgewalt, Ehrenklinge, Sternengeist, Zauberhand, Heilende Hand, Runengenie, Orakel, Trommelherz, Tempelwacht, Frohnatur, Leitstern, Grenzwacht. Welche Attribute zu welcher Klasse gehören, legt `classes.ts` fest (`BASE_CLASS_BY_ATTRIBUTE`, `HYBRID_CLASSES`); `classDefinitions.test.ts` prüft die Übereinstimmung.
- `classBonus`: Grundklasse `{ [attr]: 0.2 }`, Hybrid `{ [a]: 0.1, [b]: 0.1 }`, Abenteurer `{}`. `previousId` = Klasse der Vorwoche, falls anders (Wechsel-Szene).

### Schaden (`combat/damage.ts`)
- Jede **erledigte** Quest-Erledigung (value ≥ target) und jede erledigte Nebenquest der Woche (bis heute) ist ein Angriff mit ihrem Attribut (Momentaufnahme der Erledigung bzw. das der Nebenquest). Teilfortschritt: kein Angriff. Auch an Ruhetagen (Quests bleiben erledigbar).
- `damage = round(questXp(difficulty) × (1 + attributeBonusPerLevel × (level − 1)) × (1 + classBonus[attr] ?? 0) × (weakness ? weaknessMultiplier : 1))` – `level` = Attribut-Level der Woche (`HeroClassState.attributeLevels`), **ohne** Streak-Bonus (der bleibt XP-Sache). Gerechnet in Basispunkten (×,5 rundet stabil auf): mittel, Stärke 6, Krieger → 20 × 1,5 × 1,2 = 36; schwer 72; Weisheit 4 ohne Bonus → 26; gegen die Schwäche × 1,5.
- Angriffsnamen je Attribut: Stärke „Schwerthieb“, Intelligenz „Arkaner Blitz“, Weisheit „Mondlicht“, Charisma „Schlachtruf“, Vitalität „Lebensfunke“, Disziplin „Schildstoß“. Angriffe chronologisch: Tag, Quests vor Nebenquests, dann `updatedAt` bzw. `order`, dann ID.

### Wochen-Boss (`src/domain/combat/boss.ts`, rein)
- **Geplanter Wochenschaden** = Summe über alle Tage Mo–So der Woche und alle Quests, die an dem Tag Pflicht sind (`isRequiredOn`, Ruhetage zählen nicht), plus Wochenquests × `times` (Rhythmus vom Montag) – höchstens so oft, wie die Woche Tage hat, an denen die Quest aktiv, eine Wochenquest und kein Ruhetag ist (eine Urlaubswoche plant 0, eine am Samstag angelegte 3×-Quest höchstens 2): jeweils der Schaden einer Erledigung nach obiger Formel **ohne** Schwäche, mit aktuellem Attribut und aktueller Schwierigkeit der Quest. Ist er 0 → kein Boss (`bosses.current` fehlt).
- `maxHp = max(bossMinHp, round(bossHpShare × geplanter Schaden))`. Rast/Urlaub, die später in der Woche eingetragen werden, senken ihn, neue Quests heben ihn (abgeleitet).
- **Boss-Wahl:** Thema = Attribut mit dem größten geplanten Schaden (Gleichstand → `ATTRIBUTE_IDS`); aus den Bossen dieses Themas (`bosses.ts`, 3 je Attribut, 18 mit stabilen IDs) per Rendezvous-Hash von `heroSeed + weekStart`. **Schwäche:** per Hash aus den Attributen mit geplantem Schaden > 0 außer dem Thema; gibt es keine anderen, das Thema selbst.
- `damage` = Summe der Angriffe der Woche (Tage ≤ heute, ungedeckelt); `hp = max(0, maxHp − damage)`; `defeated` ⇔ gespeicherter Sieg für die Woche oder `damage ≥ maxHp`; `defeatedDay` = Tag, an dem die laufende Summe maxHp erreichte. `daysLeft` = Tage inkl. heute bis Sonntag.
- **Ein gespeicherter Sieg gewinnt immer:** Boss (sofern bekannt), `maxHp` und `defeatedDay` kommen aus ihm, `hp` ist 0 – auch wenn danach Erledigungen zurückgenommen werden oder Rast den Plan ändert. Die Schwäche wird weiter aus dem Plan abgeleitet.
- `bosses.previous` (nur montags, solange gestern zur Vorwoche gehört – Nachtragen am Montag zählt für die alte Woche): der Boss der Vorwoche mit den Kampf-Werten der Vorwoche, solange sein Sieg **nicht gespeichert** ist. Besiegt ihn das Nachtragen, steht er mit `defeated: true` da, bis der Recorder den Sieg speichert – danach fehlt er. Entkommen kostet nichts (kein Eintrag, keine Strafe).
- `unrecordedVictories([current, previous], gespeichert)` → `{ weekStart, bossId, day: defeatedDay, maxHp }` für den Recorder.

### Truhen (`src/domain/combat/chests.ts`, rein)
- **Boss-Truhe:** je Boss-Sieg (gespeichert oder gerade abgeleitet) `boss:<weekStart>` (foundDay = Siegtag) – auch für gespeicherte Siege außerhalb des Fensters.
- **Quest-Truhe:** für jeden Tag im Fenster: die erledigten Quest-Erledigungen des Tages (nach `id` sortiert); die erste mit `hash(heroSeed + ':' + completion.id) < questDropChance` liefert `quest:<completion.id>` – höchstens `maxQuestChestsPerDay` pro Tag **inklusive** schon gespeicherter Quest-Truhen dieses Tages (Zurücknehmen und eine andere abhaken bringt also keine zweite; Abhaken → Zurücknehmen → Abhaken ergibt dieselbe).
- **Kapitel-Truhe:** je abgeschlossenem Kapitel mit `doneDay` im Fenster `chapter:<questId>:<chapterId>`.
- **Fenster:** Neue Quest- und Kapitel-Truhen nur ab `chestWindowStart(today)` = Montag der Woche von gestern (dieselben Wochen wie die Bosse). Ältere Tage lassen sich nicht mehr ändern, ihre Truhen sind längst gespeichert – so beschert das Update keinen Berg rückwirkender Truhen aus dem ganzen Verlauf.
- **Inhalt** (festgelegt beim **Fund**; gespeicherte Truhen ändern sich nie): Würfel-Schlüssel `key = chestRollKey(heroSeed, id)` = `heroSeed + ':' + id` (der Seed gehört dazu, weil Boss-Truhen-IDs für alle Helden gleich sind – sonst bekämen zwei Helden auf zwei Handys jede Woche dieselbe Boss-Beute). Seltenheit per `hash(key + ':rarity')` gegen `rarityWeights` (70/22/7/1); common/uncommon: Gold gleichverteilt im Bereich (`hash(key + ':gold')`); rare: 50 % Streak-Schutz (`hash(key + ':rare')`) / 50 % ein noch freier Rahmen mit `condition.type === 'chest'` und Seltenheit rare (sonst `RARE_FALLBACK_GOLD` = 100); legendary: ein noch freier Truhen-Titel oder -Rahmen der Seltenheit legendary (sonst `LEGENDARY_FALLBACK_GOLD` = 150). „Frei“ = weder freigeschaltet noch schon in einer anderen Truhe (auch ungeöffnet) versprochen – keine Kosmetik liegt je in zwei Truhen; neue Truhen bekommen ihren Inhalt chronologisch (Fundtag, dann ID).
- Neu gefundene Truhen erscheinen sofort im Zustand (`GameState.chests`, nach Fundtag und ID) und werden vom Recorder gespeichert (`unrecordedChests`); gespeichert heißt dauerhaft (auch wenn die Quest später zurückgenommen wird).
- **Öffnen:** Gold zählt ab dem Öffnen (`gold.fromChests`, in `earned` und `balance`; die Erfolgs-Kennzahl `goldFromXp` bleibt ohne). Streak-Schutz → Vorrat – zählt ab dem **Spieltag des Öffnens** (`chestFreezeDays`: `openedAt` laut Tageswechsel, nie vor dem Fundtag), wie ein Kauf: ein heute geöffneter rettet gestern nicht. Vorschau für gestern (`hpCalendar`), Abrechnung (`settleDays`), Vorrat (`inventoryOf`) und `canUndoItemPurchase` zählen ihn gleich (ältester zuerst verbraucht). Bei vollem Vorrat stattdessen `freezeFallbackGold` (`contentOnOpen`, entschieden beim Öffnen und so gespeichert). Kosmetik → `CosmeticUnlock`; Kosmetik aus einer geöffneten Truhe zählt auch ohne ihn als freigeschaltet.
- `GameState.inventory.unopenedChests` = gefundene (auch noch nicht gespeicherte), ungeöffnete Truhen.

### Titel & Rahmen (`src/domain/combat/cosmetics.ts` + `cosmeticDefinitions.ts`)
- 24 Titel (drei Sprachformen; neutrale ohne Artikel, lesen sich nach dem Namen: „Aria, unbeugsamen Herzens“) und 12 Rahmen (`colors` für den Ring) mit `CosmeticCondition` (Erfolg, Anzahl Boss-Siege 1/5/10/25, bestimmter Boss, gemeisterte Kampagnen, Level, Truhe, immer). Start: Titel „guten Mutes“ (`daring`), Rahmen Wanderholz (`wanderwood`). Truhen-Kosmetik muss nach den Truhen-Regeln erreichbar sein: rare-Truhen geben nur Rahmen, deshalb sind die drei Truhen-Titel legendary. Titel- und Rahmen-IDs sind disjunkt (`cosmeticUnlocks` speichert nur die ID) und werden nie umbenannt. `RARITY_LABELS` (Gewöhnlich / Ungewöhnlich / Selten / Legendär).
- Freigeschaltet = Bedingung erfüllt **oder** `CosmeticUnlock` **oder** Kosmetik aus einer geöffneten Truhe. Erfolge und Boss-Siege sind dauerhaft (gespeichert bzw. gerade erreicht – der Recorder speichert sie); Level und gemeisterte Kampagnen nicht: Sinkt das Level (gelöschte Quest) oder wird eine gemeisterte Kampagne gelöscht, ist ein daran gebundener Titel/Rahmen wieder gesperrt. Gewählter Titel/Rahmen im Profil; nicht (mehr) freigeschaltet → nicht angezeigt (`activeTitle`/`activeFrame`).

### Daten (`src/data`)
- Dexie `version(5)`: `bossVictories '&weekStart'`, `chests '&id, foundDay'`, `cosmeticUnlocks '&id'` (in `allTables`). `loadGameData` liefert sie sortiert (Siege nach Woche, Truhen nach Fundtag und ID, Freischaltungen nach Tag und ID; fehlen, wenn leer). Backup (optional im Schema, Version unverändert, siehe `backup.ts`), Reset.
```ts
export interface ProgressRecord { achievementUnlocks?; bossVictories?; chests? }
recordProgress(progress: ProgressRecord): Promise<void>
  // EINE Transaktion, idempotent, überschreibt nie Vorhandenes (Erfolg behält seinen Tag, Sieg seinen Boss, Truhe Inhalt
  // und Öffnungszustand); doppelte Einträge im Aufruf: frühester Tag (Erfolge, Siege), erste Truhe. Sieg: weekStart ein
  // Montag, bossId, gültiger Tag, maxHp > 0. Neue Truhen immer ungeöffnet (openedAt und unbekannte Felder fallen weg);
  // Quest-Truhen höchstens maxQuestChestsPerDay je Fundtag, gespeicherte eingerechnet (überzählige werden übersprungen).
  // Ein ungültiger Eintrag → Fehler, nichts gespeichert. recordAchievementUnlocks ist ein Wrapper darum.
openChest(id, today, database?, now = Date.now()): Promise<ChestContent>
  // EINE Transaktion über allTables: gespeichert oder gerade gefunden (deriveGameState(…, today).chests – wird dabei
  // gespeichert), sonst "Diese Truhe gibt es nicht (mehr)."; schon geöffnet → "Diese Truhe hast du schon geöffnet.".
  // Setzt openedAt = now (mit echter Uhr aufrufen: der Spieltag von openedAt bestimmt, ab wann ein Streak-Schutz zählt);
  // Streak-Schutz bei vollem Vorrat → Inhalt wird freezeFallbackGold (so gespeichert); Kosmetik → cosmeticUnlocks (ein
  // vorhandener bleibt). Liefert den tatsächlichen Inhalt.
saveProfile(profile)        // + form, titleId, frameId: fehlt ein Feld, bleibt das gespeicherte; explizit undefined
                            // (bzw. '' bei Titel/Rahmen) entfernt es; geprüft wird nur Übergebenes ("Diese Sprachform gibt
                            // es nicht.", "Diesen Titel gibt es nicht.", "Diesen Rahmen gibt es nicht."); gespeicherte,
                            // inzwischen unbekannte IDs blockieren nichts. heroSeed: siehe „Helden-Seed“ (nur Repository).
updateProfile(patch)        // einzelne Felder, sonst wie saveProfile; ohne Held "Es gibt noch keinen Helden – beginne
                            // zuerst dein Abenteuer."
markCombatIntroSeen()       // settings.combatIntroSeen (auch per updateSettings)
export const GRAMMATICAL_FORMS                    // 'female' | 'male' | 'neutral'; startAdventure übernimmt form
```

### App (`src/app`)
- **`ProgressRecorder`** (ersetzt den `AchievementRecorder`; reine Logik in `pendingProgress.ts`): speichert neu erreichte Erfolge, Boss-Siege (`unrecordedVictories` über aktuellen und Vorwochen-Boss) und gefundene Truhen (`unrecordedChests`) gebündelt nach 800 ms in **einem** `recordProgress`. Neu geplant nur, wenn sich die Menge offener Einträge ändert; jeder Eintrag höchstens einmal, bis er in den Live-Daten steht; fehlgeschlagenes Speichern erst beim nächsten Start wieder; ohne Held nichts. Gespeichert wird, was beim Auslösen offen ist (eine Truhe, deren Quest binnen 800 ms zurückgenommen wurde, nie).

### UI
- **Dashboard:** Klasse im Helden-Kopf („Lvl 7 · 🔮 Magierin“, Titel unter dem Namen, Rahmen um den Avatar – nur freigeschaltete); **Boss-Karte** direkt unter dem Helden-Kopf (`pages/dashboard/BossCard.tsx`: Icon, Name, Lebensbalken in `BOSS_COLOR` #9b3fb5 aus `bossTheme.ts`, „noch N Tage“, Schwäche, „🎁 Truhe beim Sieg“; die Schwäche steht als Attribut da – „Schwäche: 🧘 Weisheit“, wie an den Quests –, der Angriffsname im Tooltip/Screenreader-Text; besiegt / „Kein Boss in Sicht“; Link „Truhe öffnen“ → `/held?tab=sammlung`); Treffer-Anzeige beim Abhaken (`useBossHits.ts`: Angriffsname und Schaden, Schwäche hervorgehoben; still beim ersten Laden, Wochenwechsel, gegen besiegte Bosse und bei mehr als 3 auf einmal); Montag: Hinweis zum Vorwochen-Boss (entkommen mit seiner Zeile und ggf. „Nachtragen“, bzw. besiegt); einmalige Einführungskarte „Neu: Klassen, Bosse & Beute“ mit Wahl der Sprachform (`CombatIntroCard.tsx`, `markCombatIntroSeen`). Texte in `pages/dashboard/combatText.ts`.
- **Feedback** (`features/feedback/combatFeedback.ts`): Siegesszene (Szenentyp `'boss'`, Boss besiegt + Truhe – Boss-Truhen erscheinen nur hier, nicht als Meldung), Klassenwechsel-Szene (`'class'`: einmal je Held und Woche, gemerkt unter `questlog:class-scene:<heroSeed>` im localStorage – bewusst auch beim App-Start, weil Klassen nur zu Wochenbeginn wechseln; vor dem Schließen der Einführungskarte still), Meldung „Truhe gefunden“ für Quest-/Kapitel-Truhen (still bei mehr als 3). **Truhen-Öffnen-Dialog** `features/combat/ChestOpenDialog` (`{ chestId, open, onClose, onOpened?, returnFocus? }`, z-[66] über den Szenen) mit Animation je Seltenheit (`CHEST_THEMES` – eine Seltenheit hat überall dieselbe Farbe: Dialog, Siegesszene, Meldung und Sammlung, dort `RARITY_COLORS` aus `CHEST_THEMES`), `AvatarFrame` (`{ frameId?, frame?, size, animate?, label?, dims?, className?, children }`; auch die Held-Seite, der Bearbeiten-Dialog und die Sammlung zeichnen Rahmen darüber – `AvatarMedallion` reicht seine Maße als `dims` durch, in Auswahllisten `animate={false}`). Solange der Dialog offen ist, ist die App `inert`: Wer ihn öffnet, gibt das Fokusziel nach dem Schließen per `returnFocus` mit (Sammlung: „Öffnen“ der nächsten Truhe, sonst die Chronik).
- **Held:** Klassen-Karte (aktuelle Klasse, warum, Attribut-Stand, mögliche nächste Klasse, Bonus); Reiter **Sammlung** (`?tab=sammlung`): Bestiarium (besiegt mit Datum/Anzahl, unbekannte als Silhouette; Themen im Genitiv per `bossThemeOf`: „Bosse des Charismas“, „der Stärke“), Truhen (ungeöffnete öffnen, Chronik), Titel & Rahmen (wählen, gesperrte mit Hinweis und Fortschritt). Profil bearbeiten + Onboarding: Sprachform (Heldin / Held / Neutral); die Überschrift des Onboarding-Schritts folgt ihr (`heroStepHeading` in `pages/hero/heroProfile.ts`: „Erschaffe deine Heldin“ / „deinen Helden“ / neutral, Standard, „deinen Charakter“).
- **Schatzkammer-Chronik** (`pages/treasury/items.ts` `itemOutcomes`): Ob ein gekaufter Streak-Schutz „Eingesetzt“ oder „Im Beutel“ ist, zählt Truhen-Streak-Schutz mit (ab dem Spieltag des Öffnens, `chestFreezeDays`; älteste zuerst, wie Abrechnung und Vorrat).

### Prüfung
- `phase3a.story.test.ts`: von Hand gerechnete Drei-Wochen-Geschichte (Abenteurerin → Magierin → Erzmagierin zu Wochenbeginn; Boss-HP und Schaden je Tag inkl. Schwäche; ein mitten in der Woche eingeplanter Ruhetag senkt die Boss-HP; Sieg am Donnerstag, danach zurückgenommen – der gespeicherte Sieg bleibt; Nachtragen des Sonntags am Montag besiegt den Vorwochen-Boss; Truhen je Tag mit Tageslimit; Öffnen, Gold und Vorrat; Neuladen in anderer Reihenfolge) mit nachgebautem Recorder, der bei jedem Speichern prüft, dass sich nichts rückwirkend ändert.
- `phase3a.review.test.ts` (Domain): Abrechnung mit Truhen-Streak-Schutz = Vorschau, Boss-Beute je Held verschieden, Umbenennen, Laufzeit (drei Jahre mit je Tag einer Truhe und wöchentlichen Siegen: `deriveGameState` und eine Abrechnung über alles je ≈ 50–60 ms). `data/phase3a.review.test.ts`: jede Inhaltsart über die echte Datenbank (inkl. Ersatz-Gold bei vollem Vorrat), Upgrade von Version 4 mit echtem Verlauf, Backup hin und zurück (auch ein altes Backup aus Phase 2b).
- Bekannte Grenzen: Ruhetage für die restliche Woche senken die Boss-HP sofort (ein so errungener, gespeicherter Sieg bleibt, auch wenn die Rast wieder gelöscht wird); derselbe Boss kann zwei Wochen in Folge kommen (3 je Thema); Titel/Rahmen an Level oder gemeisterten Kampagnen können wieder gesperrt werden (siehe oben).
