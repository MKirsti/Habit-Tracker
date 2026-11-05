/**
 * Gemeinsame Grundlage von Tagebuch (`journal.ts`) und Wochenrückblick (`weeklyReview.ts`) – rein.
 *
 * Rechnet die Tage eines Zeitraums genau so, wie Engine und Statistik sie werten (ARCHITECTURE.md „Phase 3b →
 * Tagebuch / Wochenrückblick“):
 * - Quest-XP: jede erledigte Completion `round(questXp × (1 + Streak-Bonus))`, Streak-Bonus mit den Schontagen zum
 *   Stichtag (`hpCalendar` → `freeDays`, wie `deriveGameState`); je Quest und Tag zählt eine Completion (die zuletzt
 *   geänderte), Completions gelöschter Quests und nach `today` zählen nicht – wie `buildIndex` der Engine.
 * - Perfekter Tag (Pflicht-Quests wie `dayFactsOf` der Engine, inkl. Grabsteinen, an Ruhetagen nie) und sein Bonus
 *   `round(25 % × Quest-XP)`.
 * - Nebenquests am Erledigungstag, Kapitel am `doneDay`, Kampagnen am Tag ihres letzten Kapitels – aus den schon
 *   ausgewerteten Kampagnen des Spielzustands (ohne bekannten Tag zählen sie, wie in der Statistik, für heute).
 * - Bester Tages-Streak am Ende jedes Tages (für „bester Streak der Woche“).
 * - Auf Wunsch die Attribut-XP der ganzen Geschichte bis zu einem Stichtag (Grundlage der Klassen-Folge) – im selben
 *   Streak-Durchlauf je Quest.
 *
 * Die Tagesfakten rechnet der Index selbst (statt `dayFactsOf`): Der Wochenrückblick läuft in `deriveGameState` mit,
 * ein zweiter Engine-Index wäre doppelte Arbeit (und ein Import-Kreis). `chronicleDays.test.ts` prüft die
 * Übereinstimmung mit `dayFactsOf`.
 *
 * Laufzeit: ein Durchlauf über die Completions, je Quest ein linearer Durchlauf (`streakRunsBefore`) für alle
 * abgefragten Tage zugleich, je Tag mit erledigter Quest einmal `factsOf` – O(Completions + Quests × Tage).
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import type { AttributeXpEntry } from '../combat/classes'
import { isAttributeId } from '../combat/damage'
import { addDays, compareDays, fromEpochDay, isValidDayKey, toEpochDay } from '../dates'
import { hpCalendar, restDaySet } from '../hpRules'
import type { DayFacts } from '../hpRules'
import type { HabitTimeline } from '../schedule'
import { isActiveOn, isDone, isRequiredOn, questXp, scheduleOn } from '../schedule'
import { streakBonusForRun, xpWithStreakBonus } from '../streakBonus'
import { streakRunsBefore } from '../streaks'
import type { AttributeId, Completion, DayKey, GameData, GameState, Habit } from '../types'

/** Was die Chronik aus dem Spielzustand braucht: die ausgewerteten Kampagnen (Kapitel mit Abschlusstag). */
export type CampaignSource = Pick<GameState, 'mainQuests' | 'archivedMainQuests'>

/** Vorab aufbereitete Daten zum Stichtag `today`. */
export interface ChronicleIndex {
  today: DayKey
  /** Quests, je ID eine (bei doppelten IDs – kaputte Daten – gilt wie in der Engine die zuletzt gespeicherte). */
  habits: readonly Habit[]
  /** Erledigte Completions je Quest bis `today`, nach Tag aufsteigend. */
  doneByHabit: ReadonlyMap<string, readonly Completion[]>
  /** Tage mit erledigter Completion je Quest. */
  doneDaysByHabit: ReadonlyMap<string, ReadonlySet<DayKey>>
  /** Tage mit mindestens einer erledigten Quest, aufsteigend (wie `GameTotals.activeDays`). */
  activeDays: readonly DayKey[]
  restDays: ReadonlySet<DayKey>
  /** Schontage zum Stichtag (Ruhetage, aufgefangene Tage) – dieselben wie in `deriveGameState`. */
  freeDays: ReadonlySet<DayKey>
  /** Tagesfakten wie beim Perfekten Tag (gleiche Werte wie `dayFactsOf` der Engine). */
  factsOf: (day: DayKey) => DayFacts
}

