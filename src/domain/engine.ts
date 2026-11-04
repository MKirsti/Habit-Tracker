/**
 * Spiel-Engine: leitet aus den gespeicherten Fakten (`GameData`) den kompletten Spielzustand ab.
 *
 * XP-Regeln (siehe docs/ARCHITECTURE.md):
 * 1. Jede erledigte Completion (value ≥ target) mit day ≤ today gibt `round(questXp(c.difficulty) × (1 + bonus))`
 *    als Charakter-XP und dieselbe Menge Attribut-XP für `c.attribute`. `bonus` ist der Streak-Bonus
 *    (`streakBonus.ts`): +5 % pro Serien-Schritt unmittelbar vor dem Tag bzw. der Woche, höchstens +50 %.
 *    Teilfortschritt gibt 0 XP. Completions gelöschter Quests werden ignoriert.
 * 2. Perfekter Tag: ≥ 1 Pflicht-Quest und alle erledigt → Bonus = round(perfectDayBonus × Quest-XP des Tages).
 *    Die Quest-XP des Tages umfassen alle an dem Tag erledigten Quests (auch Wochenquests) inklusive
 *    Streak-Bonus. Nur Charakter-XP.
 *    Pflicht sind auch Grabsteine gelöschter Quests (`data.deletedHabits`) – ohne Erledigungen, also offen:
 *    Löschen macht so keinen vergangenen Tag nachträglich perfekt.
 * 3. Kapitel: `chapterXp` pro abgeschlossenem Kapitel, `mainQuestXp` pro komplett abgeschlossener Kampagne
 *    (auch archivierte). Nur Charakter-XP. Archivierte Kampagnen stehen in `archivedMainQuests` (gleiche
 *    Auswertung wie aktive), alle übrigen in `mainQuests`.
 * 4. adventureDay = diffDays(profile.createdDay, today) + 1 (ohne Profil: 1).
 * 5. getDayState sortiert sichtbare Quests nach `order` (dann `title`); Streaks gelten zum Stichtag `day`.
 * 6. Kampagnenfarbe: `MainQuestState.dominantAttribute` = Attribut mit den meisten planmäßigen XP pro Woche
 *    (questXp × Termine pro Woche) unter den heute aktiven Quests der Kampagne (`linkedHabitIds`); ist keine
 *    aktiv, unter allen bereits angelegten (archivierten/pausierten) – siehe `dominantAttributeOf`.
 *
 * Phase 2a (ARCHITECTURE.md „Phase 2a … (Vertrag)“):
 * - Nebenquests: erledigt (doneDay ≤ today) → `questXp(difficulty)` (ohne Streak-Bonus) an Charakter und
 *   Attribut. Zählen nie für den Perfekten Tag.
 * - Gold: floor(Gesamt-XP × goldPerXp) + Gold der freigeschalteten Erfolge − Ausgaben (kann negativ werden).
 * - Erfolge: aus den Kennzahlen (`AchievementStats`, hier berechnet) und den gespeicherten Freischaltungen
 *   (`achievements/evaluate.ts`); einmal freigeschaltet bleibt freigeschaltet.
 *
 * Phase 2b (ARCHITECTURE.md „Phase 2b … (Vertrag)“, Regeln in `hpRules.ts`, Abrechnung in `hp.ts`):
 * - Ruhetage/Urlaub (`data.restPeriods`): keine Quest ist Pflicht (kein Perfekter Tag, Wertung `rest`), die Quests
 *   bleiben sichtbar und bringen erledigt XP.
 * - Schontage (`HpCalendar.freeDays`: Ruhetage, abgerechnete `frozen`-Tage und ein vom Streak-Schutz geretteter,
 *   noch offener Vortag) brechen keine Serie – in Streaks, Streak-Bonus, Bestwerten und Streak-Kapiteln.
 * - `GameState.hp` (Lebenspunkte), `inventory` (Streak-Schutz-Vorrat), `restToday`; `gold.lostToDefeats` aus dem
 *   Ledger; Kennzahlen `defeats`, `perfectDaysAfterDefeat`, `freezesUsed`.
 * - Für die Abrechnung exportiert: `dayFactsOf` (Tagesfakten) und `totalXpTimeline` (Gesamt-XP am Ende jedes Tages).
 *
 * Pflicht/Sichtbarkeit eines Tages richten sich nach dem an diesem Tag gültigen Rhythmus (`scheduleOn`)
 * und berücksichtigen Pausen. Bearbeiten, Archivieren und Zurückholen einer Quest ändern so nie
 * nachträglich die Vergangenheit – verdiente XP und Perfekte Tage bleiben erhalten.
 *
 * Laufzeit: Alle Completions werden einmal vorab nach Quest und Tag indiziert. Danach kostet die Auswertung
 * grob O(Completions + Tage × Quests) – ohne wiederholtes Durchsuchen der Completion-Liste. Der Streak-Bonus
 * kostet pro Quest einen linearen Durchlauf über ihre Tage (`streakRunsBefore`).
 */
