/**
 * Wochenrückblick – „Bericht des Gildenmeisters“ (Phase 3b, ARCHITECTURE.md „Wochenrückblick“) – rein.
 *
 * `weeklyReview(data, state, weekStart)` fasst eine (abgeschlossene) ISO-Woche zusammen, gerechnet zum Stichtag
 * `state.today` – genau wie Engine und Statistik (`chronicleDays.ts`):
 * - `xp`: alle XP der Woche (Quests inkl. Streak-Bonus, Perfekte Tage, Nebenquests, Kapitel, Kampagnen) – dieselbe
 *   Zahl wie der Wochenbalken der Statistik (`weeklyXp`).
 * - `xpChangePercent`: Veränderung gegenüber der Woche davor, gerundet – nur, wenn die Vorwoche ganz zum Abenteuer
 *   gehört und XP hatte (sonst gibt es keinen fairen Vergleich).
 * - `questsCompleted` (erledigte Quests, ohne Nebenquests), `perfectDays`, `restDays` (Ruhetage/Urlaub).
 * - `bestStreak`: der längste Tages-Streak, der in der Woche erreicht oder gehalten wurde (am Ende eines Tages, an
 *   dem die Quest aktiv war – Ruhetage halten eine Serie, sie wächst nur nicht).
 * - `topAttribute`: Attribut mit den meisten Attribut-XP der Woche (Gleichstand → Reihenfolge `ATTRIBUTE_IDS`).
 * - `boss`: der Wochen-Boss, soweit bekannt – aus dem gespeicherten Sieg bzw. dem Spielzustand (laufender Boss,
 *   Vorwochen-Boss am Montag). Für die Vorwoche (die Woche des fälligen Rückblicks) wird ein entkommener Boss an den
 *   übrigen Tagen nach denselben Regeln wie in der Engine abgeleitet (`classTimeline`, `createBossResolver`,
 *   `weeklyBossState` mit Angriffen und Gefährten-Treffern), damit der Rückblick die ganze Woche über gleich bleibt –
 *   samt „besiegt“, falls der Sieg (etwa wegen eines abgebrochenen Speicherns) nicht gespeichert wurde. Ein entkommener Boss älterer Wochen ist nirgends festgehalten
 *   (und vor Phase 3a gab es keine Bosse) – dann fehlt das Feld, statt einen Gegner zu erfinden.
 * - `line`: ein ermutigender Satz (`reviewLine` aus `reviewLines.ts`), deterministisch je Held und Woche.
 *
 * `weeklyReviewForState(data, state, today)` liefert `GameState.weeklyReview`: den Rückblick der Vorwoche, solange
 * `settings.weeklyReviewSeen` vor dieser Woche liegt (bzw. fehlt) und die Vorwoche ganz zum Abenteuer gehört
 * (Abenteuerbeginn spätestens an ihrem Montag) – sichtbar also von Montag bis Sonntag der neuen Woche, bis er
 * weggeklickt wird. Sonst wird nichts gerechnet (billig für jeden Aufruf von `deriveGameState`).
 */
import { ATTRIBUTE_IDS } from '../attributes'
import {
  bossById,
  createBossResolver,
  heroSeedOf,
  plannedWeekAttacks,
  plannedWeekDamage,
  victoriesByWeek,
  weeklyBossState,
} from '../combat/boss'
import type { AttackSource, CombatStats, CompanionAttackInput } from '../combat/boss'
import { classBonusFor, classTimeline, normalizeLevels } from '../combat/classes'
import type { AttributeXpEntry } from '../combat/classes'
import { isCompanionSpecies } from '../companion'
import { addDays, compareDays, isValidDayKey, startOfWeek } from '../dates'
import { adventureStartOf } from '../hpRules'
import type { AttributeId, BossVictory, DayKey, GameData, GameState, WeeklyBossState, WeeklyReview } from '../types'
import { chronicleDays, chronicleIndex } from './chronicleDays'
import type { ChronicleDay, ChronicleIndex } from './chronicleDays'
import { reviewLine } from './reviewLines'

