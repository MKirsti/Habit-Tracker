/**
 * Wann ist eine Quest aktiv, fällig bzw. sichtbar – und wie weit ist eine Wochenquest?
 *
 * Begriffe:
 * - aktiv:    zwischen `createdDay` (inklusive) und `archivedDay` (exklusive)
 * - Pflicht:  aktiv und planmäßig an genau diesem Tag fällig (daily, oder weekdays mit passendem Wochentag).
 *             Nur Pflicht-Quests zählen für den "Perfekten Tag". Wochenquests sind nie Pflicht.
 * - sichtbar: Pflicht-Quests plus alle aktiven Wochenquests (die an jedem Tag der Woche erledigt werden können)
 */
import { BALANCING } from './balancing'
import { addDays, compareDays, isoWeekday, startOfWeek } from './dates'
import type { Completion, DayKey, Difficulty, Habit, IsoWeekday, Schedule } from './types'

/** Kurznamen der Wochentage, Index = ISO-Wochentag (Index 0 ungenutzt). */
const WEEKDAY_SHORT = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

/** createdDay ≤ day und (kein archivedDay oder day < archivedDay). */
export function isActiveOn(habit: Habit, day: DayKey): boolean {
  if (compareDays(habit.createdDay, day) > 0) return false
  return habit.archivedDay === undefined || compareDays(day, habit.archivedDay) < 0
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

/** Aktiv UND planmäßig fällig (daily, oder weekdays mit passendem Wochentag). Wochenquests: false. */
export function isRequiredOn(habit: Habit, day: DayKey): boolean {
  if (habit.schedule.type === 'weekly') return false
  return isActiveOn(habit, day) && isScheduledWeekday(habit.schedule, isoWeekday(day))
}

/** Aktiv UND (Pflicht an diesem Tag ODER Wochenquest). */
export function isVisibleOn(habit: Habit, day: DayKey): boolean {
  return habit.schedule.type === 'weekly' ? isActiveOn(habit, day) : isRequiredOn(habit, day)
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
