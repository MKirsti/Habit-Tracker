/**
 * Streak-Berechnung ("🔥 12").
 *
 * Betrachtet wird nur das Fenster `[max(createdDay, from), asOf]`; Tage ab `archivedDay` gehören nicht dazu.
 * Die Einheit richtet sich nach dem **aktuellen** Rhythmus (`habit.schedule`). Pausierte Tage
 * (`habit.pauses`) werden übersprungen: Sie zählen nicht und brechen nichts.
 *
 * Tages-Einheit (daily / weekdays):
 * - Gezählt werden aufeinanderfolgende **Plantage** laut dem Rhythmus des jeweiligen Tages (`scheduleOn`).
 *   Nicht-Plantage (z. B. Dienstag bei "Mo, Mi, Fr") werden übersprungen und brechen nichts – auch wenn an
 *   ihnen trotzdem etwas erledigt wurde. Tage, an denen die Quest damals eine Wochenquest war, gelten
 *   ebenfalls als Nicht-Plantage.
 * - Ein noch offener Plantag `asOf` bricht die aktuelle Serie nicht (der Tag läuft noch).
 *
 * Wochen-Einheit (weekly):
 * - ISO-Wochen (Mo–So). Eine Woche zählt, wenn die erledigten Tage **im Fenster** ≥ `times` sind.
 *   Die erste Woche beginnt mit der Woche des Fensterstarts; Tage davor zählen nicht mit.
 * - Maßgeblich ist der Rhythmus am **Montag** der Woche (`scheduleOn`): War die Quest da eine Wochenquest,
 *   gilt deren `times`; sonst wird die Woche übersprungen (zählt nicht, bricht nichts).
 * - Die Woche von `asOf` zählt, sobald sie erfüllt ist, und bricht nichts, solange sie es nicht ist.
 *   Gleiches gilt für eine letzte Woche, die durch die Archivierung abgeschnitten wurde, und für Wochen
 *   mit pausierten Tagen: Sie waren nie vollständig verfügbar und dürfen die Serie daher nicht brechen.
 *
 * `best` ist die längste Serie im Fenster (inklusive der aktuellen).
 * Laufzeit: O(Tage im Fenster + Verlaufs-/Pauseneinträge) – jeder Tag wird genau einmal betrachtet.
 *
 * Wird eine Quest zwischen Tages- und Wochenquest umgestellt, wechselt die Einheit von `computeStreak`.
 * Die in der früheren Einheit erreichten Serien liefert `bestStreakIn` – damit gehen Bestwerte und
 * erreichte Streak-Kapitel (und deren XP) durch das Umstellen nicht verloren.
 */
import { fromEpochDay, isoWeekday, isValidDayKey, toEpochDay } from './dates'
import { isScheduledWeekday, mergePauses } from './schedule'
import type { DayKey, Habit, IsoWeekday, Schedule, Streak } from './types'

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

/**
 * Rhythmus-Verlauf und Pausen einer Quest für **aufsteigend** abgefragte Epoch-Tage. Beide Abfragen
 * schieben nur einen Zeiger über die vorab sortierten Einträge weiter – zusammen O(Tage + Einträge).
 * Die Ergebnisse entsprechen `scheduleOn` bzw. `isPausedOn` aus `schedule.ts`.
 */
interface Timeline {
  scheduleAt(day: number): Schedule
  pausedAt(day: number): boolean
}

function habitTimeline(habit: Habit): Timeline {
  // Stabile Sortierung: Bei gleichem `until` gewinnt – wie in `scheduleOn` – der erste Eintrag.
  const history = (habit.scheduleHistory ?? [])
    .map((entry) => ({ until: toEpochDay(entry.until), schedule: entry.schedule }))
    .sort((a, b) => a.until - b.until)
  const pauses = mergePauses(habit.pauses ?? []).map((pause) => ({
    from: toEpochDay(pause.from),
    until: toEpochDay(pause.until),
  }))
  let historyIndex = 0
  let pauseIndex = 0
  return {
    scheduleAt(day) {
      while (historyIndex < history.length && history[historyIndex].until <= day) historyIndex++
      return historyIndex < history.length ? history[historyIndex].schedule : habit.schedule
    },
    pausedAt(day) {
      while (pauseIndex < pauses.length && pauses[pauseIndex].until <= day) pauseIndex++
      return pauseIndex < pauses.length && pauses[pauseIndex].from <= day
    },
  }
}