/** Was der Rückblick aus dem Spielzustand braucht: Kampagnen (Kapitel-XP) und die Bosse (laufend/Vorwoche). */
export type ReviewState = Pick<GameState, 'mainQuests' | 'archivedMainQuests' | 'bosses'>

/** Kennzahlen einer Woche – Grundlage des Rückblicks und der Tagebuch-Einträge. */
export interface WeekNumbers {
  weekStart: DayKey
  weekEnd: DayKey
  xp: number
  questsCompleted: number
  perfectDays: number
  bestStreak: number
  restDays: number
  /** Attribut mit den meisten XP der Woche (keins ohne Attribut-XP). */
  topAttribute?: AttributeId
}

/** Sonntag der Woche. */
function weekEndOf(weekStart: DayKey): DayKey {
  return addDays(weekStart, 6)
}

/** Kennzahlen der Woche aus den Tagen der Chronik (fehlende Tage – nach heute – zählen nicht). */
export function weekNumbers(days: ReadonlyMap<DayKey, ChronicleDay>, weekStart: DayKey): WeekNumbers {
  const monday = startOfWeek(weekStart)
  const numbers: WeekNumbers = {
    weekStart: monday,
    weekEnd: weekEndOf(monday),
    xp: 0,
    questsCompleted: 0,
    perfectDays: 0,
    bestStreak: 0,
    restDays: 0,
  }
  const attributeXp = {} as Record<AttributeId, number>
  for (const id of ATTRIBUTE_IDS) attributeXp[id] = 0
  for (let offset = 0; offset < 7; offset++) {
    const entry = days.get(addDays(monday, offset))
    if (entry === undefined) continue
    numbers.xp += entry.xp
    numbers.questsCompleted += entry.done
    if (entry.perfect) numbers.perfectDays++
    if (entry.rest) numbers.restDays++
    if (entry.bestStreak > numbers.bestStreak) numbers.bestStreak = entry.bestStreak
    for (const id of ATTRIBUTE_IDS) attributeXp[id] += entry.attributeXp[id]
  }
  let best = 0
  for (const id of ATTRIBUTE_IDS) {
    if (attributeXp[id] > best) {
      best = attributeXp[id]
      numbers.topAttribute = id
    }
  }
  return numbers
}

/**
 * Veränderung der XP gegenüber der Vorwoche in Prozent (gerundet) – `undefined` ohne faire Vergleichswoche: Die
 * Vorwoche muss ganz zum Abenteuer gehören (Beginn spätestens an ihrem Montag) und XP gebracht haben.
 */
export function xpChangePercent(xp: number, previousXp: number, previousWeekStart: DayKey, adventureStart: DayKey): number | undefined {
  if (compareDays(adventureStart, previousWeekStart) > 0 || !(previousXp > 0)) return undefined
  const percent = Math.round(((xp - previousXp) / previousXp) * 100)
  return percent === 0 ? 0 : percent // kein „−0 %“
}

/**
 * Der Boss der Woche, soweit bekannt: gespeicherter Sieg, sonst der laufende bzw. der Vorwochen-Boss im Spielzustand,
 * sonst – falls übergeben – der abgeleitete (`derive`, mit seinem abgeleiteten „besiegt“).
 */
export function reviewBoss(
  state: ReviewState,
  weekStart: DayKey,
  victories: ReadonlyMap<DayKey, BossVictory>,
  derive?: () => Pick<WeeklyBossState, 'boss' | 'defeated'> | undefined,
): WeeklyReview['boss'] | undefined {
  const live = [state.bosses.previous, state.bosses.current].find((boss) => boss?.weekStart === weekStart)
  const victory = victories.get(weekStart)
  if (victory !== undefined) {
    // Der Boss im Spielzustand kennt auch Inhalte, die nur dort stehen (Tests); sonst der Boss des Sieges.
    const boss = live?.boss.id === victory.bossId ? live.boss : (bossById(victory.bossId) ?? live?.boss)
    return { name: boss?.name ?? 'Wochen-Boss', icon: boss?.icon ?? '⚔️', defeated: true }
  }
  if (live !== undefined) return { name: live.boss.name, icon: live.boss.icon, defeated: live.defeated }
  const derived = derive?.()
  return derived === undefined ? undefined : { name: derived.boss.name, icon: derived.boss.icon, defeated: derived.defeated }
}

