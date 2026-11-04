import { describe, expect, it } from 'vitest'
import { DIFFICULTIES } from '../balancing'
import type { AttributeId, Difficulty } from '../types'
import { attackDamage, isAttributeId, validAttributeLevel } from './damage'

function damage(
  difficulty: Difficulty,
  attribute: AttributeId,
  level: number,
  bonus: number | undefined,
  weakness = false,
): number {
  return attackDamage({
    difficulty,
    attribute,
    levels: { [attribute]: level },
    classBonus: bonus === undefined ? {} : { [attribute]: bonus },
    weakness,
  })
}

describe('attackDamage – Beispiele aus dem Vertrag', () => {
  it('mittlere Quest, Stärke-Level 6, Krieger (+20 %): 20 × 1,5 × 1,2 = 36', () => {
    expect(damage('medium', 'strength', 6, 0.2)).toBe(36)
  })

  it('schwere Quest, gleicher Held: 40 × 1,5 × 1,2 = 72', () => {
    expect(damage('hard', 'strength', 6, 0.2)).toBe(72)
  })

  it('Weisheit Level 4 ohne Klassen-Bonus: 20 × 1,3 = 26', () => {
    expect(damage('medium', 'wisdom', 4, undefined)).toBe(26)
  })

  it('gegen die Schwäche × 1,5: 36 → 54', () => {
    expect(damage('medium', 'strength', 6, 0.2, true)).toBe(54)
  })

  it('Level 1 ohne Bonus = die Quest-XP', () => {
    expect(DIFFICULTIES.map((difficulty) => damage(difficulty, 'intellect', 1, undefined))).toEqual([10, 20, 40, 80])
  })

  it('Hybrid-Bonus +10 %: 20 × 1,2 × 1,1 = 26,4 → 26', () => {
    expect(damage('medium', 'charisma', 3, 0.1)).toBe(26)
  })
})

describe('attackDamage – Rundung & kaputte Daten', () => {
  it('rundet kaufmännisch ohne Gleitkomma-Rauschen: 10 × 1,1 × 1,5 = 16,5 → 17', () => {
    expect(damage('easy', 'vitality', 2, undefined, true)).toBe(17)
    // 10 × 1,5 × 1,1 × 1,5 = 24,75 → 25
    expect(damage('easy', 'vitality', 6, 0.1, true)).toBe(25)
  })

  it('der Klassen-Bonus gilt nur für das eigene Attribut', () => {
    expect(
      attackDamage({ difficulty: 'medium', attribute: 'wisdom', levels: { wisdom: 1 }, classBonus: { strength: 0.2 }, weakness: false }),
    ).toBe(20)
  })

  it('unbekannte Schwierigkeit → 0, unbekanntes Attribut → ohne Level und Bonus', () => {
    expect(damage('legendary' as Difficulty, 'strength', 6, 0.2)).toBe(0)
    expect(
      attackDamage({
        difficulty: 'medium',
        attribute: 'luck' as AttributeId,
        levels: { strength: 9 },
        classBonus: { strength: 0.2 },
        weakness: false,
      }),
    ).toBe(20)
  })

  it('ungültige Level zählen als 1, fehlendes Level ebenso', () => {
    expect(damage('medium', 'strength', Number.NaN, undefined)).toBe(20)
    expect(damage('medium', 'strength', -3, undefined)).toBe(20)
    expect(attackDamage({ difficulty: 'medium', attribute: 'strength', levels: {}, classBonus: {}, weakness: false })).toBe(20)
    expect(validAttributeLevel(4.9)).toBe(4)
    expect(validAttributeLevel(undefined)).toBe(1)
  })

  it('negative oder kaputte Boni zählen nicht', () => {
    expect(damage('medium', 'strength', 1, -0.5)).toBe(20)
    expect(damage('medium', 'strength', 1, Number.NaN)).toBe(20)
  })

  it('bleibt auch bei absurd hohen Leveln endlich und ganzzahlig', () => {
    const value = damage('epic', 'strength', 999, 0.2, true)
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBe(Math.round(80 * (1 + 0.1 * 998) * 1.2 * 1.5))
  })

  it('isAttributeId', () => {
    expect(isAttributeId('strength')).toBe(true)
    expect(isAttributeId('luck')).toBe(false)
    expect(isAttributeId(undefined)).toBe(false)
  })
})
