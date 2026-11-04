/**
 * Statistik (Phase 2b): reine Helfer für den Reiter „Statistik“ der Held-Seite.
 *
 * Grundlage ist die **Tages-Historie** (`dayHistory`): ein Durchlauf über alle Spieltage vom Beginn des Abenteuers
 * bis heute, pro Tag Pflicht/erledigt, XP (Quest-XP inkl. Streak-Bonus, Perfekter-Tag-Bonus, Nebenquests, Kapitel und
 * Kampagnen), Ruhetag und Tageswertung. Daraus leiten sich ohne weiteren Durchlauf ab:
 * - `weeklyXp`     XP pro ISO-Woche (Mo–So) für die letzten N Wochen
 * - `xpTimeline`   XP-/Level-Verlauf (ausgedünnte Punkte + Level-Aufstiege)
 * - `heatmap`      Kalender-Heatmap aller Quests (Wochen × Wochentage)
 * - `scoreCounts`  wie oft welche Tageswertung vorkam
 * Dazu, direkt aus `GameData`: `completionRates` (Erfüllungsquote pro Quest, letzte 30 Tage), `habitHeatmap`
 * (Heatmap einer Quest) und `attributeRadar` (Attributwerte für das Radar, aus `GameState.attributes`).
 *
 * Regeln (ARCHITECTURE.md „Phase 2b“):
 * - XP wie in der Engine (`engine.ts`): Jede erledigte Completion bringt `round(questXp × (1 + Streak-Bonus))`, der
 *   Perfekte Tag 25 % der Quest-XP des Tages, Nebenquests `questXp` am Erledigungstag, Kapitel `chapterXp` und eine
 *   gemeisterte Kampagne `mainQuestXp` am Abschlusstag. Die Summe der Historie ist damit die Gesamt-XP des Helden.
 *   Ruhetage und vom Streak-Schutz aufgefangene Tage (auch ein vorab geretteter Vortag) sind für den Streak-Bonus
 *   und Streak-Kapitel Schontage (`freeDays` in `streaks.ts`): Erledigtes zählt, Fehlendes bricht keine Serie.
 * - Ruhetag/Urlaub (`RestPeriod`): keine Pflicht-Quests, Wertung `rest`.
 * - Tageswertung: Für endgültig abgerechnete Tage gilt der Eintrag im HP-Ledger (`settled: true`, unveränderlich),
 *   für noch nicht abgerechnete Tage ab dem Einschalten der Lebenspunkte (normalerweise gestern) die Vorschau der
 *   Abrechnung (`HpCalendar.pending`, inkl. Streak-Schutz). Alle übrigen (vor dem Einschalten, heute) werden nach
 *   denselben Regeln live bewertet (`classifyDay` in `hpRules.ts`): Ruhetag → `rest`; keine Tagesquest fällig →
 *   `none`; sonst nach Anteil der erledigten Tagesquests: alle → `perfect`, ≥ 50 % → `good`, > 0 → `weak`,
 *   keine → `missed` (`weak`, wenn an dem Tag eine andere Quest erledigt ist, z. B. eine Wochenquest) – und in der
 *   Durchhänger-Pause (`slumpPauseAfterDays` schadende Tage in Folge davor) wird aus `weak`/`missed` `absent`.
 *   Den Zähler liefert derselbe Baustein wie bei der Abrechnung (`slumpCountOf`/`slumpCountAfter`): ab dem Beginn
 *   der Abrechnung (`since` bzw. erster Ledger-Tag) nur aus Ledger und Vorschau – so zeigt die Statistik für heute
 *   genau das, was die Abrechnung daraus machen wird –, davor live über die Tage der Historie.
 * - Ruhetage, Tagesfakten und Schontage kommen aus denselben Bausteinen wie in der Engine (`restDaySet`,
 *   `dayFactsOf`, `hpCalendar`) – die Statistik rechnet also nie anders als der Spielstand.
 *
 * Alles ist rein (keine Uhr, kein Zufall): Zeit kommt als `today` herein. Laufzeit der Historie:
 * O(Tage × Quests + Completions) – drei Jahre mit 15 Quests sind wenige Millisekunden.
 */
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING } from './balancing'
import { evaluateChapter } from './chapters'
import type { ChapterContext } from './chapters'
import { addDays, compareDays, diffDays, fromEpochDay, isValidDayKey, startOfWeek, toEpochDay } from './dates'
import { dayFactsOf } from './engine'
import { adventureStartOf, classifyDay, hpCalendar, isSlumpPause, restDaySet, slumpCountAfter, slumpCountOf } from './hp'
import type { DayFacts, HpCalendar, SlumpDay } from './hp'
import { levelFromXp } from './leveling'
import { isActiveOn, isArchivedOn, isDone, isRequiredOn, questXp, scheduleOn } from './schedule'
import { streakBonusForRun, xpWithStreakBonus } from './streakBonus'
import { streakRunsBefore } from './streaks'
import type {
  AttributeId,
  Completion,
  DayKey,
  DayScore,
  GameData,
  Habit,
  LevelInfo,
} from './types'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Ein Spieltag der Historie. */
export interface DayStat {
  day: DayKey
  /** Pflicht-Tagesquests (inkl. Grabsteinen gelöschter Quests, wie in der Engine); an Ruhetagen 0. */
  required: number
  /** Davon erledigt. */
  requiredDone: number
  /** Alle an diesem Tag erledigten Quests (auch Wochenquests und Quests außerhalb ihres Plans). */
  done: number
  /** Quest-XP inklusive Streak-Bonus (ohne Nebenquests). */
  questXp: number
  /** Bonus für den Perfekten Tag. */
  perfectBonusXp: number
  /** XP der an diesem Tag erledigten Nebenquests. */
  sideQuestXp: number
  /** XP der an diesem Tag abgeschlossenen Kapitel und Kampagnen. */
  chapterXp: number
  /** Alle XP des Tages (Summe der vier Quellen). */
  xp: number
  /** Gesamt-XP nach diesem Tag. */
  totalXp: number
  /** Charakter-Level nach diesem Tag. */
  level: number
  /** ≥ 1 Pflicht-Quest und alle erledigt. */
  perfect: boolean
  /** Ruhetag oder Urlaub. */
  rest: boolean
  /**
   * Tageswertung: abgerechnet aus dem HP-Ledger, für noch offene Tage die Vorschau, sonst live (`classifyDay`, mit
   * der Durchhänger-Pause wie bei der Abrechnung).
   */
  score: DayScore
  /** Der Tag ist endgültig abgerechnet (Wertung aus dem HP-Ledger). */
  settled: boolean
  /** Noch nicht abgerechnet und noch änderbar (heute bzw. innerhalb der Nachtrag-Frist). */
  open: boolean
  /**
   * Ein Streak-Schutz fängt den Tag auf: abgerechnet (Ledger) oder – für einen noch offenen Tag, normalerweise
   * gestern – als Vorschau der Abrechnung (dann `settled: false`).
   */
  frozen: boolean
  /** Lebenspunkte laut Ledger (nur abgerechnete Tage mit Lebenspunkten). */
  hp?: { delta: number; after: number; max: number }
  /** Niederlage an diesem Tag (nur abgerechnete Tage). */
  defeat?: { goldLost: number }
}