/** Attribut-XP mit Tag (Grundlage der Klassen-Level) aus den Tagen der Chronik. */
export function attributeXpEntries(days: Iterable<ChronicleDay>): AttributeXpEntry[] {
  const entries: AttributeXpEntry[] = []
  for (const entry of days) {
    for (const attribute of ATTRIBUTE_IDS) {
      const xp = entry.attributeXp[attribute]
      if (xp > 0) entries.push({ day: entry.day, attribute, xp })
    }
  }
  return entries
}

/**
 * Boss einer vergangenen Woche nach den Regeln der Engine abgeleitet: Kampf-Werte der Woche aus der Klassen-Folge
 * (Level am Sonntag davor, Klasse mit Trägheit, Klassen-Bonus), geplanter Schaden mit den heutigen Quests, Kette
 * „nie zweimal derselbe“ über `createBossResolver`, Angriffe der Woche (erledigte Quests mit ihrer Momentaufnahme,
 * Nebenquests) und die Treffer des Gefährten an Perfekten Tagen – genau wie `weeklyBossState` in der Engine.
 * `undefined` ohne Plan (oder vor dem Abenteuer).
 * @param entries Attribut-XP mit Tag, mindestens bis zum Sonntag vor `weekStart`.
 */
function deriveWeekBoss(
  data: GameData,
  index: ChronicleIndex,
  entries: readonly AttributeXpEntry[],
  weekStart: DayKey,
): WeeklyBossState | undefined {
  const timeline = new Map(classTimeline(entries, weekStart).map((week) => [week.weekStart, week]))
  const statsOf = (week: DayKey): CombatStats => {
    const classWeek = timeline.get(week)
    return {
      attributeLevels: classWeek?.attributeLevels ?? normalizeLevels({}),
      classBonus: classWeek !== undefined ? classBonusFor(classWeek.id) : {},
    }
  }
  const victories = victoriesByWeek(data.bossVictories)
  const heroSeed = heroSeedOf(data.profile)
  const resolver = createBossResolver({
    heroSeed,
    // Wie die Engine: Bosse gibt es ab der Woche des Abenteuerbeginns (ohne Helden erst ab der laufenden Woche).
    fromWeek: startOfWeek(
      data.profile !== undefined && isValidDayKey(data.profile.createdDay) ? data.profile.createdDay : index.today,
    ),
    planOf: (week) => {
      const { total, byAttribute } = plannedWeekDamage(plannedWeekAttacks(index.habits, week, index.restDays), statsOf(week))
      const victory = victories.get(week)
      return victory !== undefined ? { total, byAttribute, victory } : { total, byAttribute }
    },
  })
  const boss = resolver.bossOf(weekStart)
  if (boss === undefined) return undefined

  // Angriffe der Woche (bis heute) – wie `weekAttackSources` der Engine.
  const weekEnd = addDays(weekStart, 6)
  const inWeek = (day: DayKey) => compareDays(day, weekStart) >= 0 && compareDays(day, weekEnd) <= 0 && compareDays(day, index.today) <= 0
  const sources: AttackSource[] = []
  for (const completions of index.doneByHabit.values()) {
    for (const completion of completions) {
      if (!inWeek(completion.day)) continue
      sources.push({
        day: completion.day,
        source: 'quest',
        sourceId: completion.habitId,
        attribute: completion.attribute,
        difficulty: completion.difficulty,
        order: completion.updatedAt,
      })
    }
  }
  for (const quest of data.sideQuests ?? []) {
    if (quest.doneDay === undefined || !isValidDayKey(quest.doneDay) || !inWeek(quest.doneDay)) continue
    sources.push({ day: quest.doneDay, source: 'sideQuest', sourceId: quest.id, attribute: quest.attribute, difficulty: quest.difficulty, order: quest.order })
  }
  // Gefährte: an jedem Perfekten Tag der Woche (ab dem Tag der Wahl) – Perfekt wie in der Engine.
  const choice = data.profile?.companion
  let companion: CompanionAttackInput | undefined
  if (choice !== undefined && isCompanionSpecies(choice.species)) {
    const perfectDays = new Set<DayKey>()
    for (let offset = 0; offset < 7; offset++) {
      const day = addDays(weekStart, offset)
      if (!inWeek(day)) continue
      const facts = index.factsOf(day)
      if (facts.active && facts.requiredCount >= 1 && facts.requiredDone === facts.requiredCount) perfectDays.add(day)
    }
    companion = { species: choice.species, name: choice.name, perfectDays, fromDay: choice.chosenDay }
  }
  const planned = plannedWeekAttacks(index.habits, weekStart, index.restDays)
  const previousBossId = resolver.bossOf(addDays(weekStart, -7))?.id
  return weeklyBossState({
    weekStart,
    today: index.today,
    heroSeed,
    planned,
    sources,
    stats: statsOf(weekStart),
    ...(victories.get(weekStart) !== undefined ? { victory: victories.get(weekStart) } : {}),
    ...(previousBossId !== undefined ? { previousBossId } : {}),
    ...(companion !== undefined ? { companion } : {}),
  })
}

