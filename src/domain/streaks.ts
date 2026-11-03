/**
 * Streak-Berechnung ("🔥 12").
 *
 * Betrachtet wird nur das Fenster `[max(createdDay, from), asOf]`; Tage ab `archivedDay` gehören nicht dazu.
 *
 * Tages-Einheit (daily / weekdays):
 * - Gezählt werden aufeinanderfolgende **Plantage**. Nicht-Plantage (z. B. Dienstag bei "Mo, Mi, Fr")
 *   werden übersprungen und brechen nichts – auch wenn an ihnen trotzdem etwas erledigt wurde.
 * - Ein noch offener Plantag `asOf` bricht die aktuelle Serie nicht (der Tag läuft noch).
 *
 * Wochen-Einheit (weekly):
 * - ISO-Wochen (Mo–So). Eine Woche zählt, wenn die erledigten Tage **im Fenster** ≥ `times` sind.
 *   Die erste Woche beginnt mit der Woche des Fensterstarts; Tage davor zählen nicht mit.
 * - Die Woche von `asOf` zählt, sobald sie erfüllt ist, und bricht nichts, solange sie es nicht ist.
 *   Gleiches gilt für eine letzte Woche, die durch die Archivierung abgeschnitten wurde: Sie war nie
 *   vollständig verfügbar und darf die (eingefrorene) Serie daher nicht brechen.
 *
 * `best` ist die längste Serie im Fenster (inklusive der aktuellen).
 * Laufzeit: O(Tage im Fenster) – jeder Tag wird genau einmal betrachtet.
 */
import { fromEpochDay, isoWeekday, toEpochDay } from './dates'
import { isScheduledWeekday } from './schedule'
import type { DayKey, Habit, IsoWeekday, Streak } from './types'

interface StreakWindow {
  /** Erster Tag des Fensters (Epoch-Tag). */
  start: number
  /** Letzter Tag des Fensters (Epoch-Tag), ≤ asOf. */
  end: number
  /** Stichtag (Epoch-Tag); kann nach `end` liegen, wenn die Quest archiviert ist. */
  asOf: number
}

interface ScanResult {
  current: number
  best: number
  /** Erster Tag, an dem die Serie `reachTarget` erreicht hat (nur wenn angefragt). */
  reachedOn?: number
}

function streakWindow(habit: Habit, asOf: DayKey, from: DayKey | undefined): StreakWindow {
  const created = toEpochDay(habit.createdDay)
  const start = from === undefined ? created : Math.max(created, toEpochDay(from))
  const asOfDay = toEpochDay(asOf)
  let end = asOfDay
  if (habit.archivedDay !== undefined) end = Math.min(end, toEpochDay(habit.archivedDay) - 1)
  return { start, end, asOf: asOfDay }
}

function nextWeekday(weekday: IsoWeekday): IsoWeekday {
  return (weekday === 7 ? 1 : weekday + 1) as IsoWeekday
}

/** Serie in Plantagen (daily / weekdays). */
function scanDays(habit: Habit, doneDays: ReadonlySet<DayKey>, window: StreakWindow, reachTarget?: number): ScanResult {
  const { start, end, asOf } = window
  const scheduled: boolean[] = []
  for (let weekday = 1; weekday <= 7; weekday++) {
    scheduled[weekday] = isScheduledWeekday(habit.schedule, weekday as IsoWeekday)
  }

  let run = 0
  let best = 0
  let reachedOn: number | undefined
  let weekday = isoWeekday(fromEpochDay(start))
  for (let day = start; day <= end; day++, weekday = nextWeekday(weekday)) {
    if (!scheduled[weekday]) continue
    if (doneDays.has(fromEpochDay(day))) {
      run++
      if (run > best) best = run
      if (reachTarget !== undefined && reachedOn === undefined && run >= reachTarget) reachedOn = day
    } else if (day !== asOf) {
      // Verpasster Plantag. Ausnahme: der Stichtag selbst läuft noch und bricht nichts.
      run = 0
    }
  }
  return { current: run, best, reachedOn }
}

/** Serie in ISO-Wochen (weekly). */
function scanWeeks(
  times: number,
  doneDays: ReadonlySet<DayKey>,
  window: StreakWindow,
  reachTarget?: number,
): ScanResult {
  const { start, end, asOf } = window
  const asOfWeekStart = asOf - (isoWeekday(fromEpochDay(asOf)) - 1)

  let run = 0
  let best = 0
  let reachedOn: number | undefined
  let doneInWeek = 0
  let weekFulfilled = false
  let weekday = isoWeekday(fromEpochDay(start))
  for (let day = start; day <= end; day++, weekday = nextWeekday(weekday)) {
    if (doneDays.has(fromEpochDay(day))) {
      doneInWeek++
      // Die Woche zählt ab dem Tag, an dem sie erfüllt ist (wichtig für "erreicht am …").
      if (!weekFulfilled && doneInWeek >= times) {
        weekFulfilled = true
        run++
        if (run > best) best = run
        if (reachTarget !== undefined && reachedOn === undefined && run >= reachTarget) reachedOn = day
      }
    }

    const isLastDayOfWeek = weekday === 7 || day === end
    if (isLastDayOfWeek) {
      const weekStart = day - (weekday - 1)
      // Eine unvollständige Woche (Woche des Stichtags oder durch Archivierung abgeschnitten) bricht nichts.
      const weekIsCutShort = weekStart === asOfWeekStart || weekday !== 7
      if (!weekFulfilled && !weekIsCutShort) run = 0
      doneInWeek = 0
      weekFulfilled = false
    }
  }
  return { current: run, best, reachedOn }
}

function scan(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  asOf: DayKey,
  from: DayKey | undefined,
  reachTarget?: number,
): ScanResult & { unit: Streak['unit'] } {
  const window = streakWindow(habit, asOf, from)
  if (habit.schedule.type === 'weekly') {
    if (window.start > window.end) return { current: 0, best: 0, unit: 'week' }
    // Ungültige Werte (≤ 0) würden jede Woche automatisch erfüllen – mindestens 1 erledigter Tag ist nötig.
    const times = Math.max(1, habit.schedule.times)
    return { ...scanWeeks(times, doneDays, window, reachTarget), unit: 'week' }
  }
  if (window.start > window.end) return { current: 0, best: 0, unit: 'day' }
  return { ...scanDays(habit, doneDays, window, reachTarget), unit: 'day' }
}

/**
 * Aktuelle und beste Serie einer Quest zum Stichtag `asOf`.
 * @param doneDays Tage, an denen die Quest erledigt war (value ≥ target).
 * @param from     optionaler frühester Tag (z. B. Start einer Kampagne); es gilt max(createdDay, from).
 */
export function computeStreak(habit: Habit, doneDays: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey): Streak {
  const { current, best, unit } = scan(habit, doneDays, asOf, from)
  return { current, best, unit }
}

/**
 * Erster Tag im Fenster, an dem die Serie (gleiche Logik wie `computeStreak`) die Länge `target`
 * erreicht hat – `undefined`, wenn das bis `asOf` nie passiert ist.
 *
 * Da `best` mit wachsendem Stichtag nie sinkt, ist das genau der früheste Tag `d`, für den
 * `computeStreak(habit, doneDays, d, from).best ≥ target` gilt. Bei Wochenserien ist es der Tag,
 * an dem die entscheidende Woche erfüllt wurde.
 */
export function streakReachedDay(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  target: number,
  asOf: DayKey,
  from?: DayKey,
): DayKey | undefined {
  const { reachedOn } = scan(habit, doneDays, asOf, from, target)
  return reachedOn === undefined ? undefined : fromEpochDay(reachedOn)
}
