/**
 * Streak-Bonus (Phase 2a): Wer eine Serie hält, bekommt mehr XP.
 *
 * Jede erledigte Quest-Erledigung bringt `round(questXp × (1 + bonus))` XP (Charakter **und** Attribut) mit
 * `bonus = min(streakBonusPerStep × n, streakBonusMax)`. `n` ist die Länge der Serie unmittelbar **vor** dem Tag
 * bzw. vor der Woche (`streakRunsBefore` in `streaks.ts`): Tag 1 einer Serie +0 %, Tag 2 +5 %, …, ab Tag 11 +50 %.
 * Gilt rückwirkend für den ganzen Verlauf (siehe ARCHITECTURE.md „Streak-Bonus“).
 *
 * Gerechnet wird in Basispunkten (Hundertstel-Prozent): So ergibt z. B. 10 × 1,15 exakt 11,5 und wird stabil
 * auf 12 gerundet – mit Gleitkomma-Anteilen käme mal 11,499…, mal 11,500… heraus.
 */
import { BALANCING } from './balancing'
import { streakRunsBefore } from './streaks'
import type { DayKey, Habit } from './types'

const BASIS_POINTS = 10_000

function toBasisPoints(fraction: number): number {
  return Math.round(fraction * BASIS_POINTS)
}

/**
 * Streak-Bonus als Anteil (0 … `BALANCING.streakBonusMax`) bei einer Serie von `run` Schritten vor dem Tag bzw.
 * der Woche: `min(streakBonusPerStep × run, streakBonusMax)`. Ungültige Werte (negativ, NaN) geben 0.
 */
export function streakBonusForRun(run: number): number {
  if (!(run > 0)) return 0
  const steps = Number.isFinite(run) ? Math.floor(run) : Number.MAX_SAFE_INTEGER
  const bonus = Math.min(toBasisPoints(BALANCING.streakBonusPerStep) * steps, toBasisPoints(BALANCING.streakBonusMax))
  return bonus / BASIS_POINTS
}

/** XP inklusive Streak-Bonus: `round(baseXp × (1 + bonus))`, z. B. 10 XP bei +15 % → 12. */
export function xpWithStreakBonus(baseXp: number, bonus: number): number {
  return Math.round((baseXp * (BASIS_POINTS + toBasisPoints(bonus))) / BASIS_POINTS)
}

/**
 * Streak-Bonus einer Quest an jedem der Tage `days` (beliebige Reihenfolge, `ergebnis[i]` gehört zu `days[i]`).
 * @param doneDays Tage, an denen die Quest erledigt war (value ≥ target).
 */
export function streakBonusesOn(habit: Habit, doneDays: ReadonlySet<DayKey>, days: readonly DayKey[]): number[] {
  return streakRunsBefore(habit, doneDays, days).map(streakBonusForRun)
}
