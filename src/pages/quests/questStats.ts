/**
 * Kennzahlen für die Quest-Verwaltung – einmal pro Datenstand über alle Erledigungen berechnet.
 */
import { isDone, questXp } from '../../domain/schedule'
import type { Completion, DayKey, Habit, Streak } from '../../domain/types'
import { computeStreak } from '../../domain/streaks'

export interface HabitStats {
  /** Tage (≤ heute), an denen die Quest erledigt war. */
  doneDays: Set<DayKey>
  /** Summe der Quest-XP aus allen erledigten Tagen (≤ heute). */
  xp: number
}

const EMPTY_STATS: Readonly<HabitStats> = { doneDays: new Set(), xp: 0 }

/** Indiziert die Erledigungen einmal: Quest-ID → erledigte Tage und verdiente Quest-XP. */
export function buildHabitStats(completions: readonly Completion[], today: DayKey): Map<string, HabitStats> {
  const stats = new Map<string, HabitStats>()
  for (const completion of completions) {
    // DayKeys ('YYYY-MM-DD') lassen sich als Text vergleichen – und kaputte Werte werfen dabei nicht.
    if (!isDone(completion) || !(completion.day <= today)) continue
    let entry = stats.get(completion.habitId)
    if (!entry) stats.set(completion.habitId, (entry = { doneDays: new Set(), xp: 0 }))
    // Pro Quest und Tag zählt höchstens ein Eintrag (wie in der Engine).
    if (entry.doneDays.has(completion.day)) continue
    entry.doneDays.add(completion.day)
    entry.xp += questXp(completion.difficulty)
  }
  return stats
}

export function statsFor(stats: ReadonlyMap<string, HabitStats>, habitId: string): Readonly<HabitStats> {
  return stats.get(habitId) ?? EMPTY_STATS
}

/** Aktuelle und beste Serie einer Quest zum heutigen Tag. */
export function habitStreak(habit: Habit, stats: ReadonlyMap<string, HabitStats>, today: DayKey): Streak {
  return computeStreak(habit, statsFor(stats, habit.id).doneDays, today)
}

/** Ist die Quest heute (oder schon früher) archiviert? */
export function isArchivedOn(habit: Habit, today: DayKey): boolean {
  return habit.archivedDay !== undefined && habit.archivedDay <= today
}

/** "1 Tag", "5 Tage", "1 Woche", "3 Wochen". */
export function formatStreakUnit(count: number, unit: Streak['unit']): string {
  if (unit === 'week') return count === 1 ? 'Woche' : 'Wochen'
  return count === 1 ? 'Tag' : 'Tage'
}