const NO_DAYS: ReadonlySet<DayKey> = new Set()

/**
 * Tagesfakten wie `dayFactsOf` der Engine: Pflicht-Quests des Tages (alle gespeicherten Quests und Grabsteine laut
 * `isRequiredOn`; an Ruhetagen keine), davon erledigt (Grabsteine nie), und ob überhaupt eine Quest erledigt wurde.
 */
function factsFromIndex(
  habits: readonly Habit[],
  tombstones: readonly HabitTimeline[],
  doneDaysByHabit: ReadonlyMap<string, ReadonlySet<DayKey>>,
  activeDays: ReadonlySet<DayKey>,
  restDays: ReadonlySet<DayKey>,
): (day: DayKey) => DayFacts {
  return (day) => {
    const active = activeDays.has(day)
    let requiredCount = 0
    let requiredDone = 0
    if (restDays.has(day)) return { requiredCount, requiredDone, active }
    for (const habit of habits) {
      if (!isRequiredOn(habit, day)) continue
      requiredCount++
      if (doneDaysByHabit.get(habit.id)?.has(day) === true) requiredDone++
    }
    for (const tombstone of tombstones) {
      if (isRequiredOn(tombstone, day)) requiredCount++
    }
    return { requiredCount, requiredDone, active }
  }
}

/** Index der Completions und Kalender zum Stichtag – gleiche Regeln wie `buildIndex`/`calendarFor` der Engine. */
export function chronicleIndex(data: GameData, today: DayKey): ChronicleIndex {
  const habitsById = new Map<string, Habit>()
  for (const habit of data.habits) habitsById.set(habit.id, habit)

  const unique = new Map<string, Completion>()
  for (const completion of data.completions) {
    if (!habitsById.has(completion.habitId) || !isValidDayKey(completion.day)) continue
    if (compareDays(completion.day, today) > 0) continue
    const key = `${completion.habitId}|${completion.day}`
    const previous = unique.get(key)
    if (previous === undefined || completion.updatedAt >= previous.updatedAt) unique.set(key, completion)
  }

  const doneByHabit = new Map<string, Completion[]>()
  const doneDaysByHabit = new Map<string, Set<DayKey>>()
  const active = new Set<DayKey>()
  for (const completion of unique.values()) {
    if (!isDone(completion)) continue
    let list = doneByHabit.get(completion.habitId)
    if (!list) doneByHabit.set(completion.habitId, (list = []))
    list.push(completion)
    let days = doneDaysByHabit.get(completion.habitId)
    if (!days) doneDaysByHabit.set(completion.habitId, (days = new Set()))
    days.add(completion.day)
    active.add(completion.day)
  }
  for (const list of doneByHabit.values()) list.sort((a, b) => compareDays(a.day, b.day))

  const restDays = restDaySet(data.restPeriods)
  // Wie die Engine: Pflicht zählt für jede gespeicherte Quest (auch doppelte IDs) und jeden Grabstein.
  const factsOf = factsFromIndex(data.habits, data.deletedHabits ?? [], doneDaysByHabit, active, restDays)
  const { freeDays } = hpCalendar(data, today, restDays, factsOf)
  return {
    today,
    habits: [...habitsById.values()],
    doneByHabit,
    doneDaysByHabit,
    activeDays: [...active].sort(compareDays),
    restDays,
    freeDays,
    factsOf,
  }
}

/** Frühester Tag mit Attribut-XP (erledigte Quest oder Nebenquest, ≤ today); `undefined` ohne jede. */
export function firstXpDay(index: ChronicleIndex, data: Pick<GameData, 'sideQuests'>): DayKey | undefined {
  let first: DayKey | undefined = index.activeDays[0]
  for (const quest of data.sideQuests ?? []) {
    const day = validDay(quest.doneDay, index.today)
    if (day !== undefined && (first === undefined || compareDays(day, first) < 0)) first = day
  }
  return first
}