/** Lückenlose Tages-Historie, chronologisch. */
export interface DayHistory {
  /** Erster Tag: Beginn des Abenteuers bzw. der früheste Tag mit XP (höchstens `MAX_HISTORY_DAYS` zurück). */
  from: DayKey
  /** Letzter Tag (= today). */
  to: DayKey
  /** Ein Eintrag je Tag von `from` bis `to`. */
  days: DayStat[]
  /** XP aus der Zeit vor `from` (nur, wenn der Verlauf länger als `MAX_HISTORY_DAYS` ist; sonst 0). */
  carriedXp: number
}

/** XP einer ISO-Woche (Mo–So). */
export interface WeekXp {
  /** Montag der Woche. */
  weekStart: DayKey
  xp: number
  questXp: number
  perfectBonusXp: number
  sideQuestXp: number
  chapterXp: number
  /** Die Woche von heute (läuft noch). */
  current: boolean
}

export interface XpPoint {
  day: DayKey
  /** Gesamt-XP nach diesem Tag. */
  totalXp: number
  level: number
}

export interface LevelUp {
  day: DayKey
  /** Level vor dem Tag. */
  from: number
  /** Level nach dem Tag. */
  level: number
}

export interface XpTimelineSeries {
  /** Höchstens `maxPoints` Punkte, gleichmäßig verteilt; der erste und der letzte Tag sind immer dabei. */
  points: XpPoint[]
  /** Alle Tage mit Level-Aufstieg (vollständig, nicht ausgedünnt). */
  levelUps: LevelUp[]
}

/** Intensität einer Heatmap-Zelle: 0 = nichts … 4 = alles geschafft. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export interface HeatmapCell {
  day: DayKey
  /**
   * - tracked: Tag mit Daten (`stat` gesetzt)
   * - outside: vor Beginn der Historie
   * - future:  nach heute (Rest der laufenden Woche)
   */
  kind: 'tracked' | 'outside' | 'future'
  level: HeatLevel
  stat?: DayStat
}

/** Zustand einer Quest an einem Tag (Heatmap einer Quest). */
export type HabitDayState =
  /** Erledigt (Wert ≥ Ziel). */
  | 'done'
  /** Teilfortschritt (Wert > 0, aber unter dem Ziel). */
  | 'partial'
  /** Pflicht, aber nicht erledigt (und nicht mehr nachtragbar). */
  | 'missed'
  /** Pflicht, noch nicht erledigt – heute bzw. noch nachtragbar. */
  | 'open'
  /** Kein Plantag (bzw. Wochenquest ohne Erledigung an diesem Tag). */
  | 'free'
  /** Ruhetag/Urlaub. */
  | 'rest'
  /** Quest an diesem Tag nicht aktiv (noch nicht angelegt, archiviert oder pausiert). */
  | 'inactive'
  /** Nach heute. */
  | 'future'