import { ACHIEVEMENTS } from './achievements/definitions'
import { achievementGold, countComebacks, evaluateAchievements } from './achievements/evaluate'
import { ATTRIBUTE_IDS } from './attributes'
import { BALANCING } from './balancing'
import { evaluateChapter } from './chapters'
import type { ChapterContext } from './chapters'
import { compareDays, diffDays, isValidDayKey, startOfWeek } from './dates'
import {
  firstDefeatDay,
  freezesUsedIn,
  goldLostToDefeats,
  hpCalendar,
  hpStateOf,
  inventoryOf,
  restDaySet,
} from './hpRules'
import type { DayFacts, HpCalendar } from './hpRules'
import { attributeLevelFromXp, levelFromXp, rankForLevel } from './leveling'
import {
  doneDaysInWeek,
  habitTarget,
  isActiveOn,
  isDone,
  isRequiredOn,
  isVisibleOn,
  questXp,
  scheduleOn,
} from './schedule'
import type { HabitTimeline } from './schedule'
import { streakBonusForRun, xpWithStreakBonus } from './streakBonus'
import { bestStreakIn, computeStreak, streakRunsBefore } from './streaks'
import { dominantAttribute } from './training'
import type {
  AchievementDefinition,
  AchievementStats,
  AttributeId,
  AttributeState,
  Completion,
  DayKey,
  DayState,
  GameData,
  GameState,
  GoldState,
  Habit,
  HabitStatus,
  MainQuest,
  MainQuestState,
  SideQuest,
  SideQuestState,
  Streak,
} from './types'

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** Vorab berechnete Nachschlagetabellen über die Completions. */
interface GameIndex {
  habits: readonly Habit[]
  /** Grabsteine gelöschter Quests: nur für die Pflicht-Quests eines Tages (immer offen). */
  deletedHabits: readonly HabitTimeline[]
  habitsById: ReadonlyMap<string, Habit>
  /** Tag → (Quest-ID → Completion). */
  completionsByDay: ReadonlyMap<DayKey, ReadonlyMap<string, Completion>>
  /** Quest-ID → Completions, nach Tag aufsteigend sortiert. */
  completionsByHabit: ReadonlyMap<string, Completion[]>
  /** Quest-ID → Tage, an denen die Quest erledigt war. */
  doneDaysByHabit: ReadonlyMap<string, ReadonlySet<DayKey>>
}

const NO_DAYS: ReadonlySet<DayKey> = new Set()

/**
 * Indiziert die Completions nach Quest und Tag.
 * - Completions zu nicht (mehr) existierenden Quests und mit ungültigem Tag werden verworfen.
 * - Mit `upTo` werden zusätzlich alle Completions nach diesem Tag verworfen (Zukunft).
 * - Pro Quest und Tag gibt es höchstens einen Eintrag; sollten (durch kaputte Daten) doch mehrere
 *   existieren, gewinnt der zuletzt geänderte – so werden XP nie doppelt vergeben.
 */
function buildIndex(data: GameData, upTo?: DayKey): GameIndex {
  const habitsById = new Map<string, Habit>()
  for (const habit of data.habits) habitsById.set(habit.id, habit)

  const unique = new Map<string, Completion>()
  for (const c of data.completions) {
    if (!habitsById.has(c.habitId) || !isValidDayKey(c.day)) continue
    if (upTo !== undefined && compareDays(c.day, upTo) > 0) continue
    const key = `${c.habitId}|${c.day}`
    const previous = unique.get(key)
    if (previous === undefined || c.updatedAt >= previous.updatedAt) unique.set(key, c)
  }

  const completionsByDay = new Map<DayKey, Map<string, Completion>>()
  const completionsByHabit = new Map<string, Completion[]>()
  const doneDaysByHabit = new Map<string, Set<DayKey>>()
  for (const c of unique.values()) {
    let byHabit = completionsByDay.get(c.day)
    if (!byHabit) completionsByDay.set(c.day, (byHabit = new Map()))
    byHabit.set(c.habitId, c)

    let list = completionsByHabit.get(c.habitId)
    if (!list) completionsByHabit.set(c.habitId, (list = []))
    list.push(c)

    if (isDone(c)) {
      let doneDays = doneDaysByHabit.get(c.habitId)
      if (!doneDays) doneDaysByHabit.set(c.habitId, (doneDays = new Set()))
      doneDays.add(c.day)
    }
  }

  // Aus der Datenbank kommen die Einträge meist schon sortiert (ID = `${habitId}:${day}`),
  // daher nur sortieren, wenn nötig.
  for (const list of completionsByHabit.values()) {
    if (!isSortedByDay(list)) list.sort((a, b) => compareDays(a.day, b.day))
  }

  return {
    habits: data.habits,
    deletedHabits: data.deletedHabits ?? [],
    habitsById,
    completionsByDay,
    completionsByHabit,
    doneDaysByHabit,
  }
}