/**
 * Attribut-XP der ganzen Geschichte bis `through` – ein eigener Durchlauf, nur wenn sie nicht mitgeliefert wurden
 * (leerer Tages-Zeitraum: gebraucht werden nur die Attribut-XP).
 */
function historyEntries(data: GameData, index: ChronicleIndex, campaigns: ReviewState, through: DayKey): AttributeXpEntry[] {
  return chronicleDays(index, data, campaigns, { from: through, to: addDays(through, -1), entriesThrough: through }).entries
}

/** Seed des ermutigenden Satzes: je Held und Woche fest. */
function lineSeed(data: GameData, weekStart: DayKey): string {
  return `${heroSeedOf(data.profile)}:${weekStart}`
}

/** Bausteine für `reviewsFromDays` (z. B. vom Tagebuch, das die Tage ohnehin schon gerechnet hat). */
export interface ReviewInputs {
  index: ChronicleIndex
  /** Tage der Chronik (mit `streaks: true`): mindestens die Wochen und jeweils die Woche davor. */
  days: ReadonlyMap<DayKey, ChronicleDay>
  /**
   * Attribut-XP der Geschichte mindestens bis zum Sonntag vor der Vorwoche – nur nötig, wenn deren entkommener Boss
   * abgeleitet werden muss (sonst wird nichts gerechnet). Fehlt = bei Bedarf aus den Daten berechnen.
   */
  attributeEntries?: () => readonly AttributeXpEntry[]
  /**
   * Der Boss der Vorwoche, schon gerechnet (die Engine hat ihn mit ihren eigenen Kampf-Werten zur Hand) – dann wird er
   * nicht noch einmal aus der Geschichte abgeleitet. Fehlt = bei Bedarf ableiten (`deriveWeekBoss`).
   */
  previousWeekBoss?: () => Pick<WeeklyBossState, 'boss' | 'defeated'> | undefined
}

/** Optionen für `weeklyReviewsAsOf` / `weeklyReviewForState`. */
export interface ReviewOptions {
  /** Siehe `ReviewInputs.previousWeekBoss`. */
  previousWeekBoss?: () => Pick<WeeklyBossState, 'boss' | 'defeated'> | undefined
}

