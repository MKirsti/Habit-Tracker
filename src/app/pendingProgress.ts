import { unrecordedVictories } from '../domain/combat/boss'
import { unrecordedChests } from '../domain/combat/chests'
import type { AchievementUnlock, BossVictory, Chest, DayKey, GameData, GameState } from '../domain/types'

/*
 * Reine Auswertung für den `ProgressRecorder`: Was meldet der Spielzustand als erreicht, ist aber noch nicht
 * dauerhaft gespeichert? (Eigene Datei, damit die Komponenten-Datei nur Komponenten exportiert.)
 */

/** Noch nicht gespeicherter Fortschritt – jede Liste kann leer sein. */
export interface PendingProgress {
  achievementUnlocks: AchievementUnlock[]
  bossVictories: BossVictory[]
  chests: Chest[]
}

/** Schlüssel eines Eintrags (eindeutig über alle drei Arten): `a:<Erfolg>`, `v:<Montag>`, `c:<Truhe>`. */
export function achievementKey(id: string): string {
  return `a:${id}`
}
export function victoryKey(weekStart: DayKey): string {
  return `v:${weekStart}`
}
export function chestKey(id: string): string {
  return `c:${id}`
}

/**
 * Was der Spielzustand als erreicht meldet, aber noch nicht dauerhaft gespeichert ist:
 * - Erfolge: freigeschaltet, aber ohne gespeicherten `AchievementUnlock` (Tag laut Engine, sonst heute);
 * - Boss-Siege: laufende Woche bzw. Vorwoche besiegt, aber noch ohne gespeicherten Sieg (`unrecordedVictories`);
 * - Truhen: in `state.chests`, aber nicht in `data.chests` (`unrecordedChests`) – Inhalt wie beim Fund festgelegt.
 * Ohne Held: nichts.
 */
export function pendingProgress(
  data: Pick<GameData, 'profile' | 'achievementUnlocks' | 'bossVictories' | 'chests'>,
  state: Pick<GameState, 'achievements' | 'bosses' | 'chests'>,
  today: DayKey,
): PendingProgress {
  if (data.profile === undefined) return { achievementUnlocks: [], bossVictories: [], chests: [] }
  const storedAchievements = new Set((data.achievementUnlocks ?? []).map((unlock) => unlock.id))
  return {
    achievementUnlocks: state.achievements
      .filter((achievement) => achievement.unlocked && !storedAchievements.has(achievement.definition.id))
      .map((achievement) => ({ id: achievement.definition.id, day: achievement.unlockedDay ?? today })),
    bossVictories: unrecordedVictories([state.bosses.current, state.bosses.previous], data.bossVictories),
    chests: unrecordedChests(state.chests, data.chests),
  }
}

/** Alle Schlüssel des offenen Fortschritts (für die Neuplanung und die Doppel-Sperre). */
export function pendingKeys(pending: PendingProgress): string[] {
  return [
    ...pending.achievementUnlocks.map((unlock) => achievementKey(unlock.id)),
    ...pending.bossVictories.map((victory) => victoryKey(victory.weekStart)),
    ...pending.chests.map((chest) => chestKey(chest.id)),
  ]
}

/** Schlüssel von allem, was schon gespeichert ist. */
export function storedKeys(data: Pick<GameData, 'achievementUnlocks' | 'bossVictories' | 'chests'>): Set<string> {
  return new Set([
    ...(data.achievementUnlocks ?? []).map((unlock) => achievementKey(unlock.id)),
    ...(data.bossVictories ?? []).map((victory) => victoryKey(victory.weekStart)),
    ...(data.chests ?? []).map((chest) => chestKey(chest.id)),
  ])
}