function isSortedByDay(list: readonly Completion[]): boolean {
  for (let i = 1; i < list.length; i++) {
    if (compareDays(list[i - 1].day, list[i].day) > 0) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Streak-Bonus
// ---------------------------------------------------------------------------

/** Streak-Bonus, nachgeschlagen für die Auswertung eines Stichtags. */
interface StreakBonusTable {
  /** XP einer erledigten Completion inklusive Streak-Bonus (Regel 1). */
  xpOf(completion: Completion): number
  /** Streak-Bonus (Anteil) der Quest am Stichtag – den bekäme bzw. bekam eine Erledigung an diesem Tag. */
  bonusOf(habit: Habit): number
}

/**
 * Streak-Bonus aller Quests zum Stichtag `day`: pro Quest ein linearer Durchlauf (`streakRunsBefore`).
 * - `scope: 'history'` (Gesamtzustand): XP für **alle** erledigten Completions bis `day`.
 * - `scope: 'day'` (ein Tageszustand): nur für die Completions dieses Tages, und nur für Quests, die an dem Tag
 *   sichtbar sind oder eine Erledigung haben.
 * Weil der Bonus eines Tages nur von den Tagen davor (und dem Rhythmus des Tages) abhängt, liefern beide
 * Varianten für denselben Tag dieselben Werte. `freeDays`: Schontage (brechen keine Serie, siehe `streaks.ts`).
 */
function streakBonusTable(
  index: GameIndex,
  day: DayKey,
  scope: 'history' | 'day',
  freeDays: ReadonlySet<DayKey>,
): StreakBonusTable {
  const completionXp = new Map<Completion, number>()
  const bonusByHabit = new Map<string, number>()
  const dayCompletions = index.completionsByDay.get(day)
  for (const habit of index.habits) {
    let credited: Completion[]
    if (scope === 'history') {
      credited = (index.completionsByHabit.get(habit.id) ?? []).filter(
        (completion) => isDone(completion) && compareDays(completion.day, day) <= 0,
      )
    } else {
      const completion = dayCompletions?.get(habit.id)
      credited = completion !== undefined && isDone(completion) ? [completion] : []
      if (credited.length === 0 && !isVisibleOn(habit, day)) continue
    }
    const doneDays = index.doneDaysByHabit.get(habit.id) ?? NO_DAYS
    const runs = streakRunsBefore(habit, doneDays, [...credited.map((completion) => completion.day), day], freeDays)
    credited.forEach((completion, i) => {
      completionXp.set(completion, xpWithStreakBonus(questXp(completion.difficulty), streakBonusForRun(runs[i])))
    })
    bonusByHabit.set(habit.id, streakBonusForRun(runs[credited.length]))
  }
  return {
    xpOf: (completion) => completionXp.get(completion) ?? questXp(completion.difficulty),
    bonusOf: (habit) => bonusByHabit.get(habit.id) ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Tageszustand
// ---------------------------------------------------------------------------

type DaySummary = Pick<DayState, 'requiredCount' | 'requiredDone' | 'perfect' | 'questXp' | 'perfectBonusXp'>

/**
 * Pflicht-Quests eines Tages und wie viele davon erledigt sind. Grabsteine gelöschter Quests zählen als
 * Pflicht, wenn die Quest an dem Tag Pflicht war – erledigt sind sie nie (ihre Erledigungen wurden mit ihr
 * gelöscht). An Ruhetagen ist nichts Pflicht.
 */
function countRequired(
  index: GameIndex,
  dayCompletions: ReadonlyMap<string, Completion> | undefined,
  day: DayKey,
  restDays: ReadonlySet<DayKey>,
): { requiredCount: number; requiredDone: number } {
  let requiredCount = 0
  let requiredDone = 0
  if (restDays.has(day)) return { requiredCount, requiredDone }
  for (const habit of index.habits) {
    if (!isRequiredOn(habit, day)) continue
    requiredCount++
    const completion = dayCompletions?.get(habit.id)
    if (completion && isDone(completion)) requiredDone++
  }
  for (const tombstone of index.deletedHabits) {
    if (isRequiredOn(tombstone, day)) requiredCount++
  }
  return { requiredCount, requiredDone }
}

/**
 * Pflicht-Quests, Perfekter Tag und verdiente XP eines Tages.
 * Wird von `getDayState`, `deriveGameState` und `totalXpTimeline` gemeinsam genutzt, damit alle garantiert gleich
 * rechnen. Pflicht-Quests siehe `countRequired` (an Ruhetagen keine – also kein Perfekter Tag).
 * @param xpOf XP einer erledigten Completion inklusive Streak-Bonus.
 */
function summarizeDay(
  index: GameIndex,
  dayCompletions: ReadonlyMap<string, Completion> | undefined,
  day: DayKey,
  xpOf: (completion: Completion) => number,
  restDays: ReadonlySet<DayKey>,
): DaySummary {
  const { requiredCount, requiredDone } = countRequired(index, dayCompletions, day, restDays)

  // Quest-XP des Tages (inkl. Streak-Bonus): alle erledigten Quests, auch Wochenquests und Quests außerhalb
  // ihres Plans.
  let earnedXp = 0
  if (dayCompletions) {
    for (const completion of dayCompletions.values()) {
      if (isDone(completion)) earnedXp += xpOf(completion)
    }
  }

  const perfect = requiredCount >= 1 && requiredDone === requiredCount
  const perfectBonusXp = perfect ? Math.round(BALANCING.perfectDayBonus * earnedXp) : 0
  return { requiredCount, requiredDone, perfect, questXp: earnedXp, perfectBonusXp }
}

let titleCollator: Intl.Collator | undefined

/** Sortierung für Listen: `order`, dann Titel (deutsch), dann ID (für eine stabile Reihenfolge). */
function compareHabits(a: Habit, b: Habit): number {
  titleCollator ??= new Intl.Collator('de')
  return a.order - b.order || titleCollator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function buildHabitStatus(
  habit: Habit,
  day: DayKey,
  completion: Completion | undefined,
  doneDays: ReadonlySet<DayKey>,
  streak: Streak,
  streakBonus: number,
  restDays: ReadonlySet<DayKey>,
): HabitStatus {
  const done = completion ? isDone(completion) : false
  // Erledigt: die gutgeschriebenen XP (Schnappschuss der Erledigung) – so passt die Anzeige immer zur
  // Wertung, auch an früheren Tagen nach einer Änderung der Schwierigkeit. Der Streak-Bonus eines Tages hängt
  // nur von den Tagen davor ab: Offen zeigt er, was eine Erledigung jetzt brächte.
  const baseXp = questXp(done && completion ? completion.difficulty : habit.difficulty)
  const status: HabitStatus = {
    habit,
    required: isRequiredOn(habit, day, restDays),
    value: completion?.value ?? 0,
    target: completion?.target ?? habitTarget(habit),
    done,
    streak,
    xp: xpWithStreakBonus(baseXp, streakBonus),
    baseXp,
    streakBonus,
  }
  if (completion) status.completion = completion
  // Rhythmus dieses Tages: Nach einer Änderung zeigt ein früherer Tag den damals gültigen Rhythmus.
  const schedule = scheduleOn(habit, day)
  if (schedule.type === 'weekly') {
    // Wochenziel wie bei der Wochen-Serie: Es gilt das Ziel vom Montag der Woche, damit „Wochenziel erreicht“
    // in der Anzeige und in der Serie dasselbe bedeutet (ein mitten in der Woche gesenktes Ziel gilt ab dem
    // nächsten Montag). War die Quest am Montag noch keine Wochenquest, zählt die Woche nicht für die Serie –
    // dann gilt das Ziel des Tages.
    const monday = scheduleOn(habit, startOfWeek(day))
    const target = monday.type === 'weekly' ? monday.times : schedule.times
    status.week = { done: doneDaysInWeek(doneDays, day), target }
  }
  return status
}

function buildDayState(
  index: GameIndex,
  day: DayKey,
  streakOf: (habit: Habit) => Streak,
  bonus: StreakBonusTable,
  restDays: ReadonlySet<DayKey>,
): DayState {
  const dayCompletions = index.completionsByDay.get(day)
  const habits: HabitStatus[] = []
  for (const habit of index.habits) {
    if (!isVisibleOn(habit, day)) continue
    const doneDays = index.doneDaysByHabit.get(habit.id) ?? NO_DAYS
    habits.push(
      buildHabitStatus(
        habit,
        day,
        dayCompletions?.get(habit.id),
        doneDays,
        streakOf(habit),
        bonus.bonusOf(habit),
        restDays,
      ),
    )
  }
  habits.sort((a, b) => compareHabits(a.habit, b.habit))
  return { day, habits, ...summarizeDay(index, dayCompletions, day, bonus.xpOf, restDays) }
}

/** Tagesfakten für die Tageswertung (`hpRules.ts`): Pflicht/erledigt (an Ruhetagen 0) und ob etwas erledigt ist. */
function dayFactsFromIndex(index: GameIndex, restDays: ReadonlySet<DayKey>): (day: DayKey) => DayFacts {
  return (day) => {
    const dayCompletions = index.completionsByDay.get(day)
    let active = false
    if (dayCompletions !== undefined) {
      for (const completion of dayCompletions.values()) {
        if (isDone(completion)) {
          active = true
          break
        }
      }
    }
    return { ...countRequired(index, dayCompletions, day, restDays), active }
  }
}

/** Ruhetage und Kalender (Schontage, Vorschau) zum Stichtag `asOf`. */
function calendarFor(data: GameData, index: GameIndex, asOf: DayKey): HpCalendar {
  const restDays = restDaySet(data.restPeriods)
  return hpCalendar(data, asOf, restDays, dayFactsFromIndex(index, restDays))
}

/**
 * Zustand eines einzelnen Spieltags: sichtbare Quests mit Status, Pflicht-Fortschritt, Perfekter Tag, XP
 * (inklusive Streak-Bonus). Streaks werden zum Stichtag `day` berechnet – mit den Schontagen, die zu Beginn von
 * `day` gelten (Ruhetage, abgerechnete und vorab gerettete Streak-Schutz-Tage, siehe `hpCalendar`).
 */
export function getDayState(data: GameData, day: DayKey): DayState {
  const index = buildIndex(data)
  const { restDays, freeDays } = calendarFor(data, index, day)
  return buildDayState(
    index,
    day,
    (habit) => computeStreak(habit, index.doneDaysByHabit.get(habit.id) ?? NO_DAYS, day, undefined, freeDays),
    streakBonusTable(index, day, 'day', freeDays),
    restDays,
  )
}

// ---------------------------------------------------------------------------
// Nebenquests
// ---------------------------------------------------------------------------

/** Erledigt zum Stichtag: gültiger `doneDay` ≤ today (ein späterer – zurückgestellte Uhr – zählt noch nicht). */
function isSideQuestDone(quest: SideQuest, today: DayKey): boolean {
  return quest.doneDay !== undefined && isValidDayKey(quest.doneDay) && compareDays(quest.doneDay, today) <= 0
}

function sideQuestState(quest: SideQuest, today: DayKey): SideQuestState {
  const done = isSideQuestDone(quest, today)
  const dueDay = quest.dueDay !== undefined && isValidDayKey(quest.dueDay) ? quest.dueDay : undefined
  return {
    quest,
    done,
    overdue: !done && dueDay !== undefined && compareDays(dueDay, today) < 0,
    dueToday: dueDay === today,
    xp: questXp(quest.difficulty),
  }
}

/** order, dann Titel (deutsch), dann ID – wie bei den Quests. */
function compareSideQuestOrder(a: SideQuest, b: SideQuest): number {
  titleCollator ??= new Intl.Collator('de')
  return a.order - b.order || titleCollator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/**
 * Reihenfolge von `GameState.sideQuests`: erst die offenen – mit Termin zuerst, nach Termin (Überfällige liegen
 * damit vorn), dann ohne Termin –, jeweils nach `order`; danach die heute erledigten nach `order`.
 */
function compareSideQuestStates(a: SideQuestState, b: SideQuestState): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  if (!a.done) {
    const dueA = a.quest.dueDay !== undefined && isValidDayKey(a.quest.dueDay) ? a.quest.dueDay : undefined
    const dueB = b.quest.dueDay !== undefined && isValidDayKey(b.quest.dueDay) ? b.quest.dueDay : undefined
    if (dueA !== dueB) {
      if (dueA === undefined) return 1
      if (dueB === undefined) return -1
      return compareDays(dueA, dueB)
    }
  }
  return compareSideQuestOrder(a.quest, b.quest)
}

// ---------------------------------------------------------------------------
// Gold & Erfolge
// ---------------------------------------------------------------------------

/**
 * Gold aus XP: floor(Gesamt-XP × goldPerXp). Die winzige Toleranz fängt Gleitkomma-Rauschen ab
 * (z. B. 70 × 0,1 = 7,000000000000001 bzw. 6,999…), falls `goldPerXp` einmal keine Zweierpotenz ist.
 */
function goldFromXp(totalXp: number): number {
  return Math.max(0, Math.floor(totalXp * BALANCING.goldPerXp + 1e-9))
}

/** Summe der Ausgaben; ungültige oder negative Preise (kaputte Daten) zählen nicht. */
function goldSpent(data: GameData): number {
  let spent = 0
  for (const purchase of data.purchases ?? []) {
    if (Number.isFinite(purchase.price) && purchase.price > 0) spent += purchase.price
  }
  return spent
}

// ---------------------------------------------------------------------------
// Kampagnen
// ---------------------------------------------------------------------------

/**
 * Quests einer Kampagne: die mit ihr verknüpften (`mainQuestId`) plus alle (existierenden) Quests, auf die
 * ein Kapitel verweist oder die sie mitbenutzt (`sharedHabitIds`) – geteilte Quests, die einer anderen
 * Kampagne zugeordnet sind. Ohne Doppelte, sortiert wie die Listen (`order`, dann Titel).
 */
function linkedHabitIdsOf(quest: MainQuest, index: GameIndex): string[] {
  const linked = new Map<string, Habit>()
  for (const habit of index.habits) {
    if (habit.mainQuestId === quest.id) linked.set(habit.id, habit)
  }
  const referenced = quest.chapters.flatMap(({ criterion }) => (criterion.type === 'habit' ? [criterion.habitId] : []))
  for (const id of [...referenced, ...(quest.sharedHabitIds ?? [])]) {
    const habit = index.habitsById.get(id)
    if (habit !== undefined) linked.set(habit.id, habit)
  }
  return [...linked.values()].sort(compareHabits).map((habit) => habit.id)
}

/**
 * Das Attribut, das die Kampagne am stärksten trainiert (bestimmt ihre Hauptfarbe, `dominantAttribute` in
 * `training.ts`): Gewicht jeder Quest in `linkedHabitIds` = `questXp(difficulty)` × Termine pro Woche laut dem
 * heute gültigen Rhythmus; bei Gleichstand gewinnt die zuerst sortierte Quest (`linkedHabitIds` ist nach `order`
 * sortiert). Gezählt werden die am Tag `today` aktiven Quests. Ist keine davon aktiv (alle archiviert oder
 * pausiert, z. B. nach „Kampagne beenden“ mit ihren Quests), zählt ihr zuletzt gültiger Plan – so behält eine
 * Kampagne ihre Farbe. `undefined` ohne (bereits angelegte) Quest mit Gewicht.
 */
function dominantAttributeOf(
  linkedHabitIds: readonly string[],
  index: GameIndex,
  today: DayKey,
): AttributeId | undefined {
  const habits = linkedHabitIds.flatMap((id) => {
    const habit = index.habitsById.get(id)
    return habit !== undefined && compareDays(habit.createdDay, today) <= 0 ? [habit] : []
  })
  const planned = (list: readonly Habit[]) =>
    list.map((habit) => ({ attribute: habit.attribute, difficulty: habit.difficulty, schedule: scheduleOn(habit, today) }))
  return (
    dominantAttribute(planned(habits.filter((habit) => isActiveOn(habit, today)))) ?? dominantAttribute(planned(habits))
  )
}

function buildMainQuestState(quest: MainQuest, index: GameIndex, ctx: ChapterContext, today: DayKey): MainQuestState {
  const chapters = quest.chapters.map((chapter) => evaluateChapter(chapter, quest, ctx))
  const progress =
    chapters.length === 0 ? 0 : chapters.reduce((sum, chapter) => sum + chapter.progress, 0) / chapters.length
  const currentChapterIndex = chapters.findIndex((chapter) => !chapter.done)
  const linkedHabitIds = linkedHabitIdsOf(quest, index)
  const state: MainQuestState = {
    quest,
    chapters,
    progress,
    currentChapterIndex,
    complete: chapters.length > 0 && currentChapterIndex === -1,
    linkedHabitIds,
  }
  if (quest.deadline !== undefined) state.daysLeft = diffDays(today, quest.deadline)
  const dominantAttribute = dominantAttributeOf(linkedHabitIds, index, today)
  if (dominantAttribute !== undefined) state.dominantAttribute = dominantAttribute
  return state
}

/**
 * Kontext für die Kapitel-Auswertung. `freeDays` (Schontage) reicht die Engine für Streak-Kapitel mit – gleiche
 * Regeln wie bei den Quest-Streaks (`computeStreak`/`bestStreakIn`/`streakReachedDay` mit `freeDays`).
 */
function chapterContext(index: GameIndex, today: DayKey, freeDays: ReadonlySet<DayKey>): ChapterContext {
  const ctx = {
    habitsById: index.habitsById,
    completionsByHabit: index.completionsByHabit,
    today,
    freeDays,
  }
  return ctx
}

/** Alle Kampagnen (aktive und archivierte) in gespeicherter Reihenfolge, ausgewertet zum Tag `today`. */
function buildMainQuestStates(
  data: GameData,
  index: GameIndex,
  today: DayKey,
  freeDays: ReadonlySet<DayKey>,
): MainQuestState[] {
  const ctx = chapterContext(index, today, freeDays)
  return data.mainQuests.map((quest) => buildMainQuestState(quest, index, ctx, today))
}

/**
 * Wertet alle Kampagnen – aktive **und** archivierte, in gespeicherter Reihenfolge – zum Spieltag `today`
 * aus, genau wie `deriveGameState` (dieselben `MainQuestState`s, nur ohne den restlichen Spielzustand).
 * Für Prüfungen wie das Limit aktiver Kampagnen (`domain/campaigns.ts`).
 */
export function evaluateMainQuests(data: GameData, today: DayKey): MainQuestState[] {
  const index = buildIndex(data, today)
  return buildMainQuestStates(data, index, today, calendarFor(data, index, today).freeDays)
}

// ---------------------------------------------------------------------------
// Gesamtzustand
// ---------------------------------------------------------------------------

/** Optionen für `deriveGameState` (nur für Tests nötig). */
export interface DeriveOptions {
  /** Erfolgs-Definitionen; Standard: `ACHIEVEMENTS` aus `achievements/definitions.ts`. */
  achievements?: readonly AchievementDefinition[]
}

/**
 * Der komplette Spielzustand zum Spieltag `today`.
 * Completions nach `today` (z. B. durch eine zurückgestellte Uhr) werden überall ignoriert.
 */
export function deriveGameState(data: GameData, today: DayKey, options: DeriveOptions = {}): GameState {
  const index = buildIndex(data, today)
  // Phase 2b: Ruhetage, Abrechnung, Vorschau für gestern – daraus die Schontage für alle Streaks.
  const calendar = calendarFor(data, index, today)
  const { restDays, freeDays } = calendar
  const bonus = streakBonusTable(index, today, 'history', freeDays)

  // --- Regeln 1 + 2: Quest-XP (inkl. Streak-Bonus), Attribut-XP, Perfekte Tage ---------------
  // Perfekte Tage werden nur an Tagen mit Completions gesucht: Ein Tag ohne erledigte Quest kann nie
  // perfekt sein (≥ 1 Pflicht-Quest, alle erledigt). Das ist gleichwertig zur Prüfung des gesamten
  // Zeitraums ab Abenteuerbeginn, spart aber die Schleife über leere Tage.
  const attributeXp = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) attributeXp[id] = 0
  /** Unbekannte Attribute (kaputte Daten) geben nur Charakter-XP. */
  const addAttributeXp = (attribute: AttributeId, xp: number) => {
    if (Object.hasOwn(attributeXp, attribute)) attributeXp[attribute] += xp
  }

  let xpFromQuests = 0
  let xpFromStreakBonus = 0
  let xpFromPerfectDays = 0
  let questsCompleted = 0
  const perfectDayList: DayKey[] = []
  const activeDays: DayKey[] = []
  for (const [day, dayCompletions] of index.completionsByDay) {
    let anyDone = false
    for (const completion of dayCompletions.values()) {
      if (!isDone(completion)) continue
      anyDone = true
      const xp = bonus.xpOf(completion)
      questsCompleted++
      xpFromQuests += xp
      xpFromStreakBonus += xp - questXp(completion.difficulty)
      addAttributeXp(completion.attribute, xp)
    }
    if (anyDone) activeDays.push(day)

    const summary = summarizeDay(index, dayCompletions, day, bonus.xpOf, restDays)
    if (summary.perfect) {
      perfectDayList.push(day)
      xpFromPerfectDays += summary.perfectBonusXp
    }
  }
  const perfectDays = perfectDayList.length

  // --- Nebenquests: XP ohne Streak-Bonus, nie Teil des Perfekten Tags ---------------------------
  let xpFromSideQuests = 0
  let sideQuestsCompleted = 0
  const sideQuests: SideQuestState[] = []
  for (const quest of data.sideQuests ?? []) {
    const state = sideQuestState(quest, today)
    if (state.done) {
      sideQuestsCompleted++
      xpFromSideQuests += state.xp
      addAttributeXp(quest.attribute, state.xp)
    }
    // Liste: offene und die heute erledigten.
    if (!state.done || quest.doneDay === today) sideQuests.push(state)
  }
  sideQuests.sort(compareSideQuestStates)

  // --- Streaks zum heutigen Tag (für Bestwerte und die Heute-Ansicht) -----------------------
  const streakByHabit = new Map<string, Streak>()
  let bestDayStreak = 0
  let bestWeekStreak = 0
  for (const habit of index.habits) {
    const doneDays = index.doneDaysByHabit.get(habit.id) ?? NO_DAYS
    const streak = computeStreak(habit, doneDays, today, undefined, freeDays)
    streakByHabit.set(habit.id, streak)
    // Bestwerte in beiden Einheiten: Nach einer Umstellung zwischen Tages- und Wochenquest bleibt die in der
    // früheren Einheit erreichte Serie erhalten (ohne solche Umstellung kostet das nichts, siehe bestStreakIn).
    const dayBest = streak.unit === 'day' ? streak.best : bestStreakIn(habit, doneDays, 'day', today, undefined, freeDays)
    const weekBest =
      streak.unit === 'week' ? streak.best : bestStreakIn(habit, doneDays, 'week', today, undefined, freeDays)
    bestDayStreak = Math.max(bestDayStreak, dayBest)
    bestWeekStreak = Math.max(bestWeekStreak, weekBest)
  }

  // --- Regel 3: Kapitel & Kampagnen (archivierte zählen für XP mit) -------------------------
  let xpFromChapters = 0
  let chaptersCompleted = 0
  let campaignsCompleted = 0
  let activeCampaigns = 0
  const mainQuests: MainQuestState[] = []
  const archivedMainQuests: MainQuestState[] = []
  for (const state of buildMainQuestStates(data, index, today, freeDays)) {
    const doneChapters = state.chapters.filter((chapter) => chapter.done).length
    chaptersCompleted += doneChapters
    xpFromChapters += doneChapters * BALANCING.chapterXp
    if (state.complete) {
      campaignsCompleted++
      xpFromChapters += BALANCING.mainQuestXp
    }
    if (state.quest.archived === true) {
      archivedMainQuests.push(state)
    } else {
      mainQuests.push(state)
      // Aktiv = nicht archiviert und nicht abgeschlossen (wie `isCampaignActive` in campaigns.ts).
      if (!state.complete) activeCampaigns++
    }
  }

  // --- Level, Rang, Attribute -----------------------------------------------------------------
  const level = levelFromXp(xpFromQuests + xpFromPerfectDays + xpFromChapters + xpFromSideQuests)
  const attributes = {} as Record<AttributeId, AttributeState>
  for (const id of ATTRIBUTE_IDS) attributes[id] = { id, ...attributeLevelFromXp(attributeXp[id]) }

  // --- Regel 4: Abenteuertag (nie kleiner als 1, auch bei zurückgestellter Uhr) ---------------
  const adventureDay = data.profile ? Math.max(1, diffDays(data.profile.createdDay, today) + 1) : 1

  const totals = {
    questsCompleted,
    perfectDays,
    bestDayStreak,
    bestWeekStreak,
    activeDays: activeDays.length,
    xpFromQuests,
    xpFromStreakBonus,
    xpFromPerfectDays,
    xpFromChapters,
    xpFromSideQuests,
    sideQuestsCompleted,
  }

  // --- Phase 2b: Lebenspunkte, Vorrat, Niederlagen -------------------------------------------
  const hp = hpStateOf(data, calendar, today, level.level)
  const inventory = inventoryOf(data, calendar, today)
  const firstDefeat = firstDefeatDay(calendar.ledger)
  const perfectDaysAfterDefeat =
    firstDefeat === undefined ? 0 : perfectDayList.filter((day) => compareDays(day, firstDefeat) > 0).length

  // --- Gold & Erfolge -------------------------------------------------------------------------
  const fromXp = goldFromXp(level.totalXp)
  const attributeLevels = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) attributeLevels[id] = attributes[id].level
  const stats: AchievementStats = {
    questsCompleted,
    perfectDays,
    bestDayStreak,
    bestWeekStreak,
    activeDays: activeDays.length,
    adventureDay,
    level: level.level,
    totalXp: level.totalXp,
    attributeLevels,
    chaptersCompleted,
    campaignsCompleted,
    activeCampaigns,
    sideQuestsCompleted,
    // Eingelöste Belohnungen – Gegenstände (Streak-Schutz, Heiltrank) sind keine Einlösungen.
    purchases: (data.purchases ?? []).filter(
      (purchase) => purchase.kind !== 'item' && compareDays(purchase.day, today) <= 0,
    ).length,
    goldFromXp: fromXp,
    comebacks: countComebacks(activeDays),
    defeats: hp.defeats,
    perfectDaysAfterDefeat,
    freezesUsed: freezesUsedIn(calendar.ledger),
  }
  const achievements = evaluateAchievements(
    options.achievements ?? ACHIEVEMENTS,
    stats,
    data.achievementUnlocks ?? [],
    today,
  )
  const fromAchievements = achievementGold(achievements)
  const spent = goldSpent(data)
  const lostToDefeats = goldLostToDefeats(calendar.ledger)
  const gold: GoldState = {
    fromXp,
    fromAchievements,
    earned: fromXp + fromAchievements,
    spent,
    lostToDefeats,
    balance: fromXp + fromAchievements - spent - lostToDefeats,
  }

  const todayState = buildDayState(
    index,
    today,
    (habit) => streakByHabit.get(habit.id) ?? computeStreak(habit, NO_DAYS, today, undefined, freeDays),
    bonus,
    restDays,
  )

  return {
    today,
    adventureDay,
    level,
    rank: rankForLevel(level.level),
    attributes,
    totals,
    todayState,
    mainQuests,
    archivedMainQuests,
    gold,
    achievements,
    sideQuests,
    hp,
    inventory,
    restToday: restDays.has(today),
  }
}

// ---------------------------------------------------------------------------
// Für die HP-Abrechnung (`hp.ts`): Tagesfakten und XP-Verlauf
// ---------------------------------------------------------------------------

/**
 * Tagesfakten für die Tageswertung (`hpRules.ts` → `scoreDays`): Pflicht-Quests (inkl. Grabsteinen, an Ruhetagen
 * keine), davon erledigt, und ob überhaupt eine Quest erledigt wurde – exakt wie beim Perfekten Tag gezählt.
 * Completions nach `today` zählen nicht.
 */
export function dayFactsOf(data: GameData, today: DayKey, restDays: ReadonlySet<DayKey>): (day: DayKey) => DayFacts {
  return dayFactsFromIndex(buildIndex(data, today), restDays)
}

/** XP-Verlauf: Gesamt-XP am Ende jedes Tages. */
export interface XpTimeline {
  /**
   * Gesamt-XP aller Quellen am Ende des Tages `day` (Tage ≤ `today`): Quest-XP inkl. Streak-Bonus und
   * Perfekter-Tag-Bonus am Tag der Erledigung, Nebenquests am Erledigungstag, Kapitel am `doneDay`, Kampagnen am
   * Tag ihres letzten Kapitels. Abschlüsse ohne bekannten Tag zählen von Anfang an.
   * Bei gleichen Schontagen gilt `totalXpAt(d) = deriveGameState(data, d).level.totalXp`.
   */
  totalXpAt(day: DayKey): number
}

/**
 * Ein Durchlauf über den ganzen Verlauf (gleiche Bausteine wie `deriveGameState`) statt `deriveGameState` pro
 * Tag – Grundlage für das Level am Ende jedes abgerechneten Tages (Level-Up heilt voll, Max-HP hängt am Level).
 * @param days Ruhetage (keine Pflicht, kein Perfekter Tag) und Schontage (Streak-Bonus, Streak-Kapitel).
 */
export function totalXpTimeline(
  data: GameData,
  today: DayKey,
  days: { restDays: ReadonlySet<DayKey>; freeDays: ReadonlySet<DayKey> },
): XpTimeline {
  const index = buildIndex(data, today)
  const bonus = streakBonusTable(index, today, 'history', days.freeDays)
  const xpByDay = new Map<DayKey, number>()
  let base = 0
  const add = (day: DayKey | undefined, xp: number) => {
    if (day === undefined || !isValidDayKey(day)) base += xp
    else xpByDay.set(day, (xpByDay.get(day) ?? 0) + xp)
  }

  for (const [day, dayCompletions] of index.completionsByDay) {
    const summary = summarizeDay(index, dayCompletions, day, bonus.xpOf, days.restDays)
    add(day, summary.questXp + summary.perfectBonusXp)
  }
  for (const quest of data.sideQuests ?? []) {
    if (isSideQuestDone(quest, today)) add(quest.doneDay, questXp(quest.difficulty))
  }
  const ctx = chapterContext(index, today, days.freeDays)
  for (const quest of data.mainQuests) {
    const chapters = quest.chapters.map((chapter) => evaluateChapter(chapter, quest, ctx))
    let completedOn: DayKey | undefined
    for (const chapter of chapters) {
      if (!chapter.done) continue
      const doneDay = chapter.doneDay !== undefined && isValidDayKey(chapter.doneDay) ? chapter.doneDay : undefined
      add(doneDay, BALANCING.chapterXp)
      if (doneDay !== undefined && (completedOn === undefined || compareDays(doneDay, completedOn) > 0)) {
        completedOn = doneDay
      }
    }
    if (chapters.length > 0 && chapters.every((chapter) => chapter.done)) add(completedOn, BALANCING.mainQuestXp)
  }

  const sortedDays = [...xpByDay.keys()].sort(compareDays)
  const totals: number[] = []
  let running = base
  for (const day of sortedDays) {
    running += xpByDay.get(day) ?? 0
    totals.push(running)
  }
  return {
    totalXpAt(day) {
      // Letzter Tag ≤ day per Binärsuche.
      let low = 0
      let high = sortedDays.length - 1
      let found = -1
      while (low <= high) {
        const mid = (low + high) >> 1
        if (compareDays(sortedDays[mid], day) <= 0) {
          found = mid
          low = mid + 1
        } else {
          high = mid - 1
        }
      }
      return found === -1 ? base : totals[found]
    },
  }
}