function reviewFrom(data: GameData, state: ReviewState, inputs: ReviewInputs, weekStart: DayKey): WeeklyReview {
  const { index, days } = inputs
  const numbers = weekNumbers(days, weekStart)
  const previousWeekStart = addDays(numbers.weekStart, -7)
  const previous = weekNumbers(days, previousWeekStart)
  const change = xpChangePercent(numbers.xp, previous.xp, previousWeekStart, adventureStartOf(data, index.today))
  // Nur der Boss der Vorwoche (die Woche des fälligen Rückblicks) wird abgeleitet, siehe Dateikopf.
  const isPreviousWeek = numbers.weekStart === addDays(startOfWeek(index.today), -7)
  const derive = isPreviousWeek
    ? (inputs.previousWeekBoss ??
      (() => {
        const lastSunday = addDays(numbers.weekStart, -1)
        const entries = inputs.attributeEntries?.() ?? historyEntries(data, index, state, lastSunday)
        return deriveWeekBoss(data, index, entries, numbers.weekStart)
      }))
    : undefined
  const boss = reviewBoss(state, numbers.weekStart, victoriesByWeek(data.bossVictories), derive)
  const review: WeeklyReview = {
    weekStart: numbers.weekStart,
    weekEnd: numbers.weekEnd,
    xp: numbers.xp,
    questsCompleted: numbers.questsCompleted,
    perfectDays: numbers.perfectDays,
    bestStreak: numbers.bestStreak,
    restDays: numbers.restDays,
    line: reviewLine(
      {
        xp: numbers.xp,
        ...(change !== undefined ? { xpChangePercent: change } : {}),
        perfectDays: numbers.perfectDays,
        questsCompleted: numbers.questsCompleted,
        ...(boss !== undefined ? { bossDefeated: boss.defeated } : {}),
        restDays: numbers.restDays,
      },
      lineSeed(data, numbers.weekStart),
    ),
  }
  if (change !== undefined) review.xpChangePercent = change
  if (numbers.topAttribute !== undefined) review.topAttribute = numbers.topAttribute
  if (boss !== undefined) review.boss = boss
  return review
}

/**
 * Rückblicke aus schon gerechneten Tagen der Chronik (`chronicleDays` mit `streaks: true`), `ergebnis[i]` gehört zu
 * `weekStarts[i]` (auf den Montag gezogen; ungültige Tage entfallen).
 */
export function reviewsFromDays(
  data: GameData,
  state: ReviewState,
  inputs: ReviewInputs,
  weekStarts: readonly DayKey[],
): WeeklyReview[] {
  return weekStarts.filter(isValidDayKey).map((week) => reviewFrom(data, state, inputs, startOfWeek(week)))
}

/**
 * Rückblicke mehrerer Wochen zum Stichtag `today` in einem Durchlauf (ein Index, je Quest ein Streak-Durchlauf über
 * alle Wochen zugleich). `ergebnis[i]` gehört zu `weekStarts[i]` (auf den Montag gezogen; ungültige Tage entfallen).
 */
export function weeklyReviewsAsOf(
  data: GameData,
  state: ReviewState,
  today: DayKey,
  weekStarts: readonly DayKey[],
  options: ReviewOptions = {},
): WeeklyReview[] {
  const mondays = weekStarts.filter(isValidDayKey).map(startOfWeek)
  if (mondays.length === 0) return []
  let from = mondays[0]
  let to = mondays[0]
  for (const monday of mondays) {
    if (compareDays(monday, from) < 0) from = monday
    if (compareDays(monday, to) > 0) to = monday
  }
  const index = chronicleIndex(data, today)
  // Muss der entkommene Boss der Vorwoche abgeleitet werden, kommen die Attribut-XP der Geschichte gleich aus demselben
  // Streak-Durchlauf (statt eines zweiten).
  const previousWeek = addDays(startOfWeek(today), -7)
  const derive =
    options.previousWeekBoss === undefined &&
    mondays.includes(previousWeek) &&
    reviewBoss(state, previousWeek, victoriesByWeek(data.bossVictories)) === undefined
  const { days, entries } = chronicleDays(index, data, state, {
    from: addDays(from, -7),
    to: weekEndOf(to),
    streaks: true,
    ...(derive ? { entriesThrough: addDays(previousWeek, -1) } : {}),
  })
  const inputs: ReviewInputs = { index, days }
  if (derive) inputs.attributeEntries = () => entries
  if (options.previousWeekBoss !== undefined) inputs.previousWeekBoss = options.previousWeekBoss
  return reviewsFromDays(data, state, inputs, mondays)
}

