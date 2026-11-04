/**
 * Schaden eines Angriffs (Phase 3a, ARCHITECTURE.md „Schaden“) – rein.
 *
 * `damage = round(questXp(difficulty) × (1 + attributeBonusPerLevel × (level − 1)) × (1 + classBonus[attr] ?? 0)
 *           × (weakness ? weaknessMultiplier : 1))`
 *
 * `level` = Attribut-Level der Woche (`HeroClassState.attributeLevels`), **ohne** Streak-Bonus (der bleibt XP-Sache).
 * Beispiele: mittlere Quest (20 XP) mit Stärke-Level 6 als Krieger (+20 %) → 20 × 1,5 × 1,2 = 36; schwere (40) → 72;
 * Weisheit Level 4 ohne Klassen-Bonus → 20 × 1,3 = 26; gegen die Schwäche jeweils × 1,5.
 *
 * Gerechnet wird in Basispunkten (wie beim Streak-Bonus): So wird z. B. 10 × 1,1 × 1,5 = 16,5 stabil zu 17 gerundet,
 * statt je nach Gleitkomma-Rauschen mal 16, mal 17.
 */
import { ATTRIBUTE_IDS } from '../attributes'
import { BALANCING } from '../balancing'
import { questXp } from '../schedule'
import type { AttributeId, Difficulty } from '../types'

const BASIS_POINTS = 10_000

function toBasisPoints(fraction: number): number {
  return Math.round(fraction * BASIS_POINTS)
}

/** Ist `value` eine der sechs Attribut-IDs? (Kaputte Daten haben manchmal unbekannte Attribute.) */
export function isAttributeId(value: unknown): value is AttributeId {
  return typeof value === 'string' && (ATTRIBUTE_IDS as readonly string[]).includes(value)
}

/** Gültiges Attribut-Level (ganzzahlig, 1 … maxLevel); Unsinn zählt als 1. */
export function validAttributeLevel(level: number | undefined): number {
  if (level === undefined || !Number.isFinite(level) || level < 1) return 1
  return Math.min(BALANCING.maxLevel, Math.floor(level))
}

/** Faktor in Basispunkten für das Attribut-Level: +10 % je Level über 1 (Level 1 → 10.000, Level 6 → 15.000). */
function levelBasisPoints(level: number): number {
  return BASIS_POINTS + toBasisPoints(BALANCING.combat.attributeBonusPerLevel) * (validAttributeLevel(level) - 1)
}

/** Faktor in Basispunkten für den Klassen-Bonus (fehlt/ungültig → kein Bonus). */
function classBasisPoints(bonus: number | undefined): number {
  return bonus !== undefined && Number.isFinite(bonus) && bonus > 0 ? BASIS_POINTS + toBasisPoints(bonus) : BASIS_POINTS
}

export interface AttackInput {
  /** Schwierigkeit (Momentaufnahme der Erledigung bzw. die der Nebenquest/Quest). */
  difficulty: Difficulty
  attribute: AttributeId
  /** Attribut-Level der Woche (`HeroClassState.attributeLevels`). */
  levels: Readonly<Partial<Record<AttributeId, number>>>
  /** Klassen-Bonus der Woche (`HeroClassState.classBonus`). */
  classBonus: Readonly<Partial<Record<AttributeId, number>>>
  /** Trifft die Schwäche des Bosses (× `weaknessMultiplier`). */
  weakness: boolean
}

/**
 * Schaden einer erledigten Quest bzw. Nebenquest (ganze Zahl ≥ 0). Unbekannte Schwierigkeit → 0 (wie bei den XP),
 * unbekanntes Attribut → ohne Level- und Klassen-Bonus.
 */
export function attackDamage(input: AttackInput): number {
  const xp = questXp(input.difficulty)
  if (!(xp > 0)) return 0
  const known = isAttributeId(input.attribute)
  const level = known ? levelBasisPoints(input.levels[input.attribute] ?? 1) : BASIS_POINTS
  const klass = known ? classBasisPoints(input.classBonus[input.attribute]) : BASIS_POINTS
  const weakness = input.weakness ? toBasisPoints(BALANCING.combat.weaknessMultiplier) : BASIS_POINTS
  // Ganzzahlig: xp × level × klass × weakness / 10.000³, kaufmännisch gerundet (wie Math.round).
  const numerator = xp * level * klass * weakness
  const denominator = BASIS_POINTS * BASIS_POINTS * BASIS_POINTS
  // Erst jenseits jedes realistischen Levels (Attribut-Level ≈ 300) wäre die Ganzzahl-Rechnung ungenau.
  if (2 * numerator > Number.MAX_SAFE_INTEGER) return Math.round(numerator / denominator)
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}
