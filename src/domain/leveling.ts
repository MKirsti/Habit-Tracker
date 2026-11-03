/**
 * XP-Kurven, Level und Ränge.
 *
 * Level beginnen bei 1 mit 0 XP. Für den Schritt von Level n auf n+1 werden
 * `round(base × n^exponent)` XP benötigt (Werte aus `BALANCING`). Beispiel Charakter:
 * 1→2: 100 XP · 2→3: 283 XP · 5→6: 1.118 XP · 10→11: 3.162 XP.
 */
import { BALANCING, RANKS } from './balancing'
import type { LevelInfo } from './types'

/** XP für den Schritt von Level `level` auf `level + 1` gemäß einer Kurve. */
function curveCost(curve: { readonly base: number; readonly exponent: number }, level: number): number {
  return Math.round(curve.base * Math.pow(level, curve.exponent))
}

/** XP, die ein Charakter auf Level `level` braucht, um Level `level + 1` zu erreichen. */
export function xpToNextLevel(level: number): number {
  return curveCost(BALANCING.levelCurve, level)
}

/** XP, die ein Attribut auf Level `level` braucht, um Level `level + 1` zu erreichen (flachere Kurve). */
export function xpToNextAttributeLevel(level: number): number {
  return curveCost(BALANCING.attributeCurve, level)
}

/**
 * Läuft die Level von 1 aufwärts ab, solange die verbleibenden XP für den nächsten Schritt reichen.
 * Die Schleife ist durch `BALANCING.maxLevel` begrenzt (bei realistischen XP-Mengen wenige Dutzend Schritte).
 */
function levelFromCurve(totalXp: number, costOf: (level: number) => number): LevelInfo {
  // Negative oder kaputte Werte (NaN/Infinity) zählen als 0 XP.
  const total = Number.isFinite(totalXp) && totalXp > 0 ? totalXp : 0
  let level = 1
  let remaining = total
  while (level < BALANCING.maxLevel) {
    const cost = costOf(level)
    if (remaining < cost) break
    remaining -= cost
    level++
  }
  const xpForNextLevel = costOf(level)
  // Auf dem Maximallevel können überzählige XP anfallen – der Balken bleibt dann einfach voll.
  const progress = xpForNextLevel > 0 ? Math.min(1, Math.max(0, remaining / xpForNextLevel)) : 1
  return { level, totalXp: total, xpIntoLevel: remaining, xpForNextLevel, progress }
}

/** Charakter-Level aus Gesamt-XP. Beispiel: 100 XP → Level 2 mit 0 XP ins Level. */
export function levelFromXp(totalXp: number): LevelInfo {
  return levelFromCurve(totalXp, xpToNextLevel)
}

/** Attribut-Level aus Gesamt-XP des Attributs. */
export function attributeLevelFromXp(totalXp: number): LevelInfo {
  return levelFromCurve(totalXp, xpToNextAttributeLevel)
}

/** Rang-Titel: der Rang mit dem höchsten `minLevel ≤ level` (unterhalb des ersten Rangs: der erste Rang). */
export function rankForLevel(level: number): string {
  let best: { minLevel: number; title: string } | undefined
  for (const rank of RANKS) {
    if (rank.minLevel <= level && (best === undefined || rank.minLevel > best.minLevel)) best = rank
  }
  return (best ?? RANKS[0]).title
}