/** Rückblicke mehrerer Wochen zum Stichtag `state.today` (siehe `weeklyReviewsAsOf`). */
export function weeklyReviews(
  data: GameData,
  state: ReviewState & Pick<GameState, 'today'>,
  weekStarts: readonly DayKey[],
): WeeklyReview[] {
  return weeklyReviewsAsOf(data, state, state.today, weekStarts)
}

/** Rückblick der Woche von `weekStart` (wird auf den Montag gezogen) zum Stichtag `state.today`. */
export function weeklyReview(
  data: GameData,
  state: ReviewState & Pick<GameState, 'today'>,
  weekStart: DayKey,
): WeeklyReview {
  const monday = isValidDayKey(weekStart) ? startOfWeek(weekStart) : startOfWeek(state.today)
  return weeklyReviewsAsOf(data, state, state.today, [monday])[0]
}

/**
 * Abgeschlossene Wochen mit Rückblick, neueste zuerst: ab der ersten Woche, die ganz zum Abenteuer gehört
 * (Abenteuerbeginn spätestens an ihrem Montag), bis zur Vorwoche. Ohne Helden keine.
 */
export function reviewableWeeks(data: Pick<GameData, 'profile'>, today: DayKey): DayKey[] {
  const createdDay = data.profile?.createdDay
  if (createdDay === undefined || !isValidDayKey(createdDay) || !isValidDayKey(today)) return []
  const first = startOfWeek(createdDay) === createdDay ? createdDay : addDays(startOfWeek(createdDay), 7)
  const weeks: DayKey[] = []
  for (let week = addDays(startOfWeek(today), -7); compareDays(week, first) >= 0; week = addDays(week, -7)) {
    weeks.push(week)
  }
  return weeks
}

/**
 * Montag der Woche, deren Rückblick gerade fällig ist (`GameState.weeklyReview`): die Vorwoche, sofern sie ganz zum
 * Abenteuer gehört und `settings.weeklyReviewSeen` vor ihr liegt (bzw. fehlt oder ungültig ist); sonst `undefined`.
 */
export function pendingReviewWeek(data: Pick<GameData, 'profile' | 'settings'>, today: DayKey): DayKey | undefined {
  const createdDay = data.profile?.createdDay
  if (createdDay === undefined || !isValidDayKey(createdDay) || !isValidDayKey(today)) return undefined
  const previousWeek = addDays(startOfWeek(today), -7)
  if (compareDays(createdDay, previousWeek) > 0) return undefined
  const seen = data.settings.weeklyReviewSeen
  if (seen !== undefined && isValidDayKey(seen) && compareDays(seen, previousWeek) >= 0) return undefined
  return previousWeek
}

/**
 * `GameState.weeklyReview`: der Rückblick der Vorwoche, solange er fällig ist (`pendingReviewWeek`), sonst
 * `undefined` – dann ohne jede Rechnung. Für die Engine; `state` braucht nur Kampagnen und Bosse. Die Engine reicht den
 * Boss der Vorwoche mit (`options.previousWeekBoss`, mit ihren Kampf-Werten gerechnet) – so wird in
 * `deriveGameState` nie die ganze Geschichte ein zweites Mal durchgerechnet.
 */
export function weeklyReviewForState(
  data: GameData,
  state: ReviewState,
  today: DayKey,
  options: ReviewOptions = {},
): WeeklyReview | undefined {
  const week = pendingReviewWeek(data, today)
  return week === undefined ? undefined : weeklyReviewsAsOf(data, state, today, [week], options)[0]
}
