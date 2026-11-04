/**
 * Wann ist eine Quest aktiv, fällig bzw. sichtbar – und wie weit ist eine Wochenquest?
 *
 * Begriffe:
 * - aktiv:    zwischen `createdDay` (inklusive) und `archivedDay` (exklusive) und in keiner Pause
 * - Rhythmus: der an diesem Tag gültige Rhythmus (`scheduleOn`) – frühere Rhythmen stehen in
 *             `scheduleHistory`, damit eine Änderung die Vergangenheit nicht umschreibt
 * - Pflicht:  aktiv und laut Rhythmus des Tages planmäßig fällig (daily, oder weekdays mit passendem
 *             Wochentag). Nur Pflicht-Quests zählen für den "Perfekten Tag". Wochenquests sind nie Pflicht,
 *             an Ruhetagen (Phase 2b, optionaler Parameter `restDays`) ist keine Quest Pflicht.
 * - sichtbar: Pflicht-Quests plus alle aktiven Quests, die an dem Tag Wochenquests sind (die an jedem Tag
 *             der Woche erledigt werden können)
 */
import { BALANCING } from './balancing'
import { addDays, compareDays, isoWeekday, startOfWeek } from './dates'
import type { Completion, DayKey, Difficulty, Habit, HabitPause, IsoWeekday, Schedule } from './types'

/** Kurznamen der Wochentage, Index = ISO-Wochentag (Index 0 ungenutzt). */
const WEEKDAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

/**
 * Was die Zeitplan-Funktionen von einer Quest brauchen. Auch ein Grabstein einer gelöschten Quest
 * (`DeletedHabit`) erfüllt das – so zählt er an vergangenen Tagen weiter als (offene) Pflicht-Quest.
 */
export type HabitTimeline = Pick<Habit, 'createdDay' | 'archivedDay' | 'schedule' | 'scheduleHistory' | 'pauses'>

/**
 * Ist die Quest am Tag `day` archiviert (`archivedDay ≤ day`)? Ein `archivedDay` nach `day` (möglich, wenn
 * der Tageswechsel nach dem Archivieren später gelegt wurde) zählt noch nicht: Die Quest ist dann noch
 * aktiv. Einheitliche Regel für alle Listen, das Verschieben und das Archivieren.
 */
export function isArchivedOn(habit: Pick<Habit, 'archivedDay'>, day: DayKey): boolean {
  return habit.archivedDay !== undefined && compareDays(habit.archivedDay, day) <= 0
}

/** createdDay ≤ day, (kein archivedDay oder day < archivedDay) und `day` liegt in keiner Pause. */
export function isActiveOn(habit: HabitTimeline, day: DayKey): boolean {
  if (compareDays(habit.createdDay, day) > 0) return false
  if (habit.archivedDay !== undefined && compareDays(day, habit.archivedDay) >= 0) return false
  return !isPausedOn(habit, day)
}

/** Liegt `day` in einer Pause der Quest (`from ≤ day < until`)? */
export function isPausedOn(habit: Pick<Habit, 'pauses'>, day: DayKey): boolean {
  const pauses = habit.pauses
  if (pauses === undefined) return false
  return pauses.some((pause) => compareDays(pause.from, day) <= 0 && compareDays(day, pause.until) < 0)
}

/**
 * Der an `day` gültige Rhythmus einer Quest.
 *
 * Jeder Eintrag in `scheduleHistory` gilt für die Tage **vor** seinem `until` (und ab dem `until` des
 * vorherigen Eintrags); ab dem letzten `until` gilt `habit.schedule`. Maßgeblich ist also der Eintrag mit
 * dem kleinsten `until > day` – das Ergebnis hängt damit nicht von der gespeicherten Reihenfolge ab
 * (bei gleichem `until` gewinnt der erste Eintrag). Ohne Verlauf ist es immer `habit.schedule`.
 */
export function scheduleOn(habit: Pick<Habit, 'schedule' | 'scheduleHistory'>, day: DayKey): Schedule {
  const history = habit.scheduleHistory
  if (history === undefined) return habit.schedule
  let schedule = habit.schedule
  let validUntil: DayKey | undefined
  for (const entry of history) {
    if (compareDays(day, entry.until) >= 0) continue
    if (validUntil === undefined || compareDays(entry.until, validUntil) < 0) {
      schedule = entry.schedule
      validUntil = entry.until
    }
  }
  return schedule
}

/**
 * Beschreiben zwei Rhythmen dasselbe? Wochentage werden dabei als Menge verglichen
 * (Reihenfolge und Doppelte spielen keine Rolle).
 */
export function sameSchedule(a: Schedule, b: Schedule): boolean {
  switch (a.type) {
    case 'daily':
      return b.type === 'daily'
    case 'weekdays': {
      if (b.type !== 'weekdays') return false
      const left = new Set(a.days)
      const right = new Set(b.days)
      return left.size === right.size && [...left].every((day) => right.has(day))
    }
    case 'weekly':
      return b.type === 'weekly' && a.times === b.times
  }
}

/**
 * Normalisierte Pausen: leere Zeiträume (`from ≥ until`) entfallen, der Rest wird nach `from` sortiert
 * und überlappende oder direkt aneinandergrenzende Zeiträume werden zusammengefasst.
 * Gibt immer neue Objekte zurück; die Eingabe bleibt unverändert.
 */