export interface HabitHeatmapCell {
  day: DayKey
  state: HabitDayState
  /** Erfasster Wert (0 ohne Eintrag). */
  value: number
  /** Ziel an diesem Tag (Snapshot der Erledigung, sonst aktuelles Ziel; Abhak-Quest: 1). */
  target: number
  level: HeatLevel
}

export interface HabitCompletionRate {
  habit: Habit
  /** Tagesquests zählen Tage, Wochenquests Wochen (Einheit des aktuellen Rhythmus). */
  unit: 'day' | 'week'
  /**
   * Fällige Tage bzw. Wochen im Zeitraum. Ruhetage zählen nicht; heute (und ein noch nachtragbarer Vortag) bzw. die
   * laufende Woche nur, wenn schon erledigt. Wochen mit Pause oder Ruhetag zählen nur, wenn sie erfüllt wurden.
   */
  due: number
  /** Davon erledigt bzw. erfüllt. */
  done: number
  /** done / due (0 … 1); `undefined`, wenn im Zeitraum nichts fällig war. */
  rate?: number
}

export interface RadarAxis {
  id: AttributeId
  level: number
  totalXp: number
  /** Fortschritt im aktuellen Level, 0 … 1. */
  progress: number
  /** Position auf der Achse, 0 … 1: (Level + Fortschritt) / scale. */
  value: number
}

export interface AttributeRadar {
  /** In der festen Reihenfolge `ATTRIBUTE_IDS`. */
  axes: RadarAxis[]
  /** Level am Rand des Radars: mindestens `RADAR_MIN_SCALE`, sonst das (aufgerundete) höchste Attribut. */
  scale: number
}

