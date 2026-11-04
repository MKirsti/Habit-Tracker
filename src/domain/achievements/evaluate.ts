/**
 * Auswertung der Erfolge (Phase 2a) – rein, ohne Bezug auf die konkreten Definitionen.
 *
 * Die Engine berechnet die Kennzahlen (`AchievementStats`) und reicht sie mit den Definitionen
 * (`ACHIEVEMENTS` aus `definitions.ts`) und den gespeicherten Freischaltungen hier herein. Ein Erfolg ist
 * freigeschaltet, wenn er gespeichert ist **oder** jetzt `current ≥ target` gilt. Einmal freigeschaltet bleibt
 * freigeschaltet – auch wenn ein Wert später sinkt (z. B. weniger aktive Kampagnen oder eine gelöschte Quest).
 * Dafür speichert die App neue Freischaltungen dauerhaft (`AchievementRecorder` → `recordAchievementUnlocks`).
 */
import { compareDays, diffDays, isValidDayKey } from '../dates'
import type { AchievementDefinition, AchievementState, AchievementStats, AchievementUnlock, DayKey } from '../types'

/** Ab so vielen Tagen ohne erledigte Quest zählt die nächste Erledigung als Rückkehr („Phönix“). */
export const COMEBACK_GAP_DAYS = 7

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

/**
 * Alle Erfolge in Definitions-Reihenfolge.
 * - `unlocked` = gespeicherte Freischaltung oder `current ≥ target` jetzt.
 * - `unlockedDay` = gespeicherter Tag (bei mehreren Einträgen derselben ID der früheste), sonst `today`.
 * - `progress` = min(current / target, 1) (Ziel ≤ 0: 1, sobald erreicht).
 * Gespeicherte Freischaltungen unbekannter IDs (z. B. entfernte Erfolge) werden ignoriert.
 */
export function evaluateAchievements(
  definitions: readonly AchievementDefinition[],
  stats: AchievementStats,
  unlocks: readonly AchievementUnlock[],
  today: DayKey,
): AchievementState[] {
  const stored = new Map<string, DayKey>()
  for (const unlock of unlocks) {
    const known = stored.get(unlock.id)
    if (known === undefined || compareDays(unlock.day, known) < 0) stored.set(unlock.id, unlock.day)
  }

  return definitions.map((definition) => {
    const raw = definition.progress(stats)
    // Kaputte Werte (NaN, ∞) dürfen weder freischalten noch die Anzeige vergiften.
    const current = finiteOr(raw.current, 0)
    const target = finiteOr(raw.target, Number.POSITIVE_INFINITY)
    const reached = current >= target
    const storedDay = stored.get(definition.id)
    const unlocked = storedDay !== undefined || reached
    const progress = target > 0 ? Math.min(Math.max(current / target, 0), 1) : reached ? 1 : 0
    const state: AchievementState = {
      definition,
      unlocked,
      current,
      target: raw.target,
      progress: Number.isFinite(progress) ? progress : 0,
    }
    if (unlocked) state.unlockedDay = storedDay ?? today
    return state
  })
}

/** Gold aus Erfolgen: Summe der `goldReward` aller freigeschalteten (ungültige oder negative Werte zählen 0). */
export function achievementGold(achievements: readonly AchievementState[]): number {
  let gold = 0
  for (const achievement of achievements) {
    const reward = achievement.definition.goldReward
    if (achievement.unlocked && Number.isFinite(reward) && reward > 0) gold += reward
  }
  return gold
}

/**
 * Wie oft nach mindestens `COMEBACK_GAP_DAYS` Tagen ohne erledigte Quest wieder eine erledigt wurde.
 * Gezählt ab dem ersten aktiven Tag: Die Zeit vor der allerersten Erledigung ist keine Pause.
 * Beispiel: erledigt am 1. und wieder am 9. (2.–8. = 7 Tage ohne) → 1 Rückkehr.
 * @param activeDays Tage mit mindestens einer erledigten Quest (beliebige Reihenfolge, Doppelte erlaubt).
 */
export function countComebacks(activeDays: Iterable<DayKey>): number {
  const days = [...new Set(activeDays)].filter(isValidDayKey).sort(compareDays)
  let comebacks = 0
  for (let i = 1; i < days.length; i++) {
    if (diffDays(days[i - 1], days[i]) - 1 >= COMEBACK_GAP_DAYS) comebacks++
  }
  return comebacks
}