/** Ein Tag der Chronik. */
export interface ChronicleDay {
  day: DayKey
  /** Quest-XP inklusive Streak-Bonus (ohne Nebenquests). */
  questXp: number
  perfectBonusXp: number
  sideQuestXp: number
  /** Kapitel- und Kampagnen-XP. */
  chapterXp: number
  /** Alle XP des Tages. */
  xp: number
  /** Erledigte Quests (Completions, ohne Nebenquests). */
  done: number
  /** ≥ 1 Pflicht-Quest und alle erledigt. */
  perfect: boolean
  /** Ruhetag oder Urlaub. */
  rest: boolean
  /** Attribut-XP des Tages: Quests (inkl. Streak-Bonus) und Nebenquests. */
  attributeXp: Record<AttributeId, number>
  /**
   * Längster Tages-Streak (über alle Tagesquests, die an dem Tag aktiv sind) am Ende des Tages – erreicht oder
   * gehalten. Nur mit `streaks: true` ermittelt, sonst 0.
   */
  bestStreak: number
}

export interface ChronicleDaysOptions {
  /** Erster Tag (inklusive). */
  from: DayKey
  /** Letzter Tag (inklusive, höchstens `today`). */
  to: DayKey
  /** Auch den besten Tages-Streak je Tag ermitteln. */
  streaks?: boolean
  /** Zusätzlich die Attribut-XP aller Erledigungen (Quests und Nebenquests) bis zu diesem Tag sammeln. */
  entriesThrough?: DayKey
}

export interface ChronicleDays {
  /** Die Tage `from … to` (höchstens bis `today`), aufsteigend. */
  days: Map<DayKey, ChronicleDay>
  /** Attribut-XP mit Tag bis `entriesThrough` (leer ohne die Option) – Eingabe für `classTimeline`. */
  entries: AttributeXpEntry[]
}

function emptyAttributeXp(): Record<AttributeId, number> {
  const xp = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) xp[id] = 0
  return xp
}

/** Gültiger Tag ≤ today, sonst `undefined`. */
function validDay(day: DayKey | undefined, today: DayKey): DayKey | undefined {
  return day !== undefined && isValidDayKey(day) && compareDays(day, today) <= 0 ? day : undefined
}

/**
 * Kapitel- und Kampagnen-XP je Tag (wie `statistics.ts`): Kapitel am `doneDay`, eine gemeisterte Kampagne am Tag
 * ihres letzten Kapitels; ohne bekannten Tag zählt heute.
 */
export function chapterXpByDay(campaigns: CampaignSource, today: DayKey): Map<DayKey, number> {
  const byDay = new Map<DayKey, number>()
  const add = (day: DayKey, xp: number) => byDay.set(day, (byDay.get(day) ?? 0) + xp)
  for (const state of [...campaigns.mainQuests, ...campaigns.archivedMainQuests]) {
    let completedOn: DayKey | undefined
    for (const chapter of state.chapters) {
      if (!chapter.done) continue
      const day = validDay(chapter.doneDay, today) ?? today
      add(day, BALANCING.chapterXp)
      if (completedOn === undefined || compareDays(day, completedOn) > 0) completedOn = day
    }
    if (state.complete) add(completedOn ?? today, BALANCING.mainQuestXp)
  }
  return byDay
}

/**
 * Die Tage `from … to` (höchstens bis `today`) mit XP, Perfektem Tag, Ruhetag, Attribut-XP und – auf Wunsch – dem
 * besten Tages-Streak sowie den Attribut-XP der Geschichte. Leer, wenn der Zeitraum leer ist.
 */