/** Eine erledigte Completion mit den gutgeschriebenen XP (inkl. Streak-Bonus). */
export interface CreditedCompletion {
  completion: Completion
  xp: number
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

/** Längster Verlauf, den die Historie Tag für Tag abbildet (10 Jahre); ältere XP gehen als `carriedXp` ein. */
export const MAX_HISTORY_DAYS = 3653

/** Zeitraum der Erfüllungsquote. */
export const COMPLETION_RATE_DAYS = 30

/** Radar: Der Rand steht mindestens für dieses Level, damit ein frischer Held nicht schon „voll“ aussieht. */
export const RADAR_MIN_SCALE = 5

// ---------------------------------------------------------------------------
// Index (gleiche Regeln wie engine.ts → buildIndex)
// ---------------------------------------------------------------------------

interface StatsIndex {
  habits: readonly Habit[]
  habitsById: ReadonlyMap<string, Habit>
  /** Je Quest alle Completions bis heute (höchstens eine pro Tag), nach Tag aufsteigend. */
  completionsByHabit: ReadonlyMap<string, Completion[]>
  /** Tage mit erledigter Completion je Quest. */
  doneDaysByHabit: ReadonlyMap<string, ReadonlySet<DayKey>>
}

const NO_DAYS: ReadonlySet<DayKey> = new Set()

/**
 * Wie die Engine: Completions gelöschter Quests, mit ungültigem Tag oder nach `today` fallen weg; gibt es (kaputte
 * Daten) mehrere Einträge für Quest und Tag, gewinnt der zuletzt geänderte.
 */
function buildIndex(data: GameData, today: DayKey): StatsIndex {
  const habitsById = new Map<string, Habit>()
  for (const habit of data.habits) habitsById.set(habit.id, habit)

  const unique = new Map<string, Completion>()
  for (const c of data.completions) {
    if (!habitsById.has(c.habitId) || !isValidDayKey(c.day) || compareDays(c.day, today) > 0) continue
    const key = `${c.habitId}|${c.day}`
    const previous = unique.get(key)
    if (previous === undefined || c.updatedAt >= previous.updatedAt) unique.set(key, c)
  }

  const completionsByHabit = new Map<string, Completion[]>()
  const doneDaysByHabit = new Map<string, Set<DayKey>>()
  for (const c of unique.values()) {
    let list = completionsByHabit.get(c.habitId)
    if (!list) completionsByHabit.set(c.habitId, (list = []))
    list.push(c)
    if (isDone(c)) {
      let days = doneDaysByHabit.get(c.habitId)
      if (!days) doneDaysByHabit.set(c.habitId, (days = new Set()))
      days.add(c.day)
    }
  }
  for (const list of completionsByHabit.values()) list.sort((a, b) => compareDays(a.day, b.day))
  return { habits: data.habits, habitsById, completionsByHabit, doneDaysByHabit }
}

// ---------------------------------------------------------------------------
// Ruhetage, Streak-Schutz, Streak-Bonus – dieselben Bausteine wie die Engine
// ---------------------------------------------------------------------------

interface StatsCalendar {
  restDays: ReadonlySet<DayKey>
  /** Tagesfakten wie in der Engine (`dayFactsOf`): Pflicht/erledigt (an Ruhetagen keine Pflicht), aktiv. */
  factsOf: (day: DayKey) => DayFacts
  /** Abgerechnete Tage, Vorschau der noch offenen und Schontage (`hpCalendar`), Stand zu Beginn von `today`. */
  calendar: HpCalendar
}

/** Ruhetage, Tagesfakten und Kalender zum Stichtag – genau wie `deriveGameState` sie bildet. */
function statsCalendar(data: GameData, today: DayKey): StatsCalendar {
  const restDays = restDaySet(data.restPeriods)
  const factsOf = dayFactsOf(data, today, restDays)
  return { restDays, factsOf, calendar: hpCalendar(data, today, restDays, factsOf) }
}

/**
 * Erster Tag, ab dem die Abrechnung den Durchhänger-Zähler führt: der frühere von `penalties.since` und dem ersten
 * Ledger-Tag; `undefined`, solange es beides nicht gibt.
 */
function slumpLedgerStart(data: GameData, calendar: HpCalendar): DayKey | undefined {
  const since = data.settings.penalties?.since
  const first = calendar.ledger[0]?.day
  const validSince = since !== undefined && isValidDayKey(since) ? since : undefined
  if (validSince === undefined) return first
  return first !== undefined && compareDays(first, validSince) < 0 ? first : validSince
}

/**
 * Gutgeschriebene XP aller erledigten Completions (je Quest ein linearer Durchlauf, wie in der Engine).
 * @param freeDays Schontage (Ruhetage, vom Streak-Schutz aufgefangene Tage): brechen keine Serie.
 */
function creditIndex(index: StatsIndex, freeDays: ReadonlySet<DayKey>): Map<string, CreditedCompletion[]> {
  const result = new Map<string, CreditedCompletion[]>()
  for (const habit of index.habits) {
    if (result.has(habit.id)) continue // doppelte IDs (kaputte Daten): einmal zählen, wie im Index
    const done = (index.completionsByHabit.get(habit.id) ?? []).filter((c) => isDone(c))
    if (done.length === 0) continue
    const doneDays = index.doneDaysByHabit.get(habit.id) ?? NO_DAYS
    const runs = streakRunsBefore(habit, doneDays, done.map((c) => c.day), freeDays)
    result.set(
      habit.id,
      done.map((completion, i) => ({
        completion,
        xp: xpWithStreakBonus(questXp(completion.difficulty), streakBonusForRun(runs[i])),
      })),
    )
  }
  return result
}

/**
 * Erledigte Completions je Quest (nach Tag aufsteigend, nur bis `today`) mit den gutgeschriebenen XP inklusive
 * Streak-Bonus – genau die Quest-XP, die die Engine vergibt. Grundlage auch der Ruhmeshalle (`hallOfFame.ts`).
 */
export function creditedCompletions(data: GameData, today: DayKey): Map<string, CreditedCompletion[]> {
  return creditIndex(buildIndex(data, today), statsCalendar(data, today).calendar.freeDays)
}

// ---------------------------------------------------------------------------
// Tages-Historie
// ---------------------------------------------------------------------------

/** XP-Ereignisse außerhalb der Quests (Nebenquests, Kapitel, Kampagnen) je Tag. */
interface ExtraXp {
  sideQuests: Map<DayKey, number>
  chapters: Map<DayKey, number>
}

function addTo(map: Map<DayKey, number>, day: DayKey, xp: number) {
  map.set(day, (map.get(day) ?? 0) + xp)
}

function extraXpByDay(data: GameData, index: StatsIndex, today: DayKey, freeDays: ReadonlySet<DayKey>): ExtraXp {
  const sideQuests = new Map<DayKey, number>()
  for (const quest of data.sideQuests ?? []) {
    const { doneDay } = quest
    if (doneDay === undefined || !isValidDayKey(doneDay) || compareDays(doneDay, today) > 0) continue
    addTo(sideQuests, doneDay, questXp(quest.difficulty))
  }

  // Kapitel und Kampagnen (auch archivierte) wie in der Engine – am Abschlusstag; ohne bekannten Tag zählt heute.
  const chapters = new Map<DayKey, number>()
  const ctx: ChapterContext = {
    habitsById: index.habitsById,
    completionsByHabit: index.completionsByHabit,
    today,
    freeDays,
  }
  const clamp = (day: DayKey | undefined): DayKey =>
    day === undefined || !isValidDayKey(day) || compareDays(day, today) > 0 ? today : day
  for (const quest of data.mainQuests) {
    let allDone = quest.chapters.length > 0
    let completedOn: DayKey | undefined
    for (const chapter of quest.chapters) {
      const state = evaluateChapter(chapter, quest, ctx)
      if (!state.done) {
        allDone = false
        continue
      }
      const day = clamp(state.doneDay)
      addTo(chapters, day, BALANCING.chapterXp)
      if (completedOn === undefined || compareDays(day, completedOn) > 0) completedOn = day
    }
    if (allDone) addTo(chapters, completedOn ?? today, BALANCING.mainQuestXp)
  }
  return { sideQuests, chapters }
}

/** Frühester Tag mit Bedeutung für die Historie: Abenteuerbeginn oder erstes XP-Ereignis (nie nach today). */
function historyStart(adventureStart: DayKey, credited: Map<string, CreditedCompletion[]>, extra: ExtraXp, today: DayKey): DayKey {
  let start = today
  const consider = (day: DayKey | undefined) => {
    if (day !== undefined && isValidDayKey(day) && compareDays(day, start) < 0) start = day
  }
  consider(adventureStart)
  for (const list of credited.values()) consider(list[0]?.completion.day)
  for (const day of extra.sideQuests.keys()) consider(day)
  for (const day of extra.chapters.keys()) consider(day)
  return start
}

/**
 * Die Tages-Historie vom Beginn des Abenteuers (bzw. dem frühesten Tag mit XP) bis `today` – Grundlage aller
 * Diagramme der Statistik. Ein Durchlauf; die XP-Summe entspricht der Gesamt-XP des Helden (`GameState.level`).
 */
export function dayHistory(data: GameData, today: DayKey): DayHistory {
  const index = buildIndex(data, today)
  const { restDays, factsOf, calendar } = statsCalendar(data, today)
  const credited = creditIndex(index, calendar.freeDays)
  const extra = extraXpByDay(data, index, today, calendar.freeDays)
  const adventureStart = adventureStartOf(data, today)
  const earliest = historyStart(adventureStart, credited, extra, today)
  const from = diffDays(earliest, today) >= MAX_HISTORY_DAYS ? addDays(today, -(MAX_HISTORY_DAYS - 1)) : earliest

  // Quest-XP und Anzahl erledigter Quests je Tag; ältere XP gehen als Übertrag ein.
  let carriedXp = 0
  const questXpByDay = new Map<DayKey, number>()
  const doneByDay = new Map<DayKey, number>()
  for (const list of credited.values()) {
    for (const { completion, xp } of list) {
      if (compareDays(completion.day, from) < 0) {
        carriedXp += xp
        continue
      }
      addTo(questXpByDay, completion.day, xp)
      addTo(doneByDay, completion.day, 1)
    }
  }
  for (const map of [extra.sideQuests, extra.chapters]) {
    for (const [day, xp] of map) if (compareDays(day, from) < 0) carriedXp += xp
  }
  // Perfekte-Tage-Boni vor `from` lassen sich ohne Tageswerte nicht nachrechnen – bei einem Verlauf von über zehn
  // Jahren ist das vernachlässigbar (und betrifft nur den Übertrag, nie die gezeigten Tage).

  // Abgerechnete Tage (endgültig) und die Vorschau der noch offenen (normalerweise gestern, inkl. Streak-Schutz).
  const settled = new Map(calendar.ledger.map((entry) => [entry.day, entry]))
  const pending = new Map(calendar.pending.map((entry) => [entry.day, entry]))
  const openFrom = addDays(today, -BALANCING.backfillDays)

  // Durchhänger-Zähler (schadende Tage in Folge) wie bei der Abrechnung: vor dem Beginn der Abrechnung live über die
  // Tage der Historie; ab dann – wie `scoreDays` – nur aus Ledger und Vorschau. Live gewertete Tage dort (Lücken im
  // Ledger, heute) zählen nicht mit, genau wie sie bei der Abrechnung nie in die Folge eingehen.
  const ledgerStart = slumpLedgerStart(data, calendar)
  let slump = 0
  let fromLedger = false

  const days: DayStat[] = []
  let totalXp = carriedXp
  let level = levelFromXp(totalXp).level
  const start = toEpochDay(from)
  const end = toEpochDay(today)
  for (let epochDay = start; epochDay <= end; epochDay++) {
    const day = fromEpochDay(epochDay)
    const restDay = restDays.has(day)
    const facts = factsOf(day)
    const done = doneByDay.get(day) ?? 0
    const questXpOfDay = questXpByDay.get(day) ?? 0
    const perfect = facts.requiredCount >= 1 && facts.requiredDone === facts.requiredCount
    const perfectBonusXp = perfect ? Math.round(BALANCING.perfectDayBonus * questXpOfDay) : 0
    const sideQuestXp = extra.sideQuests.get(day) ?? 0
    const chapterXp = extra.chapters.get(day) ?? 0
    const xp = questXpOfDay + perfectBonusXp + sideQuestXp + chapterXp
    totalXp += xp
    level = xp > 0 ? levelFromXp(totalXp).level : level

    if (!fromLedger && ledgerStart !== undefined && compareDays(day, ledgerStart) >= 0) {
      fromLedger = true
      slump = slumpCountOf(calendar.ledger.filter((settledEntry) => compareDays(settledEntry.day, day) < 0))
    }
    const entry = settled.get(day)
    const preview = pending.get(day)
    const scored: SlumpDay = entry ??
      preview ?? {
        score: classifyDay(facts, { rest: restDay, pause: isSlumpPause(slump) }),
        frozen: false,
      }
    if (entry !== undefined || preview !== undefined || !fromLedger) slump = slumpCountAfter(slump, scored)
    const stat: DayStat = {
      day,
      required: facts.requiredCount,
      requiredDone: facts.requiredDone,
      done,
      questXp: questXpOfDay,
      perfectBonusXp,
      sideQuestXp,
      chapterXp,
      xp,
      totalXp,
      level,
      perfect,
      rest: restDay,
      score: scored.score,
      settled: entry !== undefined,
      open: entry === undefined && compareDays(day, openFrom) >= 0,
      frozen: scored.frozen === true,
    }
    if (entry?.penalties === true) stat.hp = { delta: entry.hpDelta, after: entry.hpAfter, max: entry.maxHp }
    if (entry?.defeat !== undefined) stat.defeat = { goldLost: entry.defeat.goldLost }
    days.push(stat)
  }
  return { from, to: today, days, carriedXp }
}

/** Der Eintrag eines Tages der Historie (O(1)); `undefined` außerhalb von `from … to`. */
export function statOn(history: DayHistory, day: DayKey): DayStat | undefined {
  if (!isValidDayKey(day)) return undefined
  const offset = diffDays(history.from, day)
  return offset >= 0 && offset < history.days.length ? history.days[offset] : undefined
}

// ---------------------------------------------------------------------------
// Ableitungen aus der Historie
// ---------------------------------------------------------------------------

/** XP der letzten `weeks` ISO-Wochen (Mo–So), älteste zuerst; die letzte ist die Woche von `history.to`. */
export function weeklyXp(history: DayHistory, weeks: number): WeekXp[] {
  const count = Math.max(0, Math.floor(weeks))
  const currentWeek = startOfWeek(history.to)
  const result: WeekXp[] = []
  for (let i = count - 1; i >= 0; i--) {
    const weekStart = addDays(currentWeek, -7 * i)
    const week: WeekXp = { weekStart, xp: 0, questXp: 0, perfectBonusXp: 0, sideQuestXp: 0, chapterXp: 0, current: i === 0 }
    for (let offset = 0; offset < 7; offset++) {
      const stat = statOn(history, addDays(weekStart, offset))
      if (!stat) continue
      week.xp += stat.xp
      week.questXp += stat.questXp
      week.perfectBonusXp += stat.perfectBonusXp
      week.sideQuestXp += stat.sideQuestXp
      week.chapterXp += stat.chapterXp
    }
    result.push(week)
  }
  return result
}

/**
 * XP-/Level-Verlauf: höchstens `maxPoints` Punkte (Gesamt-XP am Ende des Tages), gleichmäßig über die Historie
 * verteilt – erster und letzter Tag immer dabei – plus alle Level-Aufstiege.
 */
export function xpTimeline(history: DayHistory, maxPoints = 120): XpTimelineSeries {
  const { days } = history
  const limit = Math.max(2, Math.floor(maxPoints))
  const points: XpPoint[] = []
  if (days.length <= limit) {
    for (const stat of days) points.push({ day: stat.day, totalXp: stat.totalXp, level: stat.level })
  } else {
    const step = (days.length - 1) / (limit - 1)
    let previous = -1
    for (let i = 0; i < limit; i++) {
      const at = Math.round(i * step)
      if (at === previous) continue
      previous = at
      const stat = days[at]
      points.push({ day: stat.day, totalXp: stat.totalXp, level: stat.level })
    }
  }
  const levelUps: LevelUp[] = []
  let level = levelFromXp(history.carriedXp).level
  for (const stat of days) {
    if (stat.level > level) levelUps.push({ day: stat.day, from: level, level: stat.level })
    level = stat.level
  }
  return { points, levelUps }
}

/** Intensität eines Tages für die Heatmap aller Quests. */
function dayHeat(stat: DayStat): HeatLevel {
  switch (stat.score) {
    case 'perfect':
      return 4
    case 'good':
      return stat.requiredDone * 4 >= stat.required * 3 ? 3 : 2
    case 'weak':
      return 1
    case 'none':
    case 'rest':
      // Ohne Pflicht (nur Wochenquests) bzw. am Ruhetag: Erledigtes zählt trotzdem.
      return stat.done > 0 ? 2 : 0
    default:
      // Verpasst (bzw. Pause): Eine erledigte Quest ist trotzdem ein kleiner Schritt.
      return stat.done > 0 ? 1 : 0
  }
}

/** Kalender-Raster der letzten `weeks` Wochen (älteste zuerst), je Woche Mo … So. */
function weekGrid<T>(today: DayKey, weeks: number, cell: (day: DayKey) => T): T[][] {
  const count = Math.max(0, Math.floor(weeks))
  const currentWeek = startOfWeek(today)
  const grid: T[][] = []
  for (let i = count - 1; i >= 0; i--) {
    const weekStart = addDays(currentWeek, -7 * i)
    const week: T[] = []
    for (let offset = 0; offset < 7; offset++) week.push(cell(addDays(weekStart, offset)))
    grid.push(week)
  }
  return grid
}

/**
 * Heatmap aller Quests: `weeks` Spalten (älteste zuerst, die letzte enthält heute) zu je 7 Zellen (Mo … So).
 * Intensität: perfekt 4, gut 3 (≥ 75 %) bzw. 2, schwach 1, Tage ohne Pflicht (bzw. Ruhetage) mit Erledigungen 2,
 * verpasste Tage mit einer erledigten Wochenquest 1, sonst 0 – die Wertung (`stat.score`, z. B. `rest`) steht für
 * eigene Markierungen bereit.
 */
export function heatmap(history: DayHistory, weeks: number): HeatmapCell[][] {
  return weekGrid(history.to, weeks, (day) => {
    if (compareDays(day, history.to) > 0) return { day, kind: 'future', level: 0 }
    const stat = statOn(history, day)
    if (!stat) return { day, kind: 'outside', level: 0 }
    return { day, kind: 'tracked', level: dayHeat(stat), stat }
  })
}

/** Wie oft jede Tageswertung vorkam (optional erst ab `from`). */
export function scoreCounts(history: DayHistory, from?: DayKey): Record<DayScore, number> {
  const counts: Record<DayScore, number> = { perfect: 0, good: 0, weak: 0, missed: 0, rest: 0, none: 0, absent: 0 }
  for (const stat of history.days) {
    if (from !== undefined && compareDays(stat.day, from) < 0) continue
    counts[stat.score]++
  }
  return counts
}

// ---------------------------------------------------------------------------
// Pro Quest
// ---------------------------------------------------------------------------

let titleCollator: Intl.Collator | undefined

/** Wie die Listen: `order`, dann Titel (deutsch), dann ID. */
function compareHabits(a: Habit, b: Habit): number {
  titleCollator ??= new Intl.Collator('de')
  return a.order - b.order || titleCollator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Ruhetag-Prüfung für einzelne Tage. */
function restChecker(data: GameData): (day: DayKey) => boolean {
  const restDays = restDaySet(data.restPeriods)
  return (day) => restDays.has(day)
}

/** Erfüllungsquote einer Tagesquest: Plantage im Zeitraum (ohne Ruhetage; noch offene Tage nur, wenn erledigt). */
function dayRate(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  windowStart: DayKey,
  today: DayKey,
  isRest: (day: DayKey) => boolean,
): { due: number; done: number } {
  const openFrom = addDays(today, -BALANCING.backfillDays)
  let due = 0
  let done = 0
  for (let day = windowStart; compareDays(day, today) <= 0; day = addDays(day, 1)) {
    if (isRest(day) || !isRequiredOn(habit, day)) continue
    const isDoneDay = doneDays.has(day)
    if (!isDoneDay && compareDays(day, openFrom) >= 0) continue // läuft noch bzw. noch nachtragbar
    due++
    if (isDoneDay) done++
  }
  return { due, done }
}

/**
 * Erfüllungsquote einer Wochenquest: die `weeks` abgeschlossenen Wochen vor der laufenden plus die laufende, wenn sie
 * schon erfüllt ist. Es gilt das Wochenziel vom Montag (wie bei der Wochen-Serie); Wochen, in denen die Quest am
 * Montag keine Wochenquest war, zählen nicht. Unerfüllte Wochen, die nicht ganz verfügbar waren (noch nicht angelegt,
 * archiviert, pausiert oder mit Ruhetag), zählen ebenfalls nicht.
 */
function weekRate(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  weeks: number,
  today: DayKey,
  isRest: (day: DayKey) => boolean,
): { due: number; done: number } {
  const currentWeek = startOfWeek(today)
  let due = 0
  let done = 0
  for (let i = weeks; i >= 0; i--) {
    const monday = addDays(currentWeek, -7 * i)
    const schedule = scheduleOn(habit, monday)
    if (schedule.type !== 'weekly') continue
    const times = Math.max(1, schedule.times)
    let doneInWeek = 0
    let interrupted = false
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(monday, offset)
      if (compareDays(day, today) > 0) break
      if (doneDays.has(day)) doneInWeek++
      if (!isActiveOn(habit, day) || isRest(day)) interrupted = true
    }
    const fulfilled = doneInWeek >= times
    if (fulfilled) {
      due++
      done++
    } else if (i > 0 && !interrupted) {
      due++
    }
  }
  return { due, done }
}

/**
 * Erfüllungsquote pro Quest in den letzten `days` Tagen (Standard 30) – für alle Quests, die heute nicht archiviert
 * und schon angelegt sind, sortiert wie die Listen. Tagesquests zählen Plantage, Wochenquests Wochen (ca. `days / 7`
 * abgeschlossene Wochen plus die laufende, sobald sie erfüllt ist). Freundlich gerechnet: Was heute bzw. diese Woche
 * noch geschafft werden kann, zählt erst, wenn es erledigt ist; Ruhetage zählen nie.
 */
export function completionRates(data: GameData, today: DayKey, days = COMPLETION_RATE_DAYS): HabitCompletionRate[] {
  const index = buildIndex(data, today)
  const isRest = restChecker(data)
  const span = Math.max(1, Math.floor(days))
  const windowStart = addDays(today, -(span - 1))
  const weeks = Math.max(1, Math.round(span / 7))
  const habits = data.habits
    .filter((habit) => compareDays(habit.createdDay, today) <= 0 && !isArchivedOn(habit, today))
    .sort(compareHabits)
  return habits.map((habit) => {
    const doneDays = index.doneDaysByHabit.get(habit.id) ?? NO_DAYS
    const unit = habit.schedule.type === 'weekly' ? 'week' : 'day'
    const { due, done } =
      unit === 'week' ? weekRate(habit, doneDays, weeks, today, isRest) : dayRate(habit, doneDays, windowStart, today, isRest)
    const result: HabitCompletionRate = { habit, unit, due, done }
    if (due > 0) result.rate = done / due
    return result
  })
}

/** Intensität eines Quest-Tages: erledigt 4, Teilfortschritt je nach Anteil 1–2. */
function habitHeat(state: HabitDayState, value: number, target: number): HeatLevel {
  if (state === 'done') return 4
  if (state !== 'partial') return 0
  return target > 0 && value * 2 >= target ? 2 : 1
}

/**
 * Heatmap einer Quest: `weeks` Spalten (älteste zuerst, die letzte enthält heute) zu je 7 Zellen (Mo … So).
 * Unbekannte Quest → leeres Raster.
 */
export function habitHeatmap(data: GameData, habitId: string, today: DayKey, weeks: number): HabitHeatmapCell[][] {
  const habit = data.habits.find((candidate) => candidate.id === habitId)
  if (!habit) return []
  const index = buildIndex(data, today)
  const byDay = new Map((index.completionsByHabit.get(habit.id) ?? []).map((c) => [c.day, c]))
  const isRest = restChecker(data)
  const openFrom = addDays(today, -BALANCING.backfillDays)
  const defaultTarget = habit.measure?.target ?? 1
  return weekGrid(today, weeks, (day): HabitHeatmapCell => {
    const completion = byDay.get(day)
    const value = completion?.value ?? 0
    const target = completion?.target ?? defaultTarget
    let state: HabitDayState
    if (compareDays(day, today) > 0) state = 'future'
    else if (completion && isDone(completion)) state = 'done'
    else if (completion && value > 0) state = 'partial'
    else if (!isActiveOn(habit, day)) state = 'inactive'
    else if (isRest(day)) state = 'rest'
    else if (!isRequiredOn(habit, day)) state = 'free'
    else state = compareDays(day, openFrom) >= 0 ? 'open' : 'missed'
    return { day, state, value, target, level: habitHeat(state, value, target) }
  })
}

// ---------------------------------------------------------------------------
// Attribut-Radar
// ---------------------------------------------------------------------------

/**
 * Werte für das Attribut-Radar aus `GameState.attributes`: je Attribut Level, XP und die Position auf der Achse
 * (Level + Fortschritt im Level, geteilt durch `scale`).
 */
export function attributeRadar(attributes: Readonly<Record<AttributeId, LevelInfo>>): AttributeRadar {
  const fractional = (info: LevelInfo | undefined) =>
    info === undefined ? 0 : Math.max(0, (Number.isFinite(info.level) ? info.level : 0) + (Number.isFinite(info.progress) ? info.progress : 0))
  const highest = Math.max(0, ...ATTRIBUTE_IDS.map((id) => fractional(attributes[id])))
  const scale = Math.max(RADAR_MIN_SCALE, Math.ceil(highest))
  const axes = ATTRIBUTE_IDS.map((id): RadarAxis => {
    const info = attributes[id]
    return {
      id,
      level: info?.level ?? 1,
      totalXp: info?.totalXp ?? 0,
      progress: info?.progress ?? 0,
      value: Math.min(1, fractional(info) / scale),
    }
  })
  return { axes, scale }
}