export function mergePauses(pauses: readonly HabitPause[]): HabitPause[] {
  const sorted = pauses
    .filter((pause) => compareDays(pause.from, pause.until) < 0)
    .map((pause) => ({ from: pause.from, until: pause.until }))
    .sort((a, b) => compareDays(a.from, b.from))
  const merged: HabitPause[] = []
  for (const pause of sorted) {
    const last = merged.at(-1)
    if (last !== undefined && compareDays(pause.from, last.until) <= 0) {
      if (compareDays(pause.until, last.until) > 0) last.until = pause.until
    } else {
      merged.push(pause)
    }
  }
  return merged
}

/**
 * Ist dieser Wochentag laut Rhythmus ein fester Plantag?
 * daily: immer · weekdays: wenn enthalten · weekly: nie (Wochenquests haben keine festen Tage).
 */
export function isScheduledWeekday(schedule: Schedule, weekday: IsoWeekday): boolean {
  switch (schedule.type) {
    case 'daily':
      return true
    case 'weekdays':
      return schedule.days.includes(weekday)
    case 'weekly':
      return false
  }
}

/**
 * Aktiv UND laut Rhythmus dieses Tages (`scheduleOn`) planmäßig fällig (daily, oder weekdays mit passendem
 * Wochentag). War die Quest an dem Tag eine Wochenquest: false.
 *
 * Phase 2b: An Ruhetagen bzw. im Urlaub (`restDays`, z. B. aus `restDaySet(data.restPeriods)` in `hp.ts`) ist
 * keine Quest Pflicht. Sichtbar bleiben die Quests trotzdem (`isVisibleOn`) – sie können freiwillig erledigt
 * werden und bringen XP.
 */
export function isRequiredOn(habit: HabitTimeline, day: DayKey, restDays?: ReadonlySet<DayKey>): boolean {
  if (restDays !== undefined && restDays.has(day)) return false
  const schedule = scheduleOn(habit, day)
  if (schedule.type === 'weekly') return false
  return isActiveOn(habit, day) && isScheduledWeekday(schedule, isoWeekday(day))
}

/**
 * Aktiv UND (planmäßig fällig ODER an diesem Tag eine Wochenquest). Ruhetage ändern daran nichts: Die Quests
 * bleiben sichtbar und können freiwillig erledigt werden (nur Pflicht sind sie dann nicht, `isRequiredOn`).
 */
export function isVisibleOn(habit: HabitTimeline, day: DayKey): boolean {
  if (!isActiveOn(habit, day)) return false
  const schedule = scheduleOn(habit, day)
  return schedule.type === 'weekly' || isScheduledWeekday(schedule, isoWeekday(day))
}

/**
 * XP für eine erledigte Quest dieser Schwierigkeit (immer aktuell aus `BALANCING`).
 * Eine unbekannte Schwierigkeit (kaputte Daten, Daten einer neueren App-Version) gibt 0 XP: Ein
 * `undefined` würde sonst alle XP-Summen zu NaN machen und den ganzen Spielstand auf Level 1 werfen.
 */
export function questXp(difficulty: Difficulty): number {
  return Object.hasOwn(BALANCING.questXp, difficulty) ? BALANCING.questXp[difficulty] : 0
}

/**
 * Relative Toleranz für Zielvergleiche. Messwerte entstehen oft durch wiederholtes Addieren von
 * Schritten, und Gleitkomma-Rauschen macht daraus z. B. 10 × 0,2 = 1,9999999999999998 statt 2.
 * Die Toleranz liegt weit unter jeder sinnvollen Eingabegenauigkeit (Ziel 2 L → 0,000000002 L).
 */
const TARGET_TOLERANCE = 1e-9

/**
 * Ist `current ≥ target` (bis auf Gleitkomma-Rauschen)? Gemeinsame Grundlage für erledigte Quests
 * und abgeschlossene Kapitel, damit alle Zielvergleiche gleich entscheiden.
 */
export function reachesTarget(current: number, target: number): boolean {
  return current >= target - TARGET_TOLERANCE * Math.max(1, Math.abs(target))
}

/** Erledigt ⇔ erfasster Wert ≥ Zielwert (tolerant gegenüber Gleitkomma-Rauschen, siehe `reachesTarget`). */
export function isDone(c: Pick<Completion, 'value' | 'target'>): boolean {
  return reachesTarget(c.value, c.target)
}

/** Aktueller Tageszielwert einer Quest (Abhak-Quest: 1). */
export function habitTarget(habit: Habit): number {
  return habit.measure?.target ?? 1
}

/**
 * Anzahl der erledigten Tage in der ISO-Woche (Mo–So), in der `day` liegt.
 * Grundlage für den Wochenfortschritt von Wochenquests ("2 / 3 diese Woche").
 */
export function doneDaysInWeek(doneDays: ReadonlySet<DayKey>, day: DayKey): number {
  const monday = startOfWeek(day)
  let count = 0
  for (let offset = 0; offset < 7; offset++) {
    if (doneDays.has(addDays(monday, offset))) count++
  }
  return count
}

/** Lesbarer Rhythmus, z. B. "Täglich", "Mo, Mi, Fr", "3× pro Woche". */
export function describeSchedule(schedule: Schedule): string {
  switch (schedule.type) {
    case 'daily':
      return 'Täglich'
    case 'weekdays': {
      // Doppelte entfernen und nach Wochentag sortieren, unabhängig von der gespeicherten Reihenfolge.
      const days = [...new Set(schedule.days)].sort((a, b) => a - b)
      if (days.length === 0) return 'Keine Tage'
      if (days.length === 7) return 'Täglich'
      return days.map((day) => WEEKDAY_SHORT[day]).join(', ')
    }
    case 'weekly':
      return `${schedule.times}× pro Woche`
  }
}