export function chronicleDays(
  index: ChronicleIndex,
  data: GameData,
  campaigns: CampaignSource,
  options: ChronicleDaysOptions,
): ChronicleDays {
  const { today } = index
  const from = options.from
  const to = compareDays(options.to, today) > 0 ? today : options.to
  const through = validDay(options.entriesThrough, today)
  const days = new Map<DayKey, ChronicleDay>()
  const entries: AttributeXpEntry[] = []
  const hasRange = isValidDayKey(from) && isValidDayKey(to) && compareDays(from, to) <= 0
  if (!hasRange && through === undefined) return { days, entries }
  const inRange = (day: DayKey) => hasRange && compareDays(day, from) >= 0 && compareDays(day, to) <= 0
  const inHistory = (day: DayKey) => through !== undefined && compareDays(day, through) <= 0

  if (hasRange) {
    for (let epochDay = toEpochDay(from), end = toEpochDay(to); epochDay <= end; epochDay++) {
      const day = fromEpochDay(epochDay)
      days.set(day, {
        day,
        questXp: 0,
        perfectBonusXp: 0,
        sideQuestXp: 0,
        chapterXp: 0,
        xp: 0,
        done: 0,
        perfect: false,
        rest: index.restDays.has(day),
        attributeXp: emptyAttributeXp(),
        bestStreak: 0,
      })
    }
  }
  const dayList = [...days.keys()]

  // Quests: XP inklusive Streak-Bonus und – auf Wunsch – der Tages-Streak am Ende jedes Tages, je Quest in einem
  // Durchlauf (`streakRunsBefore` beantwortet alle Stichtage zugleich).
  for (const habit of index.habits) {
    const completions = (index.doneByHabit.get(habit.id) ?? []).filter(
      (completion) => inRange(completion.day) || inHistory(completion.day),
    )
    const queries = completions.map((completion) => completion.day)
    /** Tage, deren Streak-Stand am Abend abgefragt wird (Stichtag = der Tag danach). */
    const streakDays: DayKey[] = []
    if (options.streaks === true) {
      for (const day of dayList) {
        // Nur Tage, an denen die Quest aktiv und eine Tagesquest ist (eine archivierte Serie „ruht“ nur).
        if (!isActiveOn(habit, day) || scheduleOn(habit, day).type === 'weekly') continue
        const next = addDays(day, 1)
        if (scheduleOn(habit, next).type === 'weekly') continue
        streakDays.push(day)
        queries.push(next)
      }
    }
    if (queries.length === 0) continue
    const runs = streakRunsBefore(habit, index.doneDaysByHabit.get(habit.id) ?? NO_DAYS, queries, index.freeDays)
    completions.forEach((completion, i) => {
      const xp = xpWithStreakBonus(questXp(completion.difficulty), streakBonusForRun(runs[i]))
      const attribute = isAttributeId(completion.attribute) ? completion.attribute : undefined
      if (attribute !== undefined && inHistory(completion.day)) entries.push({ day: completion.day, attribute, xp })
      const entry = days.get(completion.day)
      if (entry === undefined) return
      entry.questXp += xp
      entry.done++
      if (attribute !== undefined) entry.attributeXp[attribute] += xp
    })
    streakDays.forEach((day, i) => {
      const entry = days.get(day)
      const run = runs[completions.length + i]
      if (entry !== undefined && run > entry.bestStreak) entry.bestStreak = run
    })
  }

  // Perfekte Tage (wie die Engine: an Tagen mit erledigter Quest; an Ruhetagen nie).
  for (const entry of days.values()) {
    if (entry.done === 0) continue
    const facts = index.factsOf(entry.day)
    entry.perfect = facts.requiredCount >= 1 && facts.requiredDone === facts.requiredCount
    if (entry.perfect) entry.perfectBonusXp = Math.round(BALANCING.perfectDayBonus * entry.questXp)
  }

  // Nebenquests: questXp am Erledigungstag (ohne Streak-Bonus), auch als Attribut-XP.
  for (const quest of data.sideQuests ?? []) {
    const day = validDay(quest.doneDay, today)
    if (day === undefined) continue
    const xp = questXp(quest.difficulty)
    const attribute = isAttributeId(quest.attribute) ? quest.attribute : undefined
    if (attribute !== undefined && inHistory(day)) entries.push({ day, attribute, xp })
    const entry = days.get(day)
    if (entry === undefined) continue
    entry.sideQuestXp += xp
    if (attribute !== undefined) entry.attributeXp[attribute] += xp
  }

  // Kapitel und Kampagnen.
  if (days.size > 0) {
    for (const [day, xp] of chapterXpByDay(campaigns, today)) {
      const entry = days.get(day)
      if (entry !== undefined) entry.chapterXp += xp
    }
  }

  for (const entry of days.values()) {
    entry.xp = entry.questXp + entry.perfectBonusXp + entry.sideQuestXp + entry.chapterXp
  }
  return { days, entries }
}