/** Serie in Plantagen (daily / weekdays). */
function scanDays(habit: Habit, doneDays: ReadonlySet<DayKey>, window: StreakWindow, reachTarget?: number): ScanResult {
  const { start, end, asOf } = window
  const timeline = habitTimeline(habit)
  // Plantage je Wochentag für den zuletzt gesehenen Rhythmus – neu berechnet nur bei einem Wechsel.
  let schedule: Schedule | undefined
  const scheduled: boolean[] = []

  let run = 0
  let best = 0
  let reachedOn: number | undefined
  let weekday = isoWeekday(fromEpochDay(start))
  for (let day = start; day <= end; day++, weekday = nextWeekday(weekday)) {
    // Pausierte Tage zählen nicht und brechen nichts.
    if (timeline.pausedAt(day)) continue
    const daySchedule = timeline.scheduleAt(day)
    if (daySchedule !== schedule) {
      schedule = daySchedule
      // Wochenquest-Rhythmus (früher) → kein Wochentag ist Plantag.
      for (let w = 1; w <= 7; w++) scheduled[w] = isScheduledWeekday(daySchedule, w as IsoWeekday)
    }
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
function scanWeeks(habit: Habit, doneDays: ReadonlySet<DayKey>, window: StreakWindow, reachTarget?: number): ScanResult {
  const { start, end, asOf } = window
  const asOfWeekStart = asOf - (isoWeekday(fromEpochDay(asOf)) - 1)
  const timeline = habitTimeline(habit)

  let run = 0
  let best = 0
  let reachedOn: number | undefined
  /** Wochenziel der laufenden Woche; 0 = Woche wird übersprungen (damals keine Wochenquest). */
  let times = 0
  let doneInWeek = 0
  let weekFulfilled = false
  let weekHasPause = false
  let weekday = isoWeekday(fromEpochDay(start))
  for (let day = start; day <= end; day++, weekday = nextWeekday(weekday)) {
    if (day === start || weekday === 1) {
      // Maßgeblich ist der Rhythmus am Montag der Woche (auch wenn das Fenster erst später beginnt).
      const weekSchedule = timeline.scheduleAt(day - (weekday - 1))
      // Ungültige Werte (≤ 0) würden jede Woche automatisch erfüllen – mindestens 1 erledigter Tag ist nötig.
      times = weekSchedule.type === 'weekly' ? Math.max(1, weekSchedule.times) : 0
    }

    if (timeline.pausedAt(day)) {
      weekHasPause = true
    } else if (times > 0 && doneDays.has(fromEpochDay(day))) {
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
      // Eine unvollständige Woche (Woche des Stichtags, durch Archivierung abgeschnitten oder mit
      // pausierten Tagen) bricht nichts – ebenso wenig eine übersprungene Woche.
      const weekIsCutShort = weekStart === asOfWeekStart || weekday !== 7 || weekHasPause
      if (times > 0 && !weekFulfilled && !weekIsCutShort) run = 0
      doneInWeek = 0
      weekFulfilled = false
      weekHasPause = false
    }
  }
  return { current: run, best, reachedOn }
}

function scan(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  unit: Streak['unit'],
  asOf: DayKey,
  from: DayKey | undefined,
  reachTarget?: number,
): ScanResult {
  const window = streakWindow(habit, asOf, from)
  if (window.start > window.end) return { current: 0, best: 0 }
  return unit === 'week'
    ? scanWeeks(habit, doneDays, window, reachTarget)
    : scanDays(habit, doneDays, window, reachTarget)
}

/** Einheit einer Serie bei diesem Rhythmus: Wochenquests zählen Wochen, alle anderen Plantage. */
export function streakUnit(schedule: Schedule): Streak['unit'] {
  return schedule.type === 'weekly' ? 'week' : 'day'
}

/** Hatte die Quest jemals (aktuell oder laut `scheduleHistory`) einen Rhythmus dieser Einheit? */
function everHadUnit(habit: Habit, unit: Streak['unit']): boolean {
  if (streakUnit(habit.schedule) === unit) return true
  return (habit.scheduleHistory ?? []).some((entry) => streakUnit(entry.schedule) === unit)
}

/**
 * Aktuelle und beste Serie einer Quest zum Stichtag `asOf`, in der Einheit des **aktuellen** Rhythmus.
 * @param doneDays Tage, an denen die Quest erledigt war (value ≥ target).
 * @param from     optionaler frühester Tag (z. B. Start einer Kampagne); es gilt max(createdDay, from).
 */
export function computeStreak(habit: Habit, doneDays: ReadonlySet<DayKey>, asOf: DayKey, from?: DayKey): Streak {
  const unit = streakUnit(habit.schedule)
  const { current, best } = scan(habit, doneDays, unit, asOf, from)
  return { current, best, unit }
}

/**
 * Längste Serie in der Einheit `unit` – auch wenn sie nicht zum aktuellen Rhythmus passt.
 *
 * Für die Einheit des aktuellen Rhythmus ist das `computeStreak(...).best`. Für die andere Einheit zählen
 * nur die Zeiten, in denen die Quest laut `scheduleHistory` damals eine Tages- bzw. Wochenquest war (gleiche
 * Regeln wie oben). So bleiben Bestwerte und erreichte Streak-Kapitel erhalten, wenn eine Quest zwischen
 * Tages- und Wochenquest umgestellt wird. Hatte die Quest nie einen Rhythmus dieser Einheit, ist das
 * Ergebnis 0 – ohne den Zeitraum zu durchlaufen.
 */
export function bestStreakIn(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  unit: Streak['unit'],
  asOf: DayKey,
  from?: DayKey,
): number {
  if (!everHadUnit(habit, unit)) return 0
  return scan(habit, doneDays, unit, asOf, from).best
}

/**
 * Länge der Serie unmittelbar **vor** jedem der Tage `days` – Grundlage des Streak-Bonus (ARCHITECTURE.md
 * „Streak-Bonus“, `streakBonus.ts`). `ergebnis[i]` gehört zu `days[i]`; die Reihenfolge von `days` ist beliebig.
 *
 * Die Einheit richtet sich nach dem Rhythmus **des jeweiligen Tages** (`scheduleOn`), nicht nach dem aktuellen:
 * So ändert eine spätere Umstellung des Rhythmus nie den Bonus (und damit die XP) vergangener Tage.
 * - Tages-Einheit (daily / weekdays): aufeinanderfolgende erledigte Plantage direkt vor dem Tag – gleiche Regeln
 *   wie `computeStreak`: Nicht-Plantage (auch Tage, an denen die Quest damals eine Wochenquest war) und Pausen
 *   werden übersprungen, ein verpasster Plantag setzt auf 0. Der Tag selbst zählt nicht mit.
 * - Wochen-Einheit (weekly): aufeinanderfolgende erfüllte Wochen direkt vor der Woche des Tages – gleiche Regeln
 *   wie `computeStreak` (Wochenziel vom Montag, übersprungene Wochen und Wochen mit Pausen brechen nichts).
 *   Alle Tage einer Woche bekommen denselben Wert.
 *
 * Vor `createdDay` gibt es keine Serie (0). Tage ab `archivedDay` wirken wie Pausen – die Serie ruht: Eine
 * Erledigung am Archivierungstag behält so ihren Bonus, auch nachdem die Quest zurückgeholt wurde (die
 * archivierte Zeit wird dabei zur Pause). Der Wert eines Tages hängt nur von den Tagen davor und dem Rhythmus
 * des Tages ab.
 *
 * Laufzeit: ein Durchlauf von `createdDay` bis zum spätesten Tag in `days`, O(Tage + Erledigungen + Einträge).
 */
export function streakRunsBefore(habit: Habit, doneDays: ReadonlySet<DayKey>, days: readonly DayKey[]): number[] {
  const runs = days.map(() => 0)
  const start = toEpochDay(habit.createdDay)
  const queries = days
    .map((day, index) => ({ day: toEpochDay(day), index }))
    .filter((query) => query.day >= start) // vor dem Anlegen: keine Serie
    .sort((a, b) => a.day - b.day)
  if (queries.length === 0) return runs

  const lastDay = queries[queries.length - 1].day
  const archived = habit.archivedDay === undefined ? Number.POSITIVE_INFINITY : toEpochDay(habit.archivedDay)
  const done = new Set<number>()
  for (const day of doneDays) if (isValidDayKey(day)) done.add(toEpochDay(day))
  const timeline = habitTimeline(habit)

  // Tages-Einheit (wie scanDays, ohne Ausnahme für den Stichtag: vor einem Tag liegt nur Vergangenes).
  let schedule: Schedule | undefined
  const scheduled: boolean[] = []
  let dayRun = 0
  // Wochen-Einheit (wie scanWeeks).
  let weekRun = 0
  /** Serie unmittelbar vor der laufenden Woche. */
  let weekRunBefore = 0
  let times = 0
  let doneInWeek = 0
  let weekFulfilled = false
  /** Woche mit pausierten (oder archivierten) Tagen: bricht nichts. */
  let weekInterrupted = false

  let next = 0
  let weekday = isoWeekday(fromEpochDay(start))
  for (let day = start; day <= lastDay; day++, weekday = nextWeekday(weekday)) {
    if (day === start || weekday === 1) {
      weekRunBefore = weekRun
      // Maßgeblich ist der Rhythmus am Montag der Woche (auch wenn die Quest erst später angelegt wurde).
      const weekSchedule = timeline.scheduleAt(day - (weekday - 1))
      times = weekSchedule.type === 'weekly' ? Math.max(1, weekSchedule.times) : 0
    }
    const daySchedule = timeline.scheduleAt(day)
    // Stichtage beantworten, bevor der Tag selbst zählt.
    while (next < queries.length && queries[next].day === day) {
      runs[queries[next].index] = daySchedule.type === 'weekly' ? weekRunBefore : dayRun
      next++
    }
    if (next === queries.length) break

    if (day < archived && !timeline.pausedAt(day)) {
      const isDoneDay = done.has(day)
      if (daySchedule !== schedule) {
        schedule = daySchedule
        for (let w = 1; w <= 7; w++) scheduled[w] = isScheduledWeekday(daySchedule, w as IsoWeekday)
      }
      if (scheduled[weekday]) dayRun = isDoneDay ? dayRun + 1 : 0
      if (times > 0 && isDoneDay) {
        doneInWeek++
        if (!weekFulfilled && doneInWeek >= times) {
          weekFulfilled = true
          weekRun++
        }
      }
    } else {
      weekInterrupted = true
    }

    if (weekday === 7) {
      if (times > 0 && !weekFulfilled && !weekInterrupted) weekRun = 0
      doneInWeek = 0
      weekFulfilled = false
      weekInterrupted = false
    }
  }
  return runs
}

/**
 * Erster Tag im Fenster, an dem die Serie (gleiche Logik wie `computeStreak` bzw. `bestStreakIn`) in der
 * Einheit `unit` (Standard: die des aktuellen Rhythmus) die Länge `target` erreicht hat – `undefined`,
 * wenn das bis `asOf` nie passiert ist.
 *
 * Da `best` mit wachsendem Stichtag nie sinkt, ist das genau der früheste Tag `d`, für den
 * `bestStreakIn(habit, doneDays, unit, d, from) ≥ target` gilt. Bei Wochenserien ist es der Tag,
 * an dem die entscheidende Woche erfüllt wurde.
 */
export function streakReachedDay(
  habit: Habit,
  doneDays: ReadonlySet<DayKey>,
  target: number,
  asOf: DayKey,
  from?: DayKey,
  unit: Streak['unit'] = streakUnit(habit.schedule),
): DayKey | undefined {
  if (!everHadUnit(habit, unit)) return undefined
  const { reachedOn } = scan(habit, doneDays, unit, asOf, from, target)
  return reachedOn === undefined ? undefined : fromEpochDay(reachedOn)
}
